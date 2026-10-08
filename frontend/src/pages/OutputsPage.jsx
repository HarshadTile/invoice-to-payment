import { runtime } from '../data/runtime';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';

export default function OutputsPage() {
  const completed = runtime.invoices.filter((i) => i.status === 'Paid');
  const bySupplier = {};
  completed.forEach((i) => { bySupplier[i.vendor] = (bySupplier[i.vendor] || 0) + 1; });

  return (
    <>
      <h1 className="page-title">Vendor Status Reports</h1>
      <div className="row" style={{ marginBottom: 18 }}>
        <div className="stat-card"><div className="lbl">Completed Invoices</div><div className="val">{completed.length}</div></div>
        <div className="stat-card"><div className="lbl">Suppliers Covered</div><div className="val">{Object.keys(bySupplier).length}</div></div>
      </div>
      <div className="card">
        <h3>Completed Invoices : payment confirmed, UTR available</h3>
        <InvoiceTable invoices={completed} tableKey="completedInvoices" mode="simple" bulk />
      </div>
    </>
  );
}
