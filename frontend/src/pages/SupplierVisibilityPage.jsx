import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { vendorCodesFor, panFor, supplierDirectory, supplierForVendorCode } from '../utils/businessLogic';
import { useScope } from '../features/ui/scope';
import { selectFilteredInvoicesAnyVendor } from '../features/invoices/selectors';
import { setScopeFilter, setSupplierVisibilityQuery } from '../features/ui/uiSlice';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import StatCard from '../components/common/StatCard.jsx';
import { useGetTicketsQuery } from '../features/tickets/ticketsApi';

export default function SupplierVisibilityPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [activeKpi, setActiveKpi] = useState('total');
  const directory = supplierDirectory(); // one row per real supplier identity (grouped by PAN)
  const savedQuery = useSelector((s) => s.ui.supplierVisibilityQuery);
  // When a vendor is chosen in the top bar, this page shows that vendor's supplier (all of its
  // vendor codes), so the page and the top bar never disagree. Otherwise the page's own picker.
  const { vcode: scopeVcode } = useScope();
  const scopeVendorName = scopeVcode ? supplierForVendorCode(scopeVcode) : '';
  const scopePan = scopeVendorName ? panFor(scopeVendorName) : '-';
  const scopedGroup = scopeVcode
    ? directory.find((g) => (scopePan !== '-' ? g.pan === scopePan : g.name === scopeVendorName))
    : null;
  const supplier = scopedGroup
    ? scopedGroup.name
    : (directory.some((g) => g.name === savedQuery) ? savedQuery : (directory[0]?.name || savedQuery));
  // Picking another supplier here while a top-bar vendor is set moves that vendor filter too.
  const pickSupplier = (name) => {
    dispatch(setSupplierVisibilityQuery(name));
    if (scopeVcode) dispatch(setScopeFilter({ key: 'vcode', value: vendorCodesFor(name)[0] || '' }));
  };
  const pan = panFor(supplier);
  const codes = vendorCodesFor(supplier);
  // top-bar fiscal year / channel apply; the supplier is this page's own picker
  const scoped = useSelector(selectFilteredInvoicesAnyVendor);
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
      <div className="card sv-head">
        <div className="sv-field sv-supplier">
          <label htmlFor="sv-supplier">Supplier</label>
          <select id="sv-supplier" value={supplier} onChange={(e) => pickSupplier(e.target.value)}>
            {directory.map((g) => <option key={g.key} value={g.name}>{g.name}</option>)}
          </select>
        </div>
        <div className="sv-field">
          <span className="sv-label">PAN</span>
          <span className="sv-pan mono">{pan}</span>
        </div>
        <div className="sv-field sv-codes">
          <span className="sv-label">{codes.length === 1 ? 'Vendor Code' : `Vendor Codes (${codes.length})`}</span>
          <div className="sv-code-list">
            {codes.map((c) => (
              <button
                key={c} type="button" className="sv-code mono"
                title="Click here to see all details"
                onClick={() => navigate(`/app/vendor-code/${c}`)}
              >{c}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="sv-kpis">
        <StatCard label="Total Invoices" value={invoices.length} onClick={() => setActiveKpi('total')} active={activeKpi === 'total'} />
        <StatCard label="Paid" value={paid} onClick={() => selectKpi('paid')} active={activeKpi === 'paid'} />
        <StatCard tone="warn" label="Payment Due" value={due} onClick={() => selectKpi('due')} active={activeKpi === 'due'} />
        <StatCard label="In Progress" value={inProgress.length} onClick={() => selectKpi('progress')} active={activeKpi === 'progress'} />
        <StatCard tone={openIssues ? 'bad' : undefined} label="Open Issues" value={openIssues} onClick={() => selectKpi('issues')} active={activeKpi === 'issues'} />
      </div>

      <div className="card">
        <h3>Invoice Status : {supplier} <span className="card-hint">{filteredInvoices.length} invoice{filteredInvoices.length === 1 ? '' : 's'}</span></h3>
        <InvoiceTable invoices={filteredInvoices} tableKey={`supplierVisibility-${activeKpi}`} mode="supplierSafe" />
      </div>
    </>
  );
}
