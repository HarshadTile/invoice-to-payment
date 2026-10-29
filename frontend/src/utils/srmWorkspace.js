import { formatInvoiceDate, invoiceFilterDate } from './invoiceDates';
import { invoiceProductType } from './businessLogic';
import { matchesInvoiceQuery, parseInvoiceQuery } from './invoiceQuery';

const text = (value) => value == null || String(value).trim() === '' || value === '-' ? '-' : String(value).trim();
const contains = (value, query) => text(value) !== '-' && text(value).toLowerCase().includes(query.trim().toLowerCase());
const column = (key, label, read, type = 'text') => ({ key, label, read, type });
const date = (key, label, read) => column(key, label, read, 'date');

export const SRM_COLUMNS = [
  column('invoice', 'Invoice No', (i) => i.no), column('vendor', 'Vendor', (i) => i.vendor),
  column('vcode', 'Vendor Code', (i) => i.vcode), column('pan', 'PAN', (i) => i.pan),
  column('po', 'PO No', (i) => i.po), column('item', 'PO Item', (i) => i.poItem),
  column('product', 'Product Type', invoiceProductType), column('plant', 'Plant Code', (i) => i.plant),
  column('division', 'Division', (i) => i.dvType), column('fy', 'Filter Fiscal Year', (i) => i.filterFiscalYear),
  date('invoiceDate', 'Invoice Date', (i) => i.rawDate), date('uploadDate', 'Upload Date', (i) => i.rawUploadDate),
  column('uploaded', 'Invoice Uploaded', (i) => i.invoiceUploaded == null ? null : i.invoiceUploaded ? 'Yes' : 'No'),
  column('amount', 'Payable Amount', (i) => i.amount), column('currency', 'Currency', (i) => i.sap?.currency),
  column('status', 'Status', (i) => i.status), column('statusFlag', 'Status Flag', (i) => i.statusFlag),
  column('approvalStatus', 'Approval Status', (i) => i.statusLabel),
  column('pending', 'Pending With', (i) => i.workflow?.pending_with),
  column('approvedBy', 'Approved By', (i) => i.workflow?.approved_by),
  ...Array.from({ length: 7 }, (_, index) => column(`approver${index + 1}`, `Approver ${index + 1}`, (i) => i.workflow?.approvers?.[`approver_${index + 1}`])),
  date('approvalDate', 'Approval Date', (i) => i.workflow?.final_approval_date),
  date('accountsDate', 'Sent to Accounts Date', (i) => i.workflow?.document_sent_to_accounts_date),
  column('remarks', 'Approver Remarks', (i) => i.workflow?.approver_remarks),
  column('rejection', 'Rejection Reason', (i) => i.rejectionReason || i.workflow?.rejection_reason || i.shortPayReason),
  column('miroStatus', 'MIRO Status', (i) => i.sap?.miro_status),
  date('miroDate', 'MIRO Document Date', (i) => i.sap?.document_date),
  date('postingDate', 'Posting Date', (i) => i.sap?.posting_date),
  date('dueDate', 'Payment Due Date', (i) => i.sap?.net_due_date),
  date('paymentDate', 'Clearing Date', (i) => i.sap?.clearing_date),
  column('utr', 'UTR No', (i) => i.utr), date('utrDate', 'UTR Clearing Date', (i) => i.sap?.utr_clearing_date_paid),
  column('accountType', 'Account Type', (i) => i.sap?.account_type),
];

export const SRM_APPROVAL_COLUMNS = ['invoice', 'vendor', 'vcode', 'po', 'item', 'status', 'approvalStatus',
  ...Array.from({ length: 7 }, (_, index) => `approver${index + 1}`), 'pending', 'approvedBy', 'approvalDate', 'remarks', 'rejection'];
export const SRM_VIEW_COLUMNS = {
  'Invoice Log': ['invoice', 'vendor', 'vcode', 'pan', 'po', 'item', 'product', 'plant', 'division',
    'invoiceDate', 'uploadDate', 'amount', 'currency', 'status', 'pending', 'approvalDate', 'dueDate', 'utr', 'rejection'],
  'Approver Assignment': SRM_APPROVAL_COLUMNS,
  'SAP Booking (MIRO)': ['invoice', 'vendor', 'vcode', 'po', 'item', 'product', 'plant', 'division',
    'approvalDate', 'accountsDate', 'miroStatus', 'miroDate', 'postingDate', 'amount', 'currency', 'dueDate'],
  'Payment & UTR (FBL1N)': ['invoice', 'vendor', 'vcode', 'po', 'item', 'status', 'amount', 'currency', 'dueDate', 'paymentDate', 'utr', 'utrDate'],
};

