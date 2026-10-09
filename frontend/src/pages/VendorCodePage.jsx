import { useSelector } from 'react-redux';
import { useParams, useSearchParams } from 'react-router-dom';
import { supplierForVendorCode, panFor } from '../utils/businessLogic';
import { useScope } from '../features/ui/scope';
import { selectFilteredInvoicesAnyVendor } from '../features/invoices/selectors';
import { totalsByCurrency } from '../utils/amounts';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import InvoiceFilterBar, { defaultInvoiceRange, invoiceYMD } from '../components/invoices/InvoiceFilterBar.jsx';
import { selectHasTicketAccess } from '../features/auth/authSlice';
import { useGetTicketsQuery } from '../features/tickets/ticketsApi';

export default function VendorCodePage() {
  const { code: routeCode } = useParams();
  const scope = useScope();
  const code = scope.vcode || routeCode || '';
  const scoped = useSelector(selectFilteredInvoicesAnyVendor);
  const invoices = code ? scoped.filter((i) => i.vcode === code) : scoped;
  const supplier = code ? supplierForVendorCode(code) : 'All Suppliers';
  const codes = [...new Set(invoices.map((i) => i.vcode))];
  const hasTicketAccess = useSelector(selectHasTicketAccess);
  const { data: ticketPage } = useGetTicketsQuery({ ...(code ? { vendor_code: code } : {}), page_size: 100 }, { skip: !hasTicketAccess });
  const openIssues = (ticketPage?.items || []).filter((t) =>
    ['OPEN', 'IN_PROGRESS'].includes(t.status)
    && invoices.some((i) => i.vcode === t.vendor_code && i.no === t.invoice_no && i.channel === t.channel),
  ).length;
  const [searchParams, setSearchParams] = useSearchParams();
  const range = scope.fyChosen ? { from: '', to: '' } : defaultInvoiceRange();
  const status = searchParams.get('status') || '';
  const dateFrom = searchParams.has('date_from') ? searchParams.get('date_from') : range.from;
  const dateTo = searchParams.has('date_to') ? searchParams.get('date_to') : range.to;
  const update = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([k, v]) => { if (v === null) next.delete(k); else next.set(k, v); });
    setSearchParams(next, { replace: true });
  };
  const inRange = invoices.filter((i) => {
    const ymd = invoiceYMD(i);
    return (!dateFrom || ymd >= dateFrom) && (!dateTo || ymd <= dateTo);
  });
  const shown = inRange.filter((i) => !status || i.status === status);
  const rangeLabel = !dateFrom && !dateTo ? 'all dates' : `${dateFrom || 'earliest'} to ${dateTo || 'latest'}`;
  const byCurrency = totalsByCurrency(invoices);
  const stats = [
    ['Total Invoices', invoices.length],
    ['Total POs', new Set(invoices.map((i) => i.po).filter((po) => po && po !== '-')).size],
    ['Total Amount', Object.entries(byCurrency).map(([c, v]) => `${c}${v.toLocaleString('en-IN')}`).join(' + ') || '-'],
    ['Paid', invoices.filter((i) => i.status === 'Paid').length],
    ['Payment Due', invoices.filter((i) => i.status === 'Payment Due').length],
    ['In Progress', invoices.filter((i) => !['Paid', 'Payment Due', 'Rejected', 'Deleted'].includes(i.status)).length],
    ['Open Issues', openIssues],
  ];
  return (
    <>
      <div className="card" style={{ marginBottom: 12, padding: '12px 18px' }}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          {[['Supplier Name', supplier], ['PAN', code ? panFor(supplier) : '-'], ['Vendor Code', code || `All Vendors (${codes.length})`]].map(([label, value], index) => (
            <div key={label} className="form-field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
              <label htmlFor={`visibility-field-${index}`}>{label}</label><input id={`visibility-field-${index}`} value={value} readOnly />
            </div>
          ))}
        </div>
      </div>
      <div className="row" style={{ marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        {stats.map(([label, value]) => (
          <div key={label} className={`stat-card${label === 'Payment Due' ? ' warn' : label === 'Open Issues' && openIssues ? ' bad' : ''}`} style={{ minWidth: 0, flex: '1 1 140px' }}>
            <div className="lbl">{label}</div><div className="val" style={label === 'Total Amount' ? { fontSize: 15 } : undefined}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{ margin: '20px 0 14px' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 600, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
          Invoice Status : <span style={{ color: 'var(--brand-dark)', fontWeight: 700 }}>{supplier}</span>
        </h3>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Summary based on the selected year, channel and vendor. Refine the invoice list by status or date below.
        </p>
      </div>
      <InvoiceFilterBar status={status} dateFrom={dateFrom} dateTo={dateTo}
        onStatusChange={(v) => update({ status: v || null })}
        onDateFrom={(v) => update({ date_from: v })} onDateTo={(v) => update({ date_to: v })}
        onLast90Days={() => { const last90 = defaultInvoiceRange(); update({ date_from: last90.from, date_to: last90.to }); }}
        onAllDates={() => update({ date_from: '', date_to: '' })}
        onClear={() => update({ status: null, date_from: '', date_to: '' })}
        statusCountBase={inRange} resultCount={shown.length} rangeLabel={rangeLabel}
      />
      <div className="card"><InvoiceTable invoices={shown} tableKey={`vendorCodePage-${code || 'all'}`} mode="supplierSafe" /></div>
    </>
  );
}
