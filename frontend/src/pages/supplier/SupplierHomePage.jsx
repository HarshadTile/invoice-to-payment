import { useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useScope } from '../../features/ui/scope';
import { setSearch } from '../../features/ui/uiSlice';
import { formatCount, formatMoney, parseAmount } from '../../features/invoices/dashboardMetrics';
import { SUPPLIER_KPIS, supplierKpiFilter } from '../../features/invoices/supplierMetrics';
import useSupplierInvoices from './useSupplierInvoices';
import InvoiceTable from '../../components/invoices/InvoiceTable.jsx';
import StatCard from '../../components/common/StatCard.jsx';
import InvoiceFilterBar, { invoiceYMD } from '../../components/invoices/InvoiceFilterBar.jsx';
import InvoiceProgressCard from '../../components/invoices/InvoiceProgressCard.jsx';
import { Breadcrumb, useBreadcrumbLabel } from '../../components/layout/Breadcrumb.jsx';
import { Banknote, Clock, FileText, Layers, X } from '../../components/common/icons.jsx';

// The cards on this page; other KPI lists (overdue, upcoming) arrive from the Dashboard as a chip.
const CARDS = [
  { id: 'total', icon: FileText, tone: 'shade-total' },
  { id: 'progress', icon: Clock, tone: 'shade-pending' },
  { id: 'awaiting', icon: Layers, tone: 'shade-approved' },
  { id: 'paid', icon: Banknote, tone: 'shade-paid' },
  { id: 'rejected', icon: X, tone: 'shade-miro' },
];

