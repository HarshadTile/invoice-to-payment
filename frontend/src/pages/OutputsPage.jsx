import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { selectFilteredInvoices } from '../features/invoices/selectors';
import { formatMoney, formatShare, parseAmount } from '../features/invoices/dashboardMetrics';
import { totalsByCurrency } from '../utils/amounts';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import StatCard from '../components/common/StatCard.jsx';
import { Banknote, Building, CheckCircle, Users, X } from '../components/common/icons.jsx';

export default function OutputsPage() {
  const scoped = useSelector(selectFilteredInvoices); // the top-bar scope applies here too
  const completed = useMemo(() => scoped.filter((i) => i.status === 'Paid'), [scoped]);

  // Which list the cards switch between, and the supplier picked from the suppliers list (if any)
  const [view, setView] = useState('invoices'); // 'invoices' | 'suppliers'
  const [supplier, setSupplier] = useState('');

  // Per supplier: completed invoices and their value in the main currency (most invoices' currency).
  const { suppliers, currency } = useMemo(() => {
    const byCurrency = new Map();
    completed.forEach((i) => { const a = parseAmount(i.amount); if (a) byCurrency.set(a.currency, (byCurrency.get(a.currency) || 0) + 1); });
    const main = [...byCurrency].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '₹';
    const rows = new Map();
    completed.forEach((i) => {
      const row = rows.get(i.vendor) || { name: i.vendor, count: 0, value: 0, valued: 0 };
      row.count += 1;
      const a = parseAmount(i.amount);
      if (a && a.currency === main) { row.value += a.value; row.valued += 1; }
      rows.set(i.vendor, row);
    });
    return {
      currency: main,
      suppliers: [...rows.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    };
  }, [completed]);

  // A supplier that dropped out of the top-bar scope no longer filters anything
  const activeSupplier = suppliers.some((s) => s.name === supplier) ? supplier : '';
  const shown = useMemo(() => (activeSupplier ? completed.filter((i) => i.vendor === activeSupplier) : completed), [completed, activeSupplier]);

  const showInvoices = () => { setView('invoices'); setSupplier(''); };
  const pickSupplier = (name) => { setSupplier(name); setView('invoices'); };

  const totals = totalsByCurrency(completed);
  const paidShort = Object.entries(totals).map(([cur, value]) => formatMoney(value, cur)).join(' + ') || '-';
  const paidExact = Object.entries(totals).map(([cur, value]) => formatMoney(value, cur, { compact: false })).join(' + ') || '-';
  const valued = completed.filter((i) => parseAmount(i.amount)).length;
  const top = suppliers[0];
  const topMax = top?.count || 1;

  return (
    <div className="dash reports-page">
      <div className="kpi-grid reports-kpis">
        <StatCard
          tone="shade-paid" icon={<CheckCircle size={16} />}
          label="Completed Invoices" value={completed.length.toLocaleString('en-IN')} sub="Payment confirmed, UTR available"
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
          sub={valued < completed.length ? `Amount on record for ${valued.toLocaleString('en-IN')} of ${completed.length.toLocaleString('en-IN')}` : 'Total of completed invoices'}
        />
        <StatCard
          tone="shade-total" icon={<Building size={16} />}
          label="Top Supplier" value={<span className="reports-top" title={top?.name}>{top ? top.name : '-'}</span>}
          sub={top ? `${top.count.toLocaleString('en-IN')} completed · ${formatShare(top.count, completed.length)} of all` : 'No completed invoices'}
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
                        <small>{formatShare(s.count, completed.length)}</small>
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
            <span className="reports-count">{shown.length.toLocaleString('en-IN')} invoice{shown.length === 1 ? '' : 's'}</span>
          </h3>
          {activeSupplier && (
            <div className="reports-filter">
              <span className="chip reports-chip">
                Supplier: {activeSupplier}
                <button type="button" onClick={() => setSupplier('')} aria-label="Remove supplier filter"><X size={12} /></button>
              </span>
            </div>
          )}
          <InvoiceTable invoices={shown} tableKey="completedInvoices" mode="simple" bulk exportName="Vendor_Status_Report" />
        </div>
      )}
    </div>
  );
}
