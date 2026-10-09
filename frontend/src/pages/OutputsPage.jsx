import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { selectFilteredInvoices } from '../features/invoices/selectors';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import StatCard from '../components/common/StatCard.jsx';
import { X } from '../components/common/icons.jsx';

export default function OutputsPage() {
  const scoped = useSelector(selectFilteredInvoices); // the top-bar scope applies here too
  const completed = useMemo(() => scoped.filter((i) => i.status === 'Paid'), [scoped]);

  // Which list the cards switch between, and the supplier picked from the suppliers list (if any)
  const [view, setView] = useState('invoices'); // 'invoices' | 'suppliers'
  const [supplier, setSupplier] = useState('');

  const suppliers = useMemo(() => {
    const counts = new Map();
    completed.forEach((i) => counts.set(i.vendor, (counts.get(i.vendor) || 0) + 1));
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [completed]);

  // A supplier that dropped out of the top-bar scope no longer filters anything
  const activeSupplier = suppliers.some((s) => s.name === supplier) ? supplier : '';
  const shown = useMemo(() => (activeSupplier ? completed.filter((i) => i.vendor === activeSupplier) : completed), [completed, activeSupplier]);

  const showInvoices = () => { setView('invoices'); setSupplier(''); };
  const pickSupplier = (name) => { setSupplier(name); setView('invoices'); };

  return (
    <>
      <div className="row" style={{ marginBottom: 18 }}>
        <StatCard
          label="Completed Invoices" value={completed.length}
          onClick={showInvoices} active={view === 'invoices' && !activeSupplier}
        />
        <StatCard
          label="Suppliers Covered" value={suppliers.length}
          onClick={() => setView('suppliers')} active={view === 'suppliers'}
        />
      </div>

      {view === 'suppliers' ? (
        <div className="card">
          <h3>Suppliers Covered <span className="card-hint">{suppliers.length} supplier{suppliers.length === 1 ? '' : 's'}</span></h3>
          <div className="table-scroll">
            <table>
              <thead><tr><th scope="col">Supplier</th><th scope="col" className="num">Completed invoices</th></tr></thead>
              <tbody>
                {suppliers.length === 0 && <tr><td colSpan={2} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No completed invoices in this view.</td></tr>}
                {suppliers.map((s) => (
                  <tr key={s.name}>
                    <td><button type="button" className="link-hero" onClick={() => pickSupplier(s.name)}>{s.name}</button></td>
                    <td className="num">{s.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <h3>
            Completed Invoices : payment confirmed, UTR available
            <span className="card-hint">{shown.length} invoice{shown.length === 1 ? '' : 's'}</span>
          </h3>
          {activeSupplier && (
            <div style={{ margin: '0 0 12px' }}>
              <span className="chip blue" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                Supplier: {activeSupplier}
                <button type="button" onClick={() => setSupplier('')} aria-label="Remove supplier filter" style={{ border: 0, background: 'none', padding: 0, display: 'inline-flex', cursor: 'pointer', color: 'inherit' }}><X size={12} /></button>
              </span>
            </div>
          )}
          <InvoiceTable invoices={shown} tableKey="completedInvoices" mode="simple" bulk />
        </div>
      )}
    </>
  );
}
