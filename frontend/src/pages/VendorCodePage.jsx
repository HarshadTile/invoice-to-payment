import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useScope } from '../features/ui/scope';
import { setScopeFilter } from '../features/ui/uiSlice';
import ComboField from '../components/common/ComboField.jsx';
import {
  useGetInvoiceDashboardQuery, useGetInvoiceFacetsQuery, useGetInvoicePageQuery, useGetInvoicePansQuery, useGetInvoiceVendorsQuery,
} from '../api/invoicesQueryApi';
import { useInvoiceScopeParams } from '../features/invoices/useInvoiceScopeParams';
import useServerInvoiceTable from '../features/invoices/useServerInvoiceTable';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import InvoiceFilterBar from '../components/invoices/InvoiceFilterBar.jsx';
import { selectHasTicketAccess } from '../features/auth/authSlice';
import { fetchTicketPage, useGetTicketsQuery } from '../api/ticketsApi';
import StatCard from '../components/common/StatCard.jsx';
import { Banknote, CheckCircle, FileText, MessageSquare } from '../components/common/icons.jsx';
import { formatMoney } from '../features/invoices/dashboardMetrics';
import { initialsOf } from '../utils/initials';

export default function VendorCodePage() {
  const { code: routeCode } = useParams();
  const scope = useScope();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const code = scope.vcode || routeCode || '';
  // The year / channel scope applies; the vendor is this page's own choice.
  const scopeParams = useInvoiceScopeParams();
  const base = useMemo(() => ({ ...scopeParams, vendor_code: undefined }), [scopeParams]);

  // PAN is the supplier's legal identity: one PAN can carry several vendor codes. The PAN and vendor-code
  // directories come from the server, for the invoices in scope (year / channel).
  const panList = useGetInvoicePansQuery(base);
  const vendorList = useGetInvoiceVendorsQuery({ ...base, limit: 5000 });
  const byPan = useMemo(() => new Map((panList.data || []).map((entry) => [entry.pan, entry])), [panList.data]);
  const byCode = useMemo(() => new Map((vendorList.data || []).map((v) => [v.code, v])), [vendorList.data]);
  const nameOfPan = (pan) => byPan.get(pan)?.name || pan;
  // A chosen vendor code decides the PAN; otherwise the PAN picked here (kept in the URL).
  const pan = code ? (byCode.get(code)?.pan || '') : (searchParams.get('pan') || '');
  const loadingNames = panList.isLoading || vendorList.isLoading;
  const supplier = code ? (byCode.get(code)?.name || (loadingNames ? '…' : '-')) : pan ? nameOfPan(pan) : 'All Suppliers';
  const codes = code ? [code] : pan ? byPan.get(pan)?.codes || [] : [...byCode.keys()];
  const selection = useMemo(() => ({ ...base, vendor_code: code || undefined, pan: !code && pan ? pan : undefined }), [base, code, pan]);

  const panOptions = useMemo(() => [
    { value: '', label: 'All PANs', sub: `${byPan.size.toLocaleString('en-IN')} suppliers` },
    ...[...byPan.values()].map((entry) => ({
      value: entry.pan, label: entry.pan, search: entry.names.join(' '),
      sub: `${entry.name} · ${entry.codes.length} vendor code${entry.codes.length === 1 ? '' : 's'}`,
    })).sort((a, b) => a.sub.localeCompare(b.sub)),
  ], [byPan]);
  const vendorOptions = useMemo(() => {
    const list = pan ? [...(byPan.get(pan)?.codes || [])] : [...byCode.keys()];
    return [
      { value: '', label: pan ? `All ${list.length} vendor code${list.length === 1 ? '' : 's'} under this PAN` : `All Vendors (${list.length})` },
      ...list.sort().map((value) => {
        const info = byCode.get(value);
        return { value, label: value, sub: `${info?.name || ''} · ${(info?.count || 0).toLocaleString('en-IN')} invoices` };
      }),
    ];
  }, [pan, byPan, byCode]);

  /** Moves to /app/supplier-visibility when the page was opened from a vendor-code link. */
  const openSelection = (nextPan, nextCode) => {
    dispatch(setScopeFilter({ key: 'vcode', value: nextCode }));
    const next = new URLSearchParams(searchParams);
    if (nextPan && !nextCode) next.set('pan', nextPan); else next.delete('pan');
    next.delete('kpi');
    if (routeCode) navigate(`/app/supplier-visibility?${next.toString()}`);
    else setSearchParams(next, { replace: true });
  };
  // A new PAN drops a vendor code that is not one of its own.
  const selectPan = (nextPan) => openSelection(nextPan, code && byCode.get(code)?.pan === nextPan ? code : '');
  const selectVendor = (nextCode) => openSelection(nextCode ? byCode.get(nextCode)?.pan || '' : pan, nextCode);
  const hasTicketAccess = useSelector(selectHasTicketAccess);
  const { currentData: ticketPage, isError: ticketError } = useGetTicketsQuery({ ...(code ? { vendor_code: code } : {}), page_size: 100 }, { skip: !hasTicketAccess });
  const [extraTickets, setExtraTickets] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!ticketPage || ticketPage.total <= ticketPage.items.length) return;
    const pageSize = ticketPage.page_size || 100;
    const pages = Math.ceil(ticketPage.total / pageSize);
    Promise.all(Array.from({ length: pages - 1 }, (_, index) => fetchTicketPage({ page_size: pageSize, vendor_code: code, page: index + 2 }))).then((results) => {
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
  const status = searchParams.get('status') || '';
  const dateFrom = searchParams.has('date_from') ? searchParams.get('date_from') : '';
  const dateTo = searchParams.has('date_to') ? searchParams.get('date_to') : '';
  const update = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([k, v]) => { if (v === null) next.delete(k); else next.set(k, v); });
    setSearchParams(next, { replace: true });
  };
  // The selection within the chosen invoice dates: the cards, status counts and list all start here.
  const inRangeFilters = useMemo(() => ({ ...selection, date_from: dateFrom || undefined, date_to: dateTo || undefined }),
    [selection, dateFrom, dateTo]);
  const inRange = useGetInvoiceDashboardQuery(inRangeFilters);
  const statusFacet = useGetInvoiceFacetsQuery({ ...inRangeFilters, fields: ['status'] });
  const inRangeCount = inRange.data?.total.count ?? 0;

  // Open queries: the unresolved tickets whose invoice is in this selection (same vendor, invoice, channel).
  const openCandidates = ticketItems.filter((t) => ['OPEN', 'IN_PROGRESS'].includes(t.status));
  const ticketInvoiceNos = [...new Set(openCandidates.map((t) => t.invoice_no))].sort();
  const queried = useGetInvoicePageQuery({ ...inRangeFilters, invoice_numbers: ticketInvoiceNos, page: 1, page_size: 1000 },
    { skip: !queryReady || !ticketInvoiceNos.length });
  const queriedInvoices = queried.data?.items || [];
  const openTickets = openCandidates.filter((t) => queriedInvoices.some((i) => i.vcode === t.vendor_code
    && i.no === t.invoice_no && i.channel === t.channel));
  const hasOpenQuery = (invoice) => openTickets.some((t) => t.vendor_code === invoice.vcode
    && t.invoice_no === invoice.no && t.channel === invoice.channel);
  const queriesReady = queryReady && (!ticketInvoiceNos.length || !!queried.data);
  const activeKpi = searchParams.get('kpi') === 'queries' ? 'queries' : status === 'Paid' ? 'paid' : 'total';

  // The list: paged on the server, except "Open Queries", which is the handful matched above.
  const listFilters = useMemo(() => ({ ...inRangeFilters, statuses: status ? [status] : undefined }), [inRangeFilters, status]);
  const tableKey = `vendorCodePage-${code || pan || 'all'}`;
  const list = useServerInvoiceTable({ tableKey, filters: listFilters, skip: activeKpi === 'queries' });
  const listTotals = useGetInvoiceDashboardQuery(list.query, { skip: activeKpi === 'queries' });
  const queryRows = activeKpi === 'queries' ? queriedInvoices.filter((i) => (!status || i.status === status) && hasOpenQuery(i)) : [];
  const shownCount = activeKpi === 'queries' ? queryRows.length : list.total;
  const moneyText = (byCurrency) => Object.entries(byCurrency || {}).map(([currency, value]) =>
    `${currency}${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join(' + ');
  const server = useMemo(() => (!listTotals.data ? list.server : {
    ...list.server,
    amountSummary: { known: listTotals.data.amountCount, value: moneyText(listTotals.data.totalsByCurrency) || (list.total ? 'Not available' : '—') },
  }), [list.server, list.total, listTotals.data]);

  const rangeLabel = !dateFrom && !dateTo ? 'all dates' : `${dateFrom || 'earliest'} to ${dateTo || 'latest'}`;
  const byCurrency = inRange.data?.totalsByCurrency || {};
  const knownAmounts = inRange.data?.amountCount ?? 0;
  const amount = moneyText(byCurrency) || '-';
  // the tile shows lakh / crore; the exact figure stays on hover
  const amountShort = Object.entries(byCurrency).map(([currency, value]) => formatMoney(value, currency)).join(' + ') || '-';
  const paidCount = inRange.data?.kpi.paid.count ?? 0;
  const initials = code || pan ? initialsOf(supplier) : 'ALL';
  return (
    <div className="dash sv-page">
      {/* supplier profile: who the figures below are for */}
      <section className="card sv-profile" aria-label="Supplier">
        <span className="sv-avatar" aria-hidden="true">{initials}</span>
        <div className="sv-field sv-name">
          <label htmlFor="visibility-supplier">Supplier Name</label>
          <input id="visibility-supplier" value={supplier} readOnly title={supplier} />
        </div>
        {/* pick a PAN (search by PAN or supplier name), then one of its vendor codes, or all of them */}
        <ComboField
          className="sv-field sv-pick" label="PAN" value={pan}
          display={pan || (code ? '-' : 'All PANs')}
          options={panOptions} onSelect={selectPan} placeholder="Search PAN or supplier name"
        />
        <ComboField
          className="sv-field sv-pick" label="Vendor Code" value={code}
          display={code || (pan ? `All codes under this PAN (${codes.length})` : `All Vendors (${codes.length})`)}
          options={vendorOptions} onSelect={selectVendor} placeholder="Search vendor code or name"
        />
      </section>

      <div className="kpi-grid supplier-visibility-kpis">
        <StatCard tone="shade-total" icon={<FileText size={16} />} label="Total Invoices" value={inRangeCount.toLocaleString('en-IN')}
          sub="All statuses in this selection" active={activeKpi === 'total' && !status}
          onClick={() => update({ kpi: null, status: null })} />
        <StatCard tone="shade-paid" icon={<CheckCircle size={16} />} label="Paid" value={paidCount.toLocaleString('en-IN')} active={activeKpi === 'paid'}
          sub="Payment cleared" meter={inRangeCount ? paidCount / inRangeCount : 0}
          onClick={() => update({ kpi: null, status: activeKpi === 'paid' ? null : 'Paid' })} />
        <StatCard tone="shade-pending" icon={<MessageSquare size={16} />} label="Open Queries" value={queriesReady ? openTickets.length : '-'}
          sub={!hasTicketAccess ? 'Query access unavailable' : !queriesReady ? ticketError || extraTickets?.error || queried.isError ? 'Unable to load queries' : 'Loading queries…' : 'Unresolved queries linked to these invoices'}
          active={activeKpi === 'queries'} onClick={queriesReady ? () => update({ status: null, kpi: activeKpi === 'queries' ? null : 'queries' }) : undefined} />
        <StatCard tone="shade-miro" icon={<Banknote size={16} />} label="Total Invoice Amount" value={<span title={amount}>{amountShort}</span>}
          sub={knownAmounts < inRangeCount ? `Amount available for ${knownAmounts} of ${inRangeCount} invoices` : 'Total of available invoice amounts'} />
      </div>

      <div className="sv-section-head">
        <h3>Invoice Status : <span>{supplier}</span></h3>
        <p>Summary based on the selected year, channel, vendor and invoice dates. Select a card to filter the invoice list.</p>
      </div>
      <div className="card sv-filter-card">
      <InvoiceFilterBar compact status={status} dateFrom={dateFrom} dateTo={dateTo}
        onStatusChange={(v) => update({ status: v || null, kpi: null })}
        onDateFrom={(v) => update({ date_from: v })} onDateTo={(v) => update({ date_to: v })}
        onAllDates={() => update({ date_from: '', date_to: '' })}
        onClear={() => update({ status: null, kpi: null, date_from: '', date_to: '' })}
        statusCounts={statusFacet.data?.status || {}} resultCount={shownCount} rangeLabel={rangeLabel}
      />
      </div>
      <div className="card sv-table-card" aria-busy={inRange.isFetching || list.isFetching}>
        {activeKpi === 'queries'
          ? <InvoiceTable invoices={queryRows} tableKey={`${tableKey}-queries`} mode="supplierSafe" showFilteredAmount />
          : <InvoiceTable invoices={list.invoices} server={server} busy={list.isFetching} tableKey={tableKey} mode="supplierSafe" showFilteredAmount />}
      </div>
    </div>
  );
}
