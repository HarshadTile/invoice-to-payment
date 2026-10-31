import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supplierForVendorCode, panFor } from '../utils/businessLogic';
import { useScope } from '../features/ui/scope';
import { setScopeFilter } from '../features/ui/uiSlice';
import ComboField from '../components/common/ComboField.jsx';
import { selectFilteredInvoicesAnyVendor } from '../features/invoices/selectors';
import { totalsByCurrency } from '../utils/amounts';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import InvoiceFilterBar, { invoiceYMD } from '../components/invoices/InvoiceFilterBar.jsx';
import { selectHasTicketAccess } from '../features/auth/authSlice';
import { useGetTicketsQuery } from '../features/tickets/ticketsApi';
import { api } from '../api/client';
import StatCard from '../components/common/StatCard.jsx';
import { Banknote, CheckCircle, FileText, MessageSquare } from '../components/common/icons.jsx';
import { formatMoney } from '../features/invoices/dashboardMetrics';

export default function VendorCodePage() {
  const { code: routeCode } = useParams();
  const scope = useScope();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const code = scope.vcode || routeCode || '';
  const scoped = useSelector(selectFilteredInvoicesAnyVendor);

  // PAN is the supplier's legal identity: one PAN can carry several vendor codes. Build the
  // PAN → names / vendor codes directory from the invoices in scope (year / channel).
  const { byPan, byCode } = useMemo(() => {
    const pans = new Map();
    const vendorCodes = new Map();
    for (const inv of scoped) {
      const info = vendorCodes.get(inv.vcode) || { count: 0, name: inv.vendor, pan: '' };
      info.count += 1;
      if (!info.pan && inv.pan) info.pan = String(inv.pan).trim();
      vendorCodes.set(inv.vcode, info);
      const pan = String(inv.pan || '').trim();
      if (!pan) continue;
      const entry = pans.get(pan) || { names: new Map(), codes: new Set() };
      entry.names.set(inv.vendor, (entry.names.get(inv.vendor) || 0) + 1);
      entry.codes.add(inv.vcode);
      pans.set(pan, entry);
    }
    return { byPan: pans, byCode: vendorCodes };
  }, [scoped]);
  const nameOfPan = (pan) => [...(byPan.get(pan)?.names || [])].sort((a, b) => b[1] - a[1])[0]?.[0] || pan;
  // A chosen vendor code decides the PAN; otherwise the PAN picked here (kept in the URL).
  const pan = code ? (byCode.get(code)?.pan || '') : (searchParams.get('pan') || '');
  const invoices = code ? scoped.filter((i) => i.vcode === code)
    : pan ? scoped.filter((i) => String(i.pan || '').trim() === pan) : scoped;
  const supplier = code ? supplierForVendorCode(code) : pan ? nameOfPan(pan) : 'All Suppliers';
  const codes = [...new Set(invoices.map((i) => i.vcode))];

  const panOptions = useMemo(() => [
    { value: '', label: 'All PANs', sub: `${byPan.size.toLocaleString('en-IN')} suppliers` },
    ...[...byPan].map(([value, entry]) => {
      const names = [...entry.names].sort((a, b) => b[1] - a[1]).map(([name]) => name);
      return { value, label: value, sub: `${names[0]} · ${entry.codes.size} vendor code${entry.codes.size === 1 ? '' : 's'}`, search: names.join(' ') };
    }).sort((a, b) => a.sub.localeCompare(b.sub)),
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
  // the tile shows lakh / crore; the exact figure stays on hover
  const amountShort = Object.entries(byCurrency).map(([currency, value]) => formatMoney(value, currency)).join(' + ') || '-';
  const paidCount = inRange.filter((i) => i.status === 'Paid').length;
  const initials = code || pan ? supplier.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() : 'ALL';
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
          display={pan || (code ? panFor(supplier) : 'All PANs')}
          options={panOptions} onSelect={selectPan} placeholder="Search PAN or supplier name"
        />
        <ComboField
          className="sv-field sv-pick" label="Vendor Code" value={code}
          display={code || (pan ? `All codes under this PAN (${codes.length})` : `All Vendors (${codes.length})`)}
          options={vendorOptions} onSelect={selectVendor} placeholder="Search vendor code or name"
        />
      </section>

      <div className="kpi-grid supplier-visibility-kpis">
        <StatCard tone="shade-total" icon={<FileText size={16} />} label="Total Invoices" value={inRange.length.toLocaleString('en-IN')}
          sub="All statuses in this selection" active={activeKpi === 'total' && !status}
          onClick={() => update({ kpi: null, status: null })} />
        <StatCard tone="shade-paid" icon={<CheckCircle size={16} />} label="Paid" value={paidCount.toLocaleString('en-IN')} active={activeKpi === 'paid'}
          sub="Payment cleared" meter={inRange.length ? paidCount / inRange.length : 0}
          onClick={() => update({ kpi: null, status: activeKpi === 'paid' ? null : 'Paid' })} />
        <StatCard tone="shade-pending" icon={<MessageSquare size={16} />} label="Open Queries" value={queryReady ? openTickets.length : '-'}
          sub={!hasTicketAccess ? 'Query access unavailable' : !queryReady ? ticketError || extraTickets?.error ? 'Unable to load queries' : 'Loading queries…' : 'Unresolved queries linked to these invoices'}
          active={activeKpi === 'queries'} onClick={queryReady ? () => update({ status: null, kpi: activeKpi === 'queries' ? null : 'queries' }) : undefined} />
        <StatCard tone="shade-miro" icon={<Banknote size={16} />} label="Total Invoice Amount" value={<span title={amount}>{amountShort}</span>}
          sub={knownAmounts < inRange.length ? `Amount available for ${knownAmounts} of ${inRange.length} invoices` : 'Total of available invoice amounts'} />
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
        statusCountBase={inRange} resultCount={shown.length} rangeLabel={rangeLabel}
      />
      </div>
      <div className="card sv-table-card"><InvoiceTable invoices={shown} tableKey={`vendorCodePage-${code || pan || 'all'}`} mode="supplierSafe" showFilteredAmount /></div>
    </div>
  );
}
