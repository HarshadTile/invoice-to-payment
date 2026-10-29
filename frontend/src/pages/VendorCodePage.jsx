import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useParams, useSearchParams } from 'react-router-dom';
import { supplierForVendorCode, panFor } from '../utils/businessLogic';
import { useScope } from '../features/ui/scope';
import { selectFilteredInvoicesAnyVendor } from '../features/invoices/selectors';
import { totalsByCurrency } from '../utils/amounts';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import InvoiceFilterBar, { invoiceYMD } from '../components/invoices/InvoiceFilterBar.jsx';
import { selectHasTicketAccess } from '../features/auth/authSlice';
import { useGetTicketsQuery } from '../features/tickets/ticketsApi';
import { api } from '../api/client';
import StatCard from '../components/common/StatCard.jsx';

export default function VendorCodePage() {
  const { code: routeCode } = useParams();
  const scope = useScope();
  const code = scope.vcode || routeCode || '';
  const scoped = useSelector(selectFilteredInvoicesAnyVendor);
  const invoices = code ? scoped.filter((i) => i.vcode === code) : scoped;
  const supplier = code ? supplierForVendorCode(code) : 'All Suppliers';
  const codes = [...new Set(invoices.map((i) => i.vcode))];
  const hasTicketAccess = useSelector(selectHasTicketAccess);
  const { currentData: ticketPage, isError: ticketError } = useGetTicketsQuery({ ...(code ? { vendor_code: code } : {}), page_size: 100 }, { skip: !hasTicketAccess });
  const [extraTickets, setExtraTickets] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!ticketPage || ticketPage.total <= ticketPage.items.length) return;
    const pageSize = ticketPage.page_size || 100;
    const params = new URLSearchParams({ page_size: String(pageSize) });
    if (code) params.set('vendor_code', code);
    const pages = Math.ceil(ticketPage.total / pageSize);
    Promise.all(Array.from({ length: pages - 1 }, (_, index) => {
      const next = new URLSearchParams(params);
      next.set('page', String(index + 2));
      return api.get(`/v1/tickets/list-tickets?${next}`);
    })).then((results) => {
      if (!cancelled) setExtraTickets({ source: ticketPage, items: results.flatMap((page) => page.items) });
    }).catch(() => {
      if (!cancelled) setExtraTickets({ source: ticketPage, error: true });
    });
    return () => { cancelled = true; };
  }, [ticketPage, code]);
  const needsMore = ticketPage && ticketPage.total > ticketPage.items.length;
  const queryReady = hasTicketAccess && !ticketError && !!ticketPage
    && (!needsMore || (extraTickets?.source === ticketPage && !extraTickets.error));
  const ticketItems = [...(ticketPage?.items || []), ...(needsMore && extraTickets?.source === ticketPage ? extraTickets.items || [] : [])];
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') || '';
  const dateFrom = searchParams.has('date_from') ? searchParams.get('date_from') : '';
  const dateTo = searchParams.has('date_to') ? searchParams.get('date_to') : '';
  const update = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([k, v]) => { if (v === null) next.delete(k); else next.set(k, v); });
    setSearchParams(next, { replace: true });
  };
  const inRange = invoices.filter((i) => {
    const ymd = invoiceYMD(i, scope.dateField);
    if ((dateFrom || dateTo) && !ymd) return false;
    return (!dateFrom || ymd >= dateFrom) && (!dateTo || ymd <= dateTo);
  });
  const openTickets = ticketItems.filter((t) => ['OPEN', 'IN_PROGRESS'].includes(t.status)
    && inRange.some((i) => i.vcode === t.vendor_code && i.no === t.invoice_no && i.channel === t.channel));
  const hasOpenQuery = (invoice) => openTickets.some((t) => t.vendor_code === invoice.vcode
    && t.invoice_no === invoice.no && t.channel === invoice.channel);
  const activeKpi = searchParams.get('kpi') === 'queries' ? 'queries' : status === 'Paid' ? 'paid' : 'total';
  const shown = inRange.filter((i) => (!status || i.status === status)
    && (activeKpi !== 'queries' || (queryReady && hasOpenQuery(i))));
  const rangeLabel = !dateFrom && !dateTo ? 'all dates' : `${dateFrom || 'earliest'} to ${dateTo || 'latest'}`;
  const byCurrency = totalsByCurrency(inRange);
  const knownAmounts = inRange.filter((invoice) => Object.keys(totalsByCurrency([invoice])).length > 0).length;
  const amount = Object.entries(byCurrency).map(([currency, value]) => `${currency}${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join(' + ') || '-';
  return (
    <>
      <div className="card" style={{ marginBottom: '0.75rem', padding: '0.75rem 1.125rem' }}>
        <div className="row" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
          {[['Supplier Name', supplier], ['PAN', code ? panFor(supplier) : '-'], ['Vendor Code', code || `All Vendors (${codes.length})`]].map(([label, value], index) => (
            <div key={label} className="form-field" style={{ flex: '1 1 12.5em', marginBottom: '0rem' }}>
              <label htmlFor={`visibility-field-${index}`}>{label}</label><input id={`visibility-field-${index}`} value={value} readOnly />
            </div>
          ))}
        </div>
      </div>
      <div className="supplier-visibility-kpis">
        <StatCard label="Total Invoices" value={inRange.length} active={activeKpi === 'total' && !status}
          onClick={() => update({ kpi: null, status: null })} />
        <StatCard label="Paid" value={inRange.filter((i) => i.status === 'Paid').length} tone="good" active={activeKpi === 'paid'}
          onClick={() => update({ kpi: null, status: activeKpi === 'paid' ? null : 'Paid' })} />
        <StatCard label="Open Queries" value={queryReady ? openTickets.length : '-'} tone={queryReady && openTickets.length ? 'warn' : undefined}
          sub={!hasTicketAccess ? 'Query access unavailable' : !queryReady ? ticketError || extraTickets?.error ? 'Unable to load queries' : 'Loading queries…' : 'Unresolved queries linked to these invoices'}
          active={activeKpi === 'queries'} onClick={queryReady ? () => update({ status: null, kpi: activeKpi === 'queries' ? null : 'queries' }) : undefined} />
        <StatCard label="Total Invoice Amount" value={amount}
          sub={knownAmounts < inRange.length ? `Amount available for ${knownAmounts} of ${inRange.length} invoices` : 'Total of available invoice amounts'} />
      </div>
      <div style={{ margin: '1.25rem 0 0.875rem' }}>
        <h3 style={{ margin: '0 0 0.375rem', fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
          Invoice Status : <span style={{ color: 'var(--brand-dark)', fontWeight: 700 }}>{supplier}</span>
        </h3>
        <p style={{ margin: '0rem', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Summary based on the selected year, channel, vendor and invoice dates. Select a card to filter the invoice list.
        </p>
      </div>
      <InvoiceFilterBar status={status} dateFrom={dateFrom} dateTo={dateTo}
        onStatusChange={(v) => update({ status: v || null, kpi: null })}
        onDateFrom={(v) => update({ date_from: v })} onDateTo={(v) => update({ date_to: v })}
        onAllDates={() => update({ date_from: '', date_to: '' })}
        onClear={() => update({ status: null, kpi: null, date_from: '', date_to: '' })}
        statusCountBase={inRange} resultCount={shown.length} rangeLabel={rangeLabel}
      />
      <div className="card"><InvoiceTable invoices={shown} tableKey={`vendorCodePage-${code || 'all'}`} mode="supplierSafe" showFilteredAmount /></div>
    </>
  );
}