export function srmColumns(view, selection = {}) {
  const keys = selection.preset === 'all' ? SRM_COLUMNS.map((entry) => entry.key)
    : selection.preset === 'approvals' ? SRM_APPROVAL_COLUMNS
      : selection.preset === 'custom' ? selection.columns || [] : SRM_VIEW_COLUMNS[view] || SRM_VIEW_COLUMNS['Invoice Log'];
  return [...new Set(['invoice', 'vendor', ...keys])].map((key) => SRM_COLUMNS.find((entry) => entry.key === key)).filter(Boolean);
}

export function srmCell(invoice, entry) {
  return entry.type === 'date' ? formatInvoiceDate(entry.read(invoice)) : text(entry.read(invoice));
}

export function srmPaid(invoice) {
  return invoice.status === 'Paid' || text(invoice.utr) !== '-' || text(invoice.sap?.clearing_date) !== '-';
}

export function matchesSrmWorkspace(invoice, filters, dateType = 'invoice', skipStatus = false) {
  const query = filters.q || '';
  if (!matchesInvoiceQuery(invoice, query)
      && !(parseInvoiceQuery(query).mode === 'any' && contains(invoice.pan, query))) return false;
  if (!skipStatus && filters.status && invoice.status !== filters.status) return false;
  const value = invoiceFilterDate(invoice, dateType);
  if ((filters.date_from || filters.date_to) && !value) return false;
  if (filters.date_from && value < filters.date_from) return false;
  if (filters.date_to && value > filters.date_to) return false;
  if (filters.approver && !Array.from({ length: 7 }, (_, index) => invoice.workflow?.approvers?.[`approver_${index + 1}`]).some((person) => contains(person, filters.approver))) return false;
  if (filters.pending_with && !contains(invoice.workflow?.pending_with, filters.pending_with)) return false;
  if (filters.approved_by && !contains(invoice.workflow?.approved_by, filters.approved_by)) return false;
  const miro = text(invoice.sap?.miro_status).toUpperCase();
  if (filters.miro_status === 'booked' && miro !== 'MIRO BOOKED') return false;
  if (filters.miro_status === 'pending' && miro !== 'PENDING FOR MIRO') return false;
  if (filters.payment_status === 'paid' && !srmPaid(invoice)) return false;
  if (filters.payment_status === 'unpaid' && srmPaid(invoice)) return false;
  return true;
}

/** Only dated source milestones; no guessed assignment or rejection timestamps. */
export function srmHistoryRows(invoices) {
  const rows = [];
  for (const inv of invoices) {
    const milestones = [
      ['Invoice', 'Invoice dated', inv.rawDate], ['Invoice', 'Invoice uploaded', inv.rawUploadDate],
      ['Invoice', 'Invoice approved', inv.workflow?.final_approval_date, inv.workflow?.approved_by],
      ['Invoice', 'Sent to accounts', inv.workflow?.document_sent_to_accounts_date],
      ['Invoice', 'MIRO document dated', inv.sap?.document_date],
      ['Invoice', 'Posted in SAP', inv.sap?.posting_date],
      ['Payment', 'Payment cleared', inv.sap?.clearing_date, null, text(inv.utr) !== '-' ? `UTR ${inv.utr}` : ''],
    ];
    for (const [type, event, rawDate, person, detail] of milestones) {
      if (!rawDate) continue;
      const when = new Date(`${rawDate}T00:00:00`);
      if (Number.isNaN(when.getTime())) continue;
      rows.push({ key: `${inv.vcode}|${inv.no}|${inv.po}|${inv.poItem}|${event}`, when, hasTime: false,
        type, event, detail: detail || '', invoiceNo: inv.no, po: inv.po, invoice: inv,
        vcode: inv.vcode, channel: inv.channel, performedBy: text(person) === '-' ? 'System' : person });
    }
  }
  return rows;
}
