import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { getFiscalYear } from '../../utils/businessLogic';
import { useScope } from '../../features/ui/scope';
import { selectScopedInvoices } from '../../features/invoices/selectors';
import { setSearch } from '../../features/ui/uiSlice';
import InvoiceTable from '../../components/invoices/InvoiceTable.jsx';
import StatCard from '../../components/common/StatCard.jsx';
import InvoiceFilterBar, { defaultInvoiceRange, invoiceYMD } from '../../components/invoices/InvoiceFilterBar.jsx';
import InvoiceProgressCard from '../../components/invoices/InvoiceProgressCard.jsx';

export default function SupplierHomePage() {
  const dispatch = useDispatch();
  const invoices = useSelector(selectScopedInvoices);
  const code = useSelector((s) => s.auth.supplierLoginVcode);
  const [activeKpi, setActiveKpi] = useState('total');
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters live in the URL so they survive opening an invoice and coming back
  // Default window is the last 90 days; once a financial year is picked in the top bar, that year sets the scope instead
  const scope = useScope();
  const fyChosen = scope.fyChosen;
  const range = fyChosen ? { from: '', to: '' } : defaultInvoiceRange();
  const status = searchParams.get('status') || '';
  const dateFrom = searchParams.has('date_from') ? searchParams.get('date_from') : range.from;
  const dateTo = searchParams.has('date_to') ? searchParams.get('date_to') : range.to;
  const openNo = searchParams.get('open') || '';
  const openItem = searchParams.get('item') || '';
  const invoiceSearch = searchParams.get('invoice_number') || '';
  const poSearch = searchParams.get('po_number') || '';
  const poItemSearch = searchParams.get('po_item') || '';
  const fySearch = scope.fy;

  const update = (changes, { replace = true } = {}) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([k, v]) => { if (v === null) next.delete(k); else next.set(k, v); });
    setSearchParams(next, { replace });
  };

  const codeInvoices = invoices.filter((i) => {
    if (i.vcode !== code) return false;
    const invoiceMatches = !invoiceSearch.trim() || i.no.toLowerCase().includes(invoiceSearch.trim().toLowerCase());
    const poMatches = !poSearch.trim() || i.po.toLowerCase().includes(poSearch.trim().toLowerCase());
    const itemMatches = !poItemSearch.trim() || String(i.poItem) === poItemSearch.trim();
    const fyMatches = fySearch === 'all' || getFiscalYear(i.date) === fySearch;
    return invoiceMatches && poMatches && itemMatches && fyMatches;
  });

  // ── Invoice progress view (opened by clicking an invoice number) ──
  if (openNo) {
    const opened = codeInvoices.filter((i) => i.no === openNo && (!openItem || String(i.poItem) === openItem));
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={() => update({ open: null, item: null }, { replace: false })}>← All Invoices</button>
        </div>
        {opened.length
          ? opened.map((inv, rowIndex) => <InvoiceProgressCard key={`${inv.no}-${inv.poItem}-${rowIndex}`} inv={inv} />)
          : <div className="card"><p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>Invoice {openNo} was not found on {code}.</p></div>}
      </>
    );
  }

  // ── All Invoices: date range first, then KPI cards, status filter and table ──
  const inRange = codeInvoices.filter((i) => {
    const ymd = invoiceYMD(i);
    return (!dateFrom || ymd >= dateFrom) && (!dateTo || ymd <= dateTo);
  });
  // Every invoice falls in exactly one group, so Paid + In Progress + Rejected/Deleted = Total
  const kpiFilters = {
    total: inRange,
    paid: inRange.filter((i) => i.status === 'Paid'),
    progress: inRange.filter((i) => !['Paid', 'Rejected', 'Deleted'].includes(i.status)),
    rejected: inRange.filter((i) => i.status === 'Rejected' || i.status === 'Deleted'),
  };
  const shown = (kpiFilters[activeKpi] || inRange).filter((i) => !status || i.status === status);
  // A KPI card and the status dropdown both narrow by status, so using one clears the other
  const selectKpi = (id) => {
    if (status) update({ status: null });
    setActiveKpi((current) => (current === id ? 'total' : id));
  };
  const pickStatus = (value) => {
    setActiveKpi('total');
    update({ status: value || null });
  };
  const isDefaultRange = dateFrom === range.from && dateTo === range.to;
  const rangeLabel = !dateFrom && !dateTo ? 'all dates' : (isDefaultRange ? 'last 90 days' : `${dateFrom || 'earliest'} → ${dateTo || 'latest'}`);
  // No time limit at all: every date, every financial year
  const showAllDates = () => update({ date_from: '', date_to: '', fy: 'all' });
  // Back to the page defaults: last 90 days, current financial year
  const showLast90Days = () => update({ date_from: null, date_to: null, fy: null });
  // Remove every filter: table search, KPI card, status, any search params, and the time limit
  const clearFilters = () => {
    ['total', activeKpi].forEach((k) => dispatch(setSearch({ key: `supplierAllInvoices-${k}`, value: '' })));
    setActiveKpi('total');
    update({ status: null, date_from: '', date_to: '', fy: 'all', invoice_number: null, po_number: null, po_item: null });
  };

  return (
    <>
      <div className="supplier-kpis">
        <SupplierKpi label="Total Invoices" value={kpiFilters.total.length} onClick={() => { setActiveKpi('total'); if (status) update({ status: null }); }} active={activeKpi === 'total' && !status} />
        <SupplierKpi label="Fully Paid" value={kpiFilters.paid.length} onClick={() => selectKpi('paid')} active={activeKpi === 'paid'} />
        <SupplierKpi label="Rejected / Deleted" value={kpiFilters.rejected.length} tone="red" onClick={() => selectKpi('rejected')} active={activeKpi === 'rejected'} />
        <SupplierKpi label="In Progress" value={kpiFilters.progress.length} onClick={() => selectKpi('progress')} active={activeKpi === 'progress'} />
      </div>

      <InvoiceFilterBar
        status={status} dateFrom={dateFrom} dateTo={dateTo}
        onStatusChange={pickStatus} onDateFrom={(v) => update({ date_from: v })} onDateTo={(v) => update({ date_to: v })}
        onLast90Days={showLast90Days} onAllDates={showAllDates} onClear={clearFilters}
        statusCountBase={inRange} resultCount={shown.length} rangeLabel={rangeLabel}
      />

      <div className="card">
        <InvoiceTable invoices={shown} tableKey={`supplierAllInvoices-${activeKpi}`} mode="supplierSafe" />
      </div>
    </>
  );
}

function SupplierKpi({ label, value, tone = '', onClick, active }) {
  return (
    <StatCard
      label={label}
      value={value}
      tone={tone}
      onClick={onClick}
      active={active}
    />
  );
}
