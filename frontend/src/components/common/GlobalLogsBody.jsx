import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { CHANNEL_LABEL } from '../../data/constants';
import { openModal } from '../../features/ui/uiSlice';
import { api } from '../../api/client';
import { timestampedExportName } from '../../utils/businessLogic';
import {
  formatDay, formatDayTime, invoiceLogRows, logRowFilter, logRowsToCsv, staffQueryLogRows,
} from '../../utils/supplierLog';
import LogFilterBar from './LogFilterBar.jsx';
import PagerFoot from './PagerFoot.jsx';
import SortDateTh from './SortDateTh.jsx';
import Badge from './Badge.jsx';
import { Banknote, Calendar, CheckCircle, Clock, FileText, Layers, MessageSquare, Send, Settings, Trash, Upload, X } from './icons.jsx';

const PAGE_SIZE = 20;
const TYPE_TONE = { Invoice: 'blue', Payment: 'green', Query: 'amber' };
const TYPE_ICON = { Invoice: FileText, Payment: Banknote, Query: MessageSquare };
// Each milestone gets its own icon and colour so the timeline reads at a glance.
const EVENT_STYLE = {
  'Invoice dated': [Calendar, 'gray'],
  'Invoice uploaded': [Upload, 'blue'],
  'Invoice approved': [CheckCircle, 'green'],
  'Sent to accounts': [Send, 'purple'],
  'MIRO document dated': [FileText, 'amber'],
  'Posted in SAP': [Layers, 'blue'],
  'Booked in SAP': [Layers, 'blue'],
  'Payment cleared': [Banknote, 'green'],
  'Payment completed': [Banknote, 'green'],
  'Invoice rejected': [X, 'red'],
  'Invoice deleted': [Trash, 'red'],
};

export function EventLabel({ event, type }) {
  const [Icon, tone] = EVENT_STYLE[event] || [type === 'Query' ? MessageSquare : FileText, TYPE_TONE[type] || 'gray'];
  return <span className={`log-event ${tone}`}><span className="log-event-ic" aria-hidden="true"><Icon size={12} /></span>{event}</span>;
}

// Rows are built once per invoice list (and row builder) and kept newest first, so coming
// back to History or changing a filter never rebuilds or re-sorts the whole log.
const builtRows = new WeakMap();

/** Stable sort by time: rows are grouped per timestamp, so only the distinct times get sorted. */
function byTime(rows, newest) {
  const groups = new Map();
  for (const row of rows) {
    const ms = row.when.getTime();
    const group = groups.get(ms);
    if (group) group.push(row); else groups.set(ms, [row]);
  }
  const times = [...groups.keys()].sort((a, b) => (newest ? b - a : a - b));
  const sorted = [];
  for (const ms of times) for (const row of groups.get(ms)) sorted.push(row);
  return sorted;
}
const newestFirst = (rows) => byTime(rows, true);
const oldestFirst = (rows) => byTime(rows, false);

function invoiceRowsNewestFirst(invoiceList, getInvoiceRows) {
  let byList = builtRows.get(getInvoiceRows);
  if (!byList) builtRows.set(getInvoiceRows, byList = new WeakMap());
  let rows = byList.get(invoiceList);
  if (!rows) byList.set(invoiceList, rows = newestFirst(getInvoiceRows(invoiceList)));
  return rows;
}

/** Two newest-first lists as one; on equal times the invoice row stays first. */
function mergeNewestFirst(invoiceRows, queryRows) {
  if (!queryRows.length) return invoiceRows;
  const merged = [];
  let i = 0, q = 0;
  while (i < invoiceRows.length && q < queryRows.length) {
    merged.push(invoiceRows[i].when.getTime() >= queryRows[q].when.getTime() ? invoiceRows[i++] : queryRows[q++]);
  }
  while (i < invoiceRows.length) merged.push(invoiceRows[i++]);
  while (q < queryRows.length) merged.push(queryRows[q++]);
  return merged;
}

/** Query entries that belong to one of these invoices (same vendor code / channel when given). */
function entriesForInvoices(entries, invoiceList) {
  if (!entries.length) return entries;
  const byNo = new Map();
  for (const invoice of invoiceList) {
    const list = byNo.get(invoice.no);
    if (list) list.push(invoice); else byNo.set(invoice.no, [invoice]);
  }
  return entries.filter((entry) => entry.invoice_no && (byNo.get(entry.invoice_no) || []).some((invoice) =>
    (!entry.vendor_code || invoice.vcode === entry.vendor_code) && (!entry.channel || invoice.channel === entry.channel)));
}

export function TypeBadge({ type }) {
  const Icon = TYPE_ICON[type];
  return <Badge tone={TYPE_TONE[type]}>{Icon && <Icon size={12} />}{type}</Badge>;
}

/** Who did it: initials in a small circle, or a gear for automatic (System) entries. */
function Actor({ name }) {
  const system = !name || name === 'System';
  const initials = system ? '' : String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return <span className="log-actor">
    <span className={`log-actor-badge${system ? ' system' : ''}`} aria-hidden="true">{system ? <Settings size={11} /> : initials}</span>
    {name || 'System'}
  </span>;
}
// The channel comes from the top-bar filter, which already narrows the invoices (and their queries) shown here
const NO_FILTERS = { search: '', type: 'all', from: '', to: '' };

