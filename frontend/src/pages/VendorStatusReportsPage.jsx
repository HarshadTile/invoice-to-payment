import { useMemo, useState } from 'react';
import { formatMoney, formatShare } from '../features/invoices/dashboardMetrics';
import { useGetInvoiceDashboardQuery, useGetVendorReportQuery } from '../api/invoicesQueryApi';
import { useInvoiceScopeParams } from '../features/invoices/useInvoiceScopeParams';
import useServerInvoiceTable from '../features/invoices/useServerInvoiceTable';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import StatCard from '../components/common/StatCard.jsx';
import { Banknote, Building, CheckCircle, Users, X } from '../components/common/icons.jsx';

const PAID = ['Paid'];

export default function VendorStatusReportsPage() {
  // Counted on the server for the top-bar scope: completed (paid) invoices, per supplier.
  const scopeParams = useInvoiceScopeParams();
  const report = useGetVendorReportQuery(scopeParams);
  const paidTotals = useGetInvoiceDashboardQuery({ ...scopeParams, statuses: PAID });

  // Which list the cards switch between, and the supplier picked from the suppliers list (if any)
  const [view, setView] = useState('invoices'); // 'invoices' | 'suppliers'
  const [supplier, setSupplier] = useState('');

  // Per supplier: completed invoices and their value in the main currency (most invoices' currency).
  const suppliers = report.data?.suppliers || [];
  const currency = report.data?.currency || '₹';
  const completedCount = report.data?.completed ?? 0;

  // A supplier that dropped out of the top-bar scope no longer filters anything
  const activeSupplier = suppliers.some((s) => s.name === supplier) ? supplier : '';
  const listFilters = useMemo(() => ({ ...scopeParams, statuses: PAID, vendor_name: activeSupplier || undefined }),
    [scopeParams, activeSupplier]);
  const shown = useServerInvoiceTable({ tableKey: 'completedInvoices', filters: listFilters });

  const showInvoices = () => { setView('invoices'); setSupplier(''); };
  const pickSupplier = (name) => { setSupplier(name); setView('invoices'); };

  const totals = paidTotals.data?.totalsByCurrency || {};
  const paidShort = Object.entries(totals).map(([cur, value]) => formatMoney(value, cur)).join(' + ') || '-';
  const paidExact = Object.entries(totals).map(([cur, value]) => formatMoney(value, cur, { compact: false })).join(' + ') || '-';
  const valued = paidTotals.data?.amountCount ?? 0;
  const top = suppliers[0];
  const topMax = top?.count || 1;

  return (
    <div className="dash reports-page" aria-busy={report.isFetching}>
      {report.isError && (
        <p role="alert" className="chart-note">The report could not be loaded: {report.error?.message || 'try again'}.{' '}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => report.refetch()}>Retry</button></p>
      )}
      <div className="kpi-grid reports-kpis">
        <StatCard
          tone="shade-paid" icon={<CheckCircle size={16} />}
          label="Completed Invoices" value={completedCount.toLocaleString('en-IN')} sub="Payment confirmed, UTR available"
          onClick={showInvoices} active={view === 'invoices' && !activeSupplier}
        />
        <StatCard
          tone="shade-approved" icon={<Users size={16} />}
          label="Suppliers Covered" value={suppliers.length.toLocaleString('en-IN')} sub="With at least one completed invoice"
          onClick={() => setView('suppliers')} active={view === 'suppliers'}
        />
        <StatCard
          tone="shade-miro" icon={<Banknote size={16} />}
          label="Paid Value" value={<span title={paidExact}>{paidShort}</span>}
          sub={valued < completedCount ? `Amount on record for ${valued.toLocaleString('en-IN')} of ${completedCount.toLocaleString('en-IN')}` : 'Total of completed invoices'}
        />
        <StatCard
          tone="shade-total" icon={<Building size={16} />}
          label="Top Supplier" value={<span className="reports-top" title={top?.name}>{top ? top.name : '-'}</span>}
          sub={top ? `${top.count.toLocaleString('en-IN')} completed · ${formatShare(top.count, completedCount)} of all` : 'No completed invoices'}
          onClick={top ? () => pickSupplier(top.name) : undefined} active={!!top && activeSupplier === top.name}
        />
      </div>

      {view === 'suppliers' ? (
        <div className="card reports-card">
          <h3>Suppliers Covered <span className="reports-count">{suppliers.length} supplier{suppliers.length === 1 ? '' : 's'}</span>
            <span className="card-hint">ranked by completed invoices · select one to see its invoices</span></h3>
          <div className="table-scroll">
            <table className="reports-suppliers">
              <thead><tr>
                <th scope="col" className="reports-rank">#</th>
                <th scope="col">Supplier</th>
                <th scope="col" className="num">Completed invoices</th>
                <th scope="col" className="reports-share">Share</th>
                <th scope="col" className="num">Paid value</th>
              </tr></thead>
              <tbody>
                {suppliers.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>No completed invoices in this view.</td></tr>}
                {suppliers.map((s, index) => (
                  <tr key={s.name}>
                    <td className="reports-rank"><span className={index < 3 ? 'top' : ''}>{index + 1}</span></td>
                    <td><button type="button" className="link-hero" onClick={() => pickSupplier(s.name)}>{s.name}</button></td>
                    <td className="num"><b>{s.count.toLocaleString('en-IN')}</b></td>
                    <td className="reports-share">
                      <div className="reports-share-cell">
                        <span className="reports-bar" aria-hidden="true"><span style={{ width: `${(s.count / topMax) * 100}%` }} /></span>
                        <small>{formatShare(s.count, completedCount)}</small>
                      </div>
                    </td>
                    <td className="num" title={s.valued ? formatMoney(s.value, currency, { compact: false }) : undefined}>
                      {s.valued ? formatMoney(s.value, currency) : <span className="cell-muted">No amount</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card reports-card">
          <h3>
            Completed Invoices : payment confirmed, UTR available
            <span className="reports-count">{shown.total.toLocaleString('en-IN')} invoice{shown.total === 1 ? '' : 's'}</span>
          </h3>
          {activeSupplier && (
            <div className="reports-filter">
              <span className="chip reports-chip">
                Supplier: {activeSupplier}
                <button type="button" onClick={() => setSupplier('')} aria-label="Remove supplier filter"><X size={12} /></button>
              </span>
            </div>
          )}
          <InvoiceTable invoices={shown.invoices} server={shown.server} busy={shown.isFetching}
            tableKey="completedInvoices" mode="simple" bulk exportName="Vendor_Status_Report" />
        </div>
      )}
    </div>
  );
}
