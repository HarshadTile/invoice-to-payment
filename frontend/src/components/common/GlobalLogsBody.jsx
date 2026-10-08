import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { CHANNELS, CHANNEL_LABEL } from '../../data/constants';
import { openModal } from '../../features/ui/uiSlice';
import { api } from '../../api/client';
import {
  LOG_TYPES, filterLogRows, formatDay, formatDayTime, invoiceLogRows, logRowsToCsv, staffQueryLogRows,
} from '../../utils/supplierLog';
import PagerFoot from './PagerFoot.jsx';
import SortDateTh from './SortDateTh.jsx';
import { useDateSort } from '../../utils/dateSort';
import Badge from './Badge.jsx';
import { Download } from './icons.jsx';

const PAGE_SIZE = 20;
const TYPE_TONE = { Invoice: 'blue', Payment: 'green', Query: 'amber' };
const NO_FILTERS = { search: '', type: 'all', channel: '', from: '', to: '' };

/**
 * Logs / History for the internal team: one chronological list of what actually happened,
 * from the real data only: invoice milestones and payments (with the real dates on the
 * invoice record) and query activity (from GET /v1/tickets/activity-log, limited to the
 * tickets this person may see), each with who did it.
 */
export default function GlobalLogsBody({ invoiceList }) {
  const dispatch = useDispatch();

  const [entries, setEntries] = useState([]);
  const [queryError, setQueryError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api.get('/v1/tickets/activity-log')
      .then((data) => { if (!cancelled) setEntries(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setQueryError(true); });
    return () => { cancelled = true; };
  }, []);

  const [filters, setFilters] = useState(NO_FILTERS);
  const [page, setPage] = useState(1);
  const setFilter = (key) => (e) => { setFilters((prev) => ({ ...prev, [key]: e.target.value })); setPage(1); };
  const filtersActive = Object.keys(NO_FILTERS).some((key) => filters[key] !== NO_FILTERS[key]);

  const allRows = useMemo(
    () => [...invoiceLogRows(invoiceList), ...staffQueryLogRows(entries, invoiceList, true)],
    [invoiceList, entries],
  );
  const filteredRows = useMemo(() => filterLogRows(allRows, filters), [allRows, filters]);
  const { sorted: rows, dir: dateDir, toggle: toggleDate } = useDateSort(filteredRows, (row) => row.when, 'desc');
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function exportCsv() {
    const blob = new Blob(['﻿', logRowsToCsv(rows, { staff: true })], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'activity-log.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card">
      {/* The filters take the space left of the button and wrap among themselves, so Export
          stays on the right instead of dropping onto its own line. */}
      <div className="toolbar" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 12 }}>
        <div className="toolbar-left" style={{ gap: 10, flex: '1 1 0', minWidth: 0 }}>
          <input
            className="search-box" style={{ flex: '1 1 200px', minWidth: 160, maxWidth: 280, width: 'auto' }}
            placeholder="Search invoice, vendor code, PO or details..." aria-label="Search the log"
            value={filters.search} onChange={setFilter('search')}
          />
          <select className="search-box" aria-label="Filter by type" value={filters.type} onChange={setFilter('type')} style={{ width: 150 }}>
            <option value="all">All types</option>
            {LOG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="search-box" aria-label="Filter by channel" value={filters.channel} onChange={setFilter('channel')} style={{ width: 170 }}>
            <option value="">All channels</option>
            {CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <label className="filter-inline">
            From <input type="date" className="search-box" style={{ width: 150 }} aria-label="From date" value={filters.from} max={filters.to || undefined} onChange={setFilter('from')} />
          </label>
          <label className="filter-inline">
            To <input type="date" className="search-box" style={{ width: 150 }} aria-label="To date" value={filters.to} min={filters.from || undefined} onChange={setFilter('to')} />
          </label>
          {filtersActive && (
            <button type="button" className="btn" onClick={() => { setFilters(NO_FILTERS); setPage(1); }}>Clear</button>
          )}
        </div>
        <div className="toolbar-right" style={{ flex: '0 0 auto' }}>
          <button type="button" className="btn" onClick={exportCsv} disabled={rows.length === 0}><Download />Export ({rows.length})</button>
        </div>
      </div>
      {queryError && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12.5, margin: '0 0 10px' }}>Query activity couldn't be loaded right now. Invoice and payment activity is shown below.</p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr><SortDateTh dir={dateDir} onToggle={toggleDate} /><th>Invoice No</th><th>Vendor Code</th><th>PO No</th><th>Type</th><th>Event</th><th>Performed By</th><th>Details</th></tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr><td colSpan={8} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
                {filtersActive ? 'No log entries match your filters.' : 'No activity yet.'}
              </td></tr>
            )}
            {pageRows.map((row) => (
              <tr key={row.key}>
                <td style={{ whiteSpace: 'nowrap' }}>{row.hasTime ? formatDayTime(row.when) : formatDay(row.when)}</td>
                <td>
                  {row.invoiceNo === '-'
                    ? '-'
                    : <button type="button" className="link-hero" onClick={() => dispatch(openModal({ kind: 'invoiceDetail', ctx: { no: row.invoiceNo, poItem: row.invoice?.poItem } }))}>{row.invoiceNo}</button>}
                </td>
                <td>
                  {row.vcode && row.vcode !== '-'
                    ? <button type="button" className="link-hero" onClick={() => dispatch(openModal({ kind: 'vendorCodePreview', ctx: { code: row.vcode } }))}>{row.vcode}</button>
                    : '-'}
                </td>
                <td>{row.po}</td>
                <td><Badge tone={TYPE_TONE[row.type]}>{row.type}</Badge></td>
                <td>{row.event}</td>
                <td>{row.performedBy}</td>
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
