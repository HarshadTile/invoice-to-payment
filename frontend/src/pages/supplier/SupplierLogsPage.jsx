import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { timestampedExportName } from '../../utils/csv';
import { useScope } from '../../features/ui/scope';
import { workspaceApi } from '../../api/workspaceApi';
import {
  filterLogRows, formatDay, formatDayTime, groupRowsByInvoice, invoiceLogRows, withUniqueKeys, logRowsToCsv, queryLogRows,
} from '../../utils/supplierLog';
import LogFilterBar from '../../components/common/LogFilterBar.jsx';
import PagerFoot from '../../components/common/PagerFoot.jsx';
import SortDateTh from '../../components/common/SortDateTh.jsx';
import { useDateSort } from '../../utils/dateSort';
import StatCard from '../../components/common/StatCard.jsx';
import { EventLabel, TypeBadge } from '../../components/common/GlobalLogsBody.jsx';
import { logRanges, trailText } from '../../utils/logRanges';
import { Banknote, Clock, FileText, History, MessageSquare } from '../../components/common/icons.jsx';
import useSupplierInvoices from './useSupplierInvoices';

const PAGE_SIZE = 20;
// Suppliers sign in less often than staff, so the log opens on the last 30 days.
const DEFAULT_RANGE = 'd30';
// The summary cards double as the type filter.
const TYPE_CARDS = [
  { type: 'all', label: 'All activity', icon: History, tone: 'shade-total', sub: 'Invoices and queries in this period' },
  { type: 'Invoice', label: 'Invoice events', icon: FileText, tone: 'shade-pending', sub: 'Upload, approval, SAP booking' },
  { type: 'Payment', label: 'Payments', icon: Banknote, tone: 'shade-paid', sub: 'Cleared payments and UTRs' },
  { type: 'Query', label: 'Query updates', icon: MessageSquare, tone: 'shade-approved', sub: 'Your questions and replies' },
];

/** The supplier's activity: one row per invoice (its latest milestone, with the whole trail) plus
 *  query updates, for the same invoices as the Dashboard and My Invoices (every assigned vendor
 *  code, or the one picked in the top bar, in the top-bar financial year). */
