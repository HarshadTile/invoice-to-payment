import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { selectScopedInvoices } from '../../features/invoices/selectors';
import { getFiscalYear, timestampedExportName } from '../../utils/businessLogic';
import { useScope } from '../../features/ui/scope';
import { api } from '../../api/client';
import {
  filterLogRows, formatDay, formatDayTime, invoiceLogRows, withUniqueKeys, logRowsToCsv, queryLogRows,
} from '../../utils/supplierLog';
import LogFilterBar from '../../components/common/LogFilterBar.jsx';
import PagerFoot from '../../components/common/PagerFoot.jsx';
import SortDateTh from '../../components/common/SortDateTh.jsx';
import { useDateSort } from '../../utils/dateSort';
import Badge from '../../components/common/Badge.jsx';

const PAGE_SIZE = 20;
const TYPE_TONE = { Invoice: 'blue', Payment: 'green', Query: 'amber' };

export default function SupplierLogsPage() {
  const navigate = useNavigate();
  const code = useSelector((s) => s.auth.supplierLoginVcode);
  const fySearch = useScope().fy;
  const scopedInvoices = useSelector(selectScopedInvoices);
  const invoices = useMemo(
    () => scopedInvoices.filter((i) => i.vcode === code && (fySearch === 'all' || getFiscalYear(i.date) === fySearch)),
    [scopedInvoices, code, fySearch],
  );

  const [queryEntries, setQueryEntries] = useState([]);
  const [queryError, setQueryError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api.get('/v1/tickets/supplier-activity-log')
      .then((data) => { if (!cancelled) setQueryEntries(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setQueryError(true); });
    return () => { cancelled = true; };
  }, []);

  const [filters, setFilters] = useState({ search: '', type: 'all', from: '', to: '' });
  const [page, setPage] = useState(1);
  const setFilter = (key) => (e) => { setFilters((prev) => ({ ...prev, [key]: e.target.value })); setPage(1); };
  const filtersActive = filters.search || filters.type !== 'all' || filters.from || filters.to;

  const allRows = useMemo(
    () => withUniqueKeys([...invoiceLogRows(invoices), ...queryLogRows(queryEntries, invoices, fySearch !== 'all')]),
    [invoices, queryEntries, fySearch],
  );
  const filteredRows = useMemo(() => filterLogRows(allRows, filters), [allRows, filters]);
  const { sorted: rows, dir: dateDir, toggle: toggleDate } = useDateSort(filteredRows, (row) => row.when, 'desc');
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const openInvoice = (inv) => {
    const item = inv.poItem !== undefined && inv.poItem !== '' ? `&item=${encodeURIComponent(inv.poItem)}` : '';
    navigate(`/supplier/home?open=${encodeURIComponent(inv.no)}${item}`);
  };

  function exportCsv() {
    const blob = new Blob(['﻿', logRowsToCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${timestampedExportName('Logs')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="card">
        <LogFilterBar
          filters={filters} onChange={setFilter} filtersActive={filtersActive}
          onClear={() => { setFilters({ search: '', type: 'all', from: '', to: '' }); setPage(1); }} onExport={exportCsv} exportCount={rows.length}
          searchPlaceholder="Search invoice, PO or details"
        />
        {queryError && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78125rem', margin: '0 0 0.625rem' }}>Your query history couldn't be loaded right now. Invoice and payment activity is shown below.</p>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr><SortDateTh dir={dateDir} onToggle={toggleDate} /><th>Invoice No</th><th>PO No</th><th>Type</th><th>Event</th><th>Details</th></tr>
            </thead>
            <tbody>
              {pageRows.length ? pageRows.map((row) => (
                <tr key={row.key}>
                  <td style={{ whiteSpace: 'nowrap' }}>{row.hasTime ? formatDayTime(row.when) : formatDay(row.when)}</td>
                  <td>
                    {row.type === 'Query' && row.ticketId
                      ? <button type="button" className="link-hero" onClick={() => navigate(`/supplier/tickets/${row.ticketId}`)}>{row.invoiceNo}</button>
                      : row.invoice
                        ? <button type="button" className="link-hero" onClick={() => openInvoice(row.invoice)}>{row.invoiceNo}</button>
                        : row.invoiceNo}
                  </td>
                  <td>{row.po}</td>
                  <td><Badge tone={TYPE_TONE[row.type]}>{row.type}</Badge></td>
                  <td>{row.event}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{row.detail || '-'}</td>
                </tr>
              )) : (
                <tr><td colSpan={6} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem' }}>
                  {filtersActive ? 'No activity matches these filters.' : `No activity yet on ${code}.`}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <PagerFoot total={rows.length} page={currentPage} pageSize={PAGE_SIZE} onPage={setPage} />
      </div>
    </>
  );
}
