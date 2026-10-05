import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { vendorCodesFor, panFor, supplierDirectory } from '../utils/businessLogic';
import { selectScopedInvoices } from '../features/invoices/selectors';
import { setSupplierVisibilityQuery } from '../features/ui/uiSlice';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import StatCard from '../components/common/StatCard.jsx';
import { useGetTicketsQuery } from '../features/tickets/ticketsApi';

export default function SupplierVisibilityPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [activeKpi, setActiveKpi] = useState('total');
  const directory = supplierDirectory(); // one row per real supplier identity (grouped by PAN)
  const savedQuery = useSelector((s) => s.ui.supplierVisibilityQuery);
  const supplier = directory.some((g) => g.name === savedQuery) ? savedQuery : (directory[0]?.name || savedQuery);
  const pan = panFor(supplier);
  const codes = vendorCodesFor(supplier);
  const scoped = useSelector(selectScopedInvoices);
  // Match by PAN (the real identity) when known, so every name spelling / vendor
  // code that belongs to this supplier is included, not just the exact string picked.
  const isSameSupplier = (i) => (pan !== '-' ? i.pan === pan : i.vendor === supplier);
  const invoices = scoped.filter(isSameSupplier);
  const { data: ticketPage } = useGetTicketsQuery({ include_closed: true, page_size: 100 });
  const ticketItems = ticketPage?.items || [];
  const openIssues = ticketItems.filter((t) => codes.includes(t.vendor_code) && ['OPEN', 'IN_PROGRESS'].includes(t.status)).length;
  const paid = invoices.filter((i) => i.status === 'Paid').length;
  const due = invoices.filter((i) => i.status === 'Payment Due').length;
  const inProgress = invoices.filter((i) => !['Paid', 'Rejected', 'Deleted'].includes(i.status));
  const withOpenIssues = invoices.filter((i) => ticketItems.some((t) => t.invoice_no === i.no && ['OPEN', 'IN_PROGRESS'].includes(t.status)));
  const kpiFilters = {
    total: invoices,
    paid: invoices.filter((i) => i.status === 'Paid'),
    due: invoices.filter((i) => i.status === 'Payment Due'),
    progress: inProgress,
    issues: withOpenIssues,
  };
  const filteredInvoices = kpiFilters[activeKpi] || invoices;
  const selectKpi = (id) => setActiveKpi((current) => (current === id ? 'total' : id));

  return (
    <>
      <h1 className="page-title">Supplier Visibility</h1>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="form-field" style={{ maxWidth: 340 }}>
          <label>Supplier</label>
          <select value={supplier} onChange={(e) => dispatch(setSupplierVisibilityQuery(e.target.value))}>
            {directory.map((g) => <option key={g.key} value={g.name}>{g.name}</option>)}
          </select>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="form-field" style={{ flex: 1 }}><label>PAN</label><input value={pan} readOnly /></div>
        </div>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', display: 'block', marginTop: 14 }}>
          Vendor Codes ({codes.length}) : click one for its own full view
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {codes.map((c) => (
            <button key={c} type="button" className="chip gray mono" style={{ cursor: 'pointer', border: 'none' }} onClick={() => navigate(`/app/vendor-code/${c}`)}>{c}</button>
          ))}
        </div>
      </div>

      <div className="row" style={{ marginBottom: 18 }}>
        <StatCard label="All Codes : Total Invoices" value={invoices.length} onClick={() => setActiveKpi('total')} active={activeKpi === 'total'} />
        <StatCard label="Paid" value={paid} onClick={() => selectKpi('paid')} active={activeKpi === 'paid'} />
        <StatCard tone="warn" label="Payment Due" value={due} onClick={() => selectKpi('due')} active={activeKpi === 'due'} />
        <StatCard label="In Progress" value={inProgress.length} onClick={() => selectKpi('progress')} active={activeKpi === 'progress'} />
        <StatCard tone={openIssues ? 'bad' : undefined} label="Open Issues" value={openIssues} onClick={() => selectKpi('issues')} active={activeKpi === 'issues'} />
      </div>

      <div className="card">
        <h3>Consolidated Invoice Status : {supplier} <span className="card-hint">{filteredInvoices.length} invoice{filteredInvoices.length === 1 ? '' : 's'}</span></h3>
        <InvoiceTable invoices={filteredInvoices} tableKey={`supplierVisibility-${activeKpi}`} mode="supplierSafe" />
      </div>
    </>
  );
}
