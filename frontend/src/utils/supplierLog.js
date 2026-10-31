/**
 * Builds the supplier-facing Logs: one chronological list combining
 *  - Invoice  : milestones with the real date each happened (uploaded, approved, booked)
 *  - Payment  : payment completed (with UTR) and rejected/deleted invoices (with reason)
 *  - Query    : the vendor code's own query history, from GET /v1/tickets/supplier-activity-log
 * Only things a supplier is meant to see: no internal notes, assignees or approver names.
 */

export const LOG_TYPES = ['Invoice', 'Payment', 'Query'];

/** 'YYYY-MM-DD' (what the invoice API sends) as local midnight, or null. */
function dayStart(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// One formatter each: toLocaleDateString builds a new one per call, which adds up over large logs.
const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const DAY_TIME_FORMAT = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function formatDay(date) {
  return DAY_FORMAT.format(date);
}

export function formatDayTime(date) {
  return DAY_TIME_FORMAT.format(date);
}

/** Gives every row a key that is unique within the list. The source data can repeat an invoice and
 *  PO item (the same line twice), which would otherwise give two rows the same key and leave stale
 *  rows on screen when a filter changes. The repeat gets a numbered suffix; the first keeps its key. */
export function withUniqueKeys(rows) {
  const seen = new Map();
  return rows.map((row) => {
    const n = seen.get(row.key) || 0;
    seen.set(row.key, n + 1);
    return n === 0 ? row : { ...row, key: `${row.key}#${n}` };
  });
}

function invoiceRow(inv, kind, event, rawDate, detail = '') {
  const when = dayStart(rawDate);
  if (!when) return null;
  return {
    key: `${inv.no}|${inv.poItem ?? ''}|${event}`,
    when, hasTime: false, type: kind, event, detail,
    invoiceNo: inv.no, po: inv.po, invoice: inv,
    vcode: inv.vcode, channel: inv.channel, performedBy: 'System',
  };
}

export function invoiceLogRows(invoices) {
  const rows = [];
  invoices.forEach((inv) => {
    const dueDate = dayStart(inv.sap?.net_due_date);
    rows.push(
      invoiceRow(inv, 'Invoice', 'Invoice uploaded', inv.rawUploadDate === undefined ? inv.rawDate : inv.rawUploadDate),
      invoiceRow(inv, 'Invoice', 'Invoice approved', inv.workflow?.final_approval_date),
      invoiceRow(
        inv, 'Invoice', 'Booked in SAP',
        inv.sap?.miro_booking_date || inv.sap?.document_date || inv.sap?.posting_date,
        dueDate ? `Payment due ${formatDay(dueDate)}` : '',
      ),
    );

    if (inv.status === 'Paid') {
      const utr = inv.utr && inv.utr !== '-' ? `UTR ${inv.utr}` : '';
      const parts = [utr, inv.amount && inv.amount !== '-' ? inv.amount : '', inv.shortPayReason ? `Short payment: ${inv.shortPayReason}` : '']
        .filter(Boolean);
      rows.push(invoiceRow(inv, 'Payment', 'Payment completed', inv.sap?.clearing_date, parts.join(' · ')));
    } else if (inv.channel !== 'poPortal' && (inv.status === 'Rejected' || ['Deleted', 'Entry Deleted'].includes(inv.status))) {
      rows.push(invoiceRow(
        inv, 'Payment', inv.status === 'Rejected' ? 'Invoice rejected' : 'Invoice deleted',
        inv.rawDate, inv.shortPayReason || '',
      ));
    }
  });
  return rows.filter(Boolean);
}

/** Query activity from the API, restricted to the invoices in scope (e.g. the chosen FY). */
export function queryLogRows(entries, invoices, scoped = true) {
  const byNo = new Map(invoices.map((inv) => [inv.no, inv]));
  return (entries || [])
    .filter((entry) => !scoped || !entry.invoice_no || byNo.has(entry.invoice_no))
    .map((entry) => {
      const when = new Date(entry.created_at);
      if (Number.isNaN(when.getTime())) return null;
      const inv = byNo.get(entry.invoice_no);
      return {
        key: `query|${entry.id}`,
        when, hasTime: true, type: 'Query', event: entry.event,
        detail: [entry.ticket_no, entry.subject].filter(Boolean).join(' · '),
        invoiceNo: entry.invoice_no || '-', po: inv?.po || '-', invoice: inv,
        ticketId: entry.ticket_id,
      };
    })
    .filter(Boolean);
}

/** Staff view of query activity (GET /v1/tickets/internal-activity-log): every event on the tickets the
 *  signed-in team member may see, with who did it. Limited to `invoices` when a scope is given. */
export function staffQueryLogRows(entries, invoices, scoped = true) {
  const byNo = new Map(invoices.map((inv) => [inv.no, inv]));
  return (entries || [])
    .filter((entry) => !scoped || !entry.invoice_no || byNo.has(entry.invoice_no))
    .map((entry) => {
      const when = new Date(entry.created_at);
      if (Number.isNaN(when.getTime())) return null;
      const inv = byNo.get(entry.invoice_no);
      return {
        key: `query|${entry.id}`,
        when, hasTime: true, type: 'Query', event: entry.event,
        detail: [entry.ticket_no, entry.subject, entry.detail].filter(Boolean).join(' · '),
        invoiceNo: entry.invoice_no || '-', po: inv?.po || '-', invoice: inv,
        vcode: entry.vendor_code || inv?.vcode || '-', channel: entry.channel || inv?.channel,
        performedBy: entry.performed_by || '-', ticketId: entry.ticket_id,
      };
    })
    .filter(Boolean);
}

const rowText = new WeakMap();
function searchText(row) {
  let text = rowText.get(row);
  if (text === undefined) {
    text = [row.invoiceNo, row.po, row.vcode, row.event, row.detail, row.performedBy].join(' ').toLowerCase();
    rowText.set(row, text);
  }
  return text;
}

/** The log filters as a row predicate (keeps the caller's order). */
export function logRowFilter({ search = '', type = 'all', from = '', to = '', channel = '' } = {}) {
  const q = search.trim().toLowerCase();
  const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : null;
  const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
  return (row) => (type === 'all' || row.type === type)
    && (!channel || row.channel === channel)
    && (fromMs === null || row.when.getTime() >= fromMs)
    && (toMs === null || row.when.getTime() <= toMs)
    && (!q || searchText(row).includes(q));
}

export function filterLogRows(rows, filters = {}) {
  return rows.filter(logRowFilter(filters)).sort((a, b) => b.when - a.when);
}

export function logRowsToCsv(rows, { staff = false } = {}) {
  const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const header = staff
    ? ['Date', 'Invoice No', 'Vendor Code', 'PO No', 'Type', 'Event', 'Performed By', 'Details']
    : ['Date', 'Invoice No', 'PO No', 'Type', 'Event', 'Details'];
  const lines = rows.map((row) => [
    row.hasTime ? formatDayTime(row.when) : formatDay(row.when),
    ...(staff
      ? [row.invoiceNo, row.vcode, row.po, row.type, row.event, row.performedBy, row.detail]
      : [row.invoiceNo, row.po, row.type, row.event, row.detail]),
  ].map(cell).join(','));
  return [header.map(cell).join(','), ...lines].join('\r\n');
}