export default function SupplierHomePage() {
  const dispatch = useDispatch();
  const supplierInvoices = useSupplierInvoices();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters live in the URL so they survive opening an invoice and coming back
  const scope = useScope();
  const status = searchParams.get('status') || '';
  const kpiParam = searchParams.get('kpi') || 'total';
  const activeKpi = SUPPLIER_KPIS[kpiParam] ? kpiParam : 'total';
  const dateFrom = searchParams.has('date_from') ? searchParams.get('date_from') : '';
  const dateTo = searchParams.has('date_to') ? searchParams.get('date_to') : '';
  const openNo = searchParams.get('open') || '';
  const openItem = searchParams.get('item') || '';
  const invoiceSearch = searchParams.get('invoice_number') || '';
  const poSearch = searchParams.get('po_number') || '';
  const poItemSearch = searchParams.get('po_item') || '';

  const update = (changes, { replace = true } = {}) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([k, v]) => { if (v === null) next.delete(k); else next.set(k, v); });
    setSearchParams(next, { replace });
  };

  const codeInvoices = supplierInvoices.filter((i) => {
    const invoiceMatches = !invoiceSearch.trim() || i.no.toLowerCase().includes(invoiceSearch.trim().toLowerCase());
    const poMatches = !poSearch.trim() || i.po.toLowerCase().includes(poSearch.trim().toLowerCase());
    const itemMatches = !poItemSearch.trim() || String(i.poItem) === poItemSearch.trim();
    return invoiceMatches && poMatches && itemMatches;
  });

  // The breadcrumb names the list that is open ("My Invoices · Fully Paid").
  useBreadcrumbLabel(!openNo && activeKpi !== 'total' ? `My Invoices · ${SUPPLIER_KPIS[activeKpi].label}` : null);

  // ── All Invoices: date range first, then KPI cards, status filter and table ──
  const inRange = codeInvoices.filter((i) => {
    const ymd = invoiceYMD(i, scope.dateField);
    if ((dateFrom || dateTo) && !ymd) return false;
    return (!dateFrom || ymd >= dateFrom) && (!dateTo || ymd <= dateTo);
  });
  // Deleted entries are excluded by the supplier selector before any counts.
  const kpiLists = Object.fromEntries(Object.keys(SUPPLIER_KPIS).map((id) => [id, inRange.filter(supplierKpiFilter(id))]));

  // ── Invoice progress view (opened by clicking an invoice number) ──
  if (openNo) {
    const opened = codeInvoices.filter((i) => i.no === openNo && (!openItem || String(i.poItem) === openItem)
      && (!searchParams.get('source_id') || i.sourceId === searchParams.get('source_id')));
    return (
      <div className="supplier-invoice-view">
        <Breadcrumb parent="My Invoices" current={`Invoice ${openNo}`} hint="Progress, payment and UTR for this invoice"
          onBack={() => update({ open: null, item: null, source_id: null }, { replace: false })} />
        {opened.length
          ? opened.map((inv, rowIndex) => <InvoiceProgressCard key={`${inv.no}-${inv.poItem}-${rowIndex}`} inv={inv} />)
          : <div className="card"><p style={{ fontSize: '0.78125rem', color: 'var(--text-muted)', margin: '0rem' }}>Invoice {openNo} was not found for this vendor code.</p></div>}
      </div>
    );
  }

  const shown = (kpiLists[activeKpi] || inRange).filter((i) => !status || i.status === status);
  // A KPI card and the status dropdown both narrow by status, so using one clears the other
  const selectKpi = (id) => update({ kpi: activeKpi === id || id === 'total' ? null : id, status: null });
  const pickStatus = (value) => update({ kpi: null, status: value || null });
  const rangeLabel = !dateFrom && !dateTo ? 'all dates' : `${dateFrom || 'earliest'} → ${dateTo || 'latest'}`;
  // No time limit at all: every date, every financial year
  const showAllDates = () => update({ date_from: '', date_to: '', fy: 'all' });
  // Remove every filter: table search, KPI card, status, any search params, and the time limit
  const clearFilters = () => {
    ['total', activeKpi].forEach((k) => dispatch(setSearch({ key: `supplierAllInvoices-${k}`, value: '' })));
    update({ kpi: null, status: null, date_from: '', date_to: '', fy: 'all', invoice_number: null, po_number: null, po_item: null });
  };

  const valueOf = (list) => {
    const totals = {};
    list.forEach((i) => { const a = parseAmount(i.amount); if (a) totals[a.currency] = (totals[a.currency] || 0) + a.value; });
    const main = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
    return main ? formatMoney(main[1], main[0]) : 'No amount on record';
  };
  const isCard = CARDS.some((c) => c.id === activeKpi);

  return (
    <div className="dash supplier-home">
      <div className="kpi-grid supplier-kpis">
        {CARDS.map(({ id, icon: Icon, tone }) => (
          <StatCard
            key={id} tone={tone} icon={<Icon size={16} />}
            label={SUPPLIER_KPIS[id].label} value={formatCount(kpiLists[id].length)}
            foot={valueOf(kpiLists[id])}
            onClick={() => selectKpi(id)} active={activeKpi === id && (id !== 'total' || !status)}
          />
        ))}
      </div>

      <div className="card supplier-register">
        <div className="supplier-register-head">
          <h3>Invoice Register <span className="reports-count">{formatCount(shown.length)} invoice{shown.length === 1 ? '' : 's'}</span></h3>
          {!isCard && (
            <span className="chip reports-chip">
              {SUPPLIER_KPIS[activeKpi].label}
              <button type="button" onClick={() => update({ kpi: null })} aria-label={`Remove ${SUPPLIER_KPIS[activeKpi].label} filter`}><X size={12} /></button>
            </span>
          )}
        </div>
        <InvoiceFilterBar
          compact
          status={status} dateFrom={dateFrom} dateTo={dateTo}
          onStatusChange={pickStatus} onDateFrom={(v) => update({ date_from: v })} onDateTo={(v) => update({ date_to: v })}
          onAllDates={showAllDates} onClear={clearFilters}
          statusCountBase={inRange} resultCount={shown.length} rangeLabel={rangeLabel}
        />
        <InvoiceTable invoices={shown} tableKey={`supplierAllInvoices-${activeKpi}`} mode="supplierSafe" />
      </div>
    </div>
  );
}