export default function SupplierLogsPage() {
  const navigate = useNavigate();
  const { fy, vcode } = useScope();
  const invoices = useSupplierInvoices();
  // Only queries on these invoices once the view is narrowed to one year or one vendor code.
  const narrowed = fy !== 'all' || (vcode && vcode !== 'all');

  const [queryEntries, setQueryEntries] = useState([]);
  const [queryError, setQueryError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    workspaceApi.supplierActivityLog()
      .then((data) => { if (!cancelled) setQueryEntries(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setQueryError(true); });
    return () => { cancelled = true; };
  }, []);

  const ranges = useMemo(() => logRanges(), []);
  const defaults = useMemo(() => {
    const range = ranges.find((r) => r.key === DEFAULT_RANGE);
    return { search: '', type: 'all', from: range.from, to: range.to };
  }, [ranges]);
  const [filters, setFilters] = useState(defaults);
  const [page, setPage] = useState(1);
  const setFilter = (key) => (e) => { setFilters((prev) => ({ ...prev, [key]: e.target.value })); setPage(1); };
  const pickRange = (range) => { setFilters((prev) => ({ ...prev, from: range.from, to: range.to })); setPage(1); };
  const filtersActive = Object.keys(defaults).some((key) => filters[key] !== defaults[key]);
  const activeRange = ranges.find((r) => r.from === filters.from && r.to === filters.to);

  const allRows = useMemo(
    () => withUniqueKeys([...invoiceLogRows(invoices), ...queryLogRows(queryEntries, invoices, narrowed)]),
    [invoices, queryEntries, narrowed],
  );
  // The export is the detailed record: one row per event.
  const eventRows = useMemo(() => filterLogRows(allRows, filters), [allRows, filters]);
  const groupedRows = useMemo(() => groupRowsByInvoice(eventRows, allRows), [eventRows, allRows]);
  // Counts per type follow the search and dates, but not the type itself.
  const typeCounts = useMemo(() => {
    const counts = { all: 0, Invoice: 0, Payment: 0, Query: 0 };
    for (const row of groupRowsByInvoice(filterLogRows(allRows, { ...filters, type: 'all' }), allRows)) {
      counts.all += 1; counts[row.type] = (counts[row.type] || 0) + 1;
    }
    return counts;
  }, [allRows, filters]);
  const pickType = (type) => { setFilters((prev) => ({ ...prev, type: prev.type === type ? 'all' : type })); setPage(1); };
  const { sorted: rows, dir: dateDir, toggle: toggleDate } = useDateSort(groupedRows, (row) => row.when, 'desc');
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const openInvoice = (inv) => {
    const item = inv.poItem !== undefined && inv.poItem !== '' ? `&item=${encodeURIComponent(inv.poItem)}` : '';
    navigate(`/supplier/home?open=${encodeURIComponent(inv.no)}${item}`);
  };

  function exportCsv() {
    const sortedEvents = [...eventRows].sort((a, b) => b.when - a.when);
    const blob = new Blob(['﻿', logRowsToCsv(sortedEvents)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${timestampedExportName('Logs')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="dash supplier-logs">
      <div className="kpi-grid supplier-log-kpis">
        {TYPE_CARDS.map(({ type, label, icon: Icon, tone, sub }) => (
          <StatCard key={type} tone={tone} icon={<Icon size={16} />} label={label} sub={sub}
            value={(typeCounts[type] || 0).toLocaleString('en-IN')}
            onClick={() => pickType(type)} active={filters.type === type} />
        ))}
      </div>
      <div className="card">
        <LogFilterBar
          filters={filters} onChange={setFilter} filtersActive={filtersActive}
          onClear={() => { setFilters(defaults); setPage(1); }} onExport={exportCsv} exportCount={eventRows.length ? null : 0}
          searchPlaceholder="Search invoice, PO or details"
        />
        <div className="log-ranges">
          <div className="sm-filter" role="group" aria-label="Date range">
            {ranges.map((range) => (
              <button key={range.key} type="button" className={`sm-chip${activeRange === range ? ' active' : ''}`}
                aria-pressed={activeRange === range} onClick={() => pickRange(range)}>{range.label}</button>
            ))}
          </div>
          <span className="cell-muted">
            {rows.length.toLocaleString('en-IN')} invoices and queries{activeRange && activeRange.key !== 'all' ? ` · ${activeRange.label.toLowerCase()}` : ''}
          </span>
        </div>
        {queryError && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78125rem', margin: '0 0 0.625rem' }}>Your query history couldn't be loaded right now. Invoice and payment activity is shown below.</p>
        )}
        <div className="table-scroll">
          <table className="log-table">
            <thead>
              <tr><SortDateTh dir={dateDir} onToggle={toggleDate} /><th>Invoice No</th><th>PO No</th><th>Type</th><th>Event</th><th>Details</th></tr>
            </thead>
            <tbody>
              {pageRows.length ? pageRows.map((row) => (
                <tr key={row.key}>
                  <td style={{ whiteSpace: 'nowrap' }}><span className="log-when"><Clock size={12} />{row.hasTime ? formatDayTime(row.when) : formatDay(row.when)}</span></td>
                  <td>
                    {row.type === 'Query' && row.ticketId
                      ? <button type="button" className="link-hero" onClick={() => navigate(`/supplier/tickets/${row.ticketId}`)}>{row.invoiceNo}</button>
                      : row.invoice
                        ? <button type="button" className="link-hero" onClick={() => openInvoice(row.invoice)}>{row.invoiceNo}</button>
                        : row.invoiceNo}
                  </td>
                  <td>{row.po}</td>
                  <td><TypeBadge type={row.type} /></td>
                  <td>
                    <EventLabel event={row.event} type={row.type} />
                    {row.trail && row.trail.length > 1 && <div className="log-trail" title="This invoice's milestones, oldest first">{trailText(row.trail)}</div>}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{row.detail || '-'}</td>
                </tr>
              )) : (
                <tr><td colSpan={6} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem' }}>
                  {filtersActive ? 'No activity matches these filters.' : 'No activity on your invoices in the last 30 days. Choose a longer period above.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <PagerFoot total={rows.length} page={currentPage} pageSize={PAGE_SIZE} onPage={setPage} />
      </div>
    </div>
  );
}