/**
 * Logs / History for the internal team: one chronological list of what actually happened,
 * from the real data only: invoice milestones and payments (with the real dates on the
 * invoice record) and query activity (from GET /v1/tickets/internal-activity-log, limited to the
 * tickets this person may see), each with who did it.
 */
export default function GlobalLogsBody({ invoiceList, getInvoiceRows = invoiceLogRows, strictInvoiceScope = false }) {
  const dispatch = useDispatch();

  const [entries, setEntries] = useState([]);
  const [queryError, setQueryError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api.get('/v1/tickets/internal-activity-log')
      .then((data) => { if (!cancelled) setEntries(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setQueryError(true); });
    return () => { cancelled = true; };
  }, []);

  const [filters, setFilters] = useState(NO_FILTERS);
  const [page, setPage] = useState(1);
  const setFilter = (key) => (e) => { setFilters((prev) => ({ ...prev, [key]: e.target.value })); setPage(1); };
  const filtersActive = Object.keys(NO_FILTERS).some((key) => filters[key] !== NO_FILTERS[key]);

  const allRows = useMemo(() => {
    const scopedEntries = strictInvoiceScope ? entriesForInvoices(entries, invoiceList) : entries;
    return mergeNewestFirst(invoiceRowsNewestFirst(invoiceList, getInvoiceRows), newestFirst(staffQueryLogRows(scopedEntries, invoiceList, true)));
  }, [invoiceList, entries, getInvoiceRows, strictInvoiceScope]);
  // Typing in the search stays instant; the (large) list follows a moment later.
  const deferredFilters = useDeferredValue(filters);
  const filteredRows = useMemo(() => (Object.keys(NO_FILTERS).some((key) => deferredFilters[key] !== NO_FILTERS[key])
    ? allRows.filter(logRowFilter(deferredFilters)) : allRows), [allRows, deferredFilters]);
  const [dateDir, setDateDir] = useState('desc');
  const toggleDate = () => setDateDir((dir) => (dir === 'desc' ? 'asc' : 'desc'));
  const rows = useMemo(() => (dateDir === 'desc' ? filteredRows : oldestFirst(filteredRows)), [filteredRows, dateDir]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function exportCsv() {
    const blob = new Blob(['﻿', logRowsToCsv(rows, { staff: true })], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${timestampedExportName('Logs')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card">
      <LogFilterBar
        filters={filters} onChange={setFilter} filtersActive={filtersActive}
        onClear={() => { setFilters(NO_FILTERS); setPage(1); }} onExport={exportCsv} exportCount={rows.length}
      />
      {queryError && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.78125rem', margin: '0 0 0.625rem' }}>Query activity couldn't be loaded right now. Invoice and payment activity is shown below.</p>
      )}
      <div className="table-scroll">
        <table className="log-table">
          <thead>
            <tr><SortDateTh dir={dateDir} onToggle={toggleDate} /><th>Invoice No</th><th>Vendor Code</th><th>PO No</th><th>Type</th><th>Event</th><th>Performed By</th><th>Details</th></tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr><td colSpan={8} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem' }}>
                {filtersActive ? 'No log entries match your filters.' : 'No activity yet.'}
              </td></tr>
            )}
            {/* Source data can repeat an invoice line, so the position keeps keys unique. */}
            {pageRows.map((row, index) => (
              <tr key={`${row.key}#${(currentPage - 1) * PAGE_SIZE + index}`}>
                <td style={{ whiteSpace: 'nowrap' }}><span className="log-when"><Clock size={12} />{row.hasTime ? formatDayTime(row.when) : formatDay(row.when)}</span></td>
                <td>
                  {row.invoiceNo === '-'
                    ? '-'
                    : <button type="button" className="link-hero" onClick={() => dispatch(openModal({ kind: 'invoiceDetail', ctx: { no: row.invoiceNo, poItem: row.invoice?.poItem, vcode: row.invoice?.vcode, po: row.invoice?.po, channel: row.invoice?.channel, sourceId: row.invoice?.sourceId } }))}>{row.invoiceNo}</button>}
                </td>
                <td>
                  {row.vcode && row.vcode !== '-'
                    ? <button type="button" className="link-hero vcode-tag" onClick={() => dispatch(openModal({ kind: 'vendorCodePreview', ctx: { code: row.vcode } }))}>{row.vcode}</button>
                    : '-'}
                </td>
                <td>{row.po}</td>
                <td><TypeBadge type={row.type} /></td>
                <td><EventLabel event={row.event} type={row.type} /></td>
                <td><Actor name={row.performedBy} /></td>
                <td style={{ color: 'var(--text-muted)' }} title={row.channel ? CHANNEL_LABEL[row.channel] : undefined}>{row.detail || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PagerFoot total={rows.length} page={currentPage} pageSize={PAGE_SIZE} onPage={setPage} />
    </div>
  );
}
