import InvoiceDateTypeFilter from '../components/invoices/InvoiceDateTypeFilter.jsx';
import { invoiceYMD } from '../components/invoices/InvoiceFilterBar.jsx';
import { calendarMonthOf, invoiceDateTypeLabel } from '../utils/invoiceDates';
import { useState, useCallback, useRef, useEffect, useMemo, useDeferredValue } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { invoiceFiscalYear, selectFilteredInvoices } from '../features/invoices/selectors';
import { useScope } from '../features/ui/scope';
import { clearScopeFilters, setPageFilters, setScopeFilter } from '../features/ui/uiSlice';
import { CHANNELS, INVOICE_FILTER_STATUSES } from '../data/constants';
import { searchInvoiceRows, parseInvoiceQuery, INVOICE_SEARCH_PLACEHOLDER, INVOICE_SEARCH_LABEL } from '../utils/invoiceQuery';
import { invoiceProductType } from '../utils/businessLogic';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import Dropdown from '../components/common/Dropdown.jsx';
import { Clock, RotateCcw, Search, X } from '../components/common/icons.jsx';
import { useBreadcrumbLabel } from '../components/layout/Breadcrumb.jsx';

const ALL_STATUSES = INVOICE_FILTER_STATUSES;

/* ── Helpers ───────────────────────────────────────────────────────── */
function fmtDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  return `${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]} ${y}`;
}

function getParam(params, key, fallback = '') {
  const v = params.get(key);
  return v !== null ? v : fallback;
}

/* ── Unified removable chip ─────────────────────────────────────────── */
function FilterChip({ label, value, onRemove, tone = 'brand' }) {
  const styles = {
    brand: { bg: 'var(--brand-tint)', border: '#f0c7ce', color: 'var(--brand-dark)', btnColor: 'var(--brand)' },
    blue:  { bg: '#EFF6FF',           border: '#93C5FD',  color: '#1D4ED8',           btnColor: '#3B82F6' },
    amber: { bg: 'var(--amber-bg)',   border: '#FCD34D',  color: 'var(--amber)',       btnColor: 'var(--amber)' },
  }[tone] ?? styles.brand;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3125rem',
      padding: '0.1875rem 0.5rem 0.1875rem 0.625rem', borderRadius: '1.25rem',
      background: styles.bg, border: `0.0625em solid ${styles.border}`,
      fontSize: '0.75rem', fontWeight: 600, color: styles.color,
    }}>
      <span style={{ opacity: .65, fontWeight: 400, fontSize: '0.6875rem' }}>{label}:</span>
      {value}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: styles.btnColor, fontSize: '0.9375rem', lineHeight: 1,
          padding: '0 0.0625rem', marginLeft: '0.0625rem', opacity: .8,
        }}
      >×</button>
    </span>
  );
}

/* ── Page ────────────────────────────────────────────────────────────── */
const PAGE_FILTER_KEY = 'searchInvoice';

export default function SearchInvoicePage() {
  const dispatch = useDispatch();
  const invoices = useSelector(selectFilteredInvoices); // already narrowed to the top-bar scope
  const { fy, channel, vcode: vendor, dateField } = useScope();
  const dateLabel = invoiceDateTypeLabel(dateField).replace(/\b\w/g, (letter) => letter.toUpperCase());
  const savedFilters = useSelector((s) => s.ui.pageFilters[PAGE_FILTER_KEY]);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // Arrived by clicking a KPI card on Invoice Tracking: offer the way back
  const fromTracking = searchParams.get('from') === 'tracking';

  // The sidebar always links here with a bare URL, so a fresh visit (no filter
  // params at all) restores the last filters this session set, instead of
  // silently resetting them. A URL that already carries params (e.g. a KPI
  // drill-through passing ?status=...) takes priority over the saved ones.
  const cameInFresh = !['q', 'status', 'productType', 'date_from', 'date_to'].some((k) => searchParams.has(k));
  const restored = cameInFresh ? savedFilters : null;

  // Initialise from URL (or the restored filters); dates are unrestricted unless selected
  const [query,    setQuery]    = useState(() => restored?.q      ?? getParam(searchParams, 'q'));
  const searchQuery = useDeferredValue(query);
  const searchPending = query !== searchQuery;
  const [status,   setStatus]   = useState(() => restored?.status ?? getParam(searchParams, 'status'));
  const [productType, setProductType] = useState(() => restored?.productType ?? getParam(searchParams, 'productType'));
  const [dateFrom, setDateFrom] = useState(() => restored?.dateFrom ?? getParam(searchParams, 'date_from', ''));
  const [dateTo,   setDateTo]   = useState(() => restored?.dateTo   ?? getParam(searchParams, 'date_to',   ''));

  const inputRef = useRef(null);
  const lastSyncedQuery = useRef(query);

  // Write defaults (or restored filters) into URL on first load if they weren't already there
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;
    if (restored?.q && !next.has('q')) { next.set('q', restored.q); changed = true; }
    if (restored?.status && !next.has('status')) { next.set('status', restored.status); changed = true; }
    if (restored?.productType && !next.has('productType')) { next.set('productType', restored.productType); changed = true; }
    if (!next.has('date_from')) { next.set('date_from', dateFrom); changed = true; }
    if (!next.has('date_to'))   { next.set('date_to',   dateTo);   changed = true; }
    if (changed) setSearchParams(next, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the last-used filters in Redux so they survive navigating away and back.
  useEffect(() => {
    dispatch(setPageFilters({ key: PAGE_FILTER_KEY, filters: { q: query, status, productType, dateFrom, dateTo } }));
  }, [dispatch, query, status, productType, dateFrom, dateTo]);

  const sync = useCallback((updates) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([k, v]) => {
        if (v) next.set(k, v); else next.delete(k);
      });
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Typing is urgent; filtering and URL navigation follow the deferred query.
  useEffect(() => {
    if (lastSyncedQuery.current !== searchQuery) {
      lastSyncedQuery.current = searchQuery;
      sync({ q: searchQuery });
    }
  }, [searchQuery, sync]);
  const handleQuery   = (v) => { setQuery(v); };
  const handleStatus  = (v) => { setStatus(v);   sync({ status: v }); };
  const handleProductType = (v) => { setProductType(v); sync({ productType: v }); };
  const handleDateFrom = (v) => { setDateFrom(v); sync({ date_from: v }); };
  const handleDateTo  = (v) => { setDateTo(v);   sync({ date_to: v }); };

  const showAllDates = () => {
    setDateFrom(''); setDateTo('');
    dispatch(setScopeFilter({ key: 'fy', value: 'all' }));
    sync({ date_from: '', date_to: '' });
  };
  const clearAll = () => {
    setQuery(''); setStatus(''); setProductType(''); setDateFrom(''); setDateTo('');
    dispatch(clearScopeFilters()); // vendor / channel / fiscal year are the shared top-bar scope
    sync({ q: '', status: '', productType: '', date_from: '', date_to: '' });
    inputRef.current?.focus();
  };

  // ── Filter logic ──
  const parsed = parseInvoiceQuery(query);

  const dateScoped = useMemo(() => invoices.filter((inv) => {
    if (fy !== 'all' && invoiceFiscalYear(inv) !== fy) return false;
    if (!dateFrom && !dateTo) return true;
    const ymd = invoiceYMD(inv, dateField);
    return !!ymd && (!dateFrom || ymd >= dateFrom) && (!dateTo || ymd <= dateTo);
  }), [invoices, fy, dateField, dateFrom, dateTo]);
  const { rows: searched, counts: searchedCounts } = useMemo(() => searchInvoiceRows(dateScoped, searchQuery), [dateScoped, searchQuery]);
  // Product type narrows after the text search, so the list's search index is reused.
  const { beforeStatus, counts } = useMemo(() => {
    if (!productType) return { beforeStatus: searched, counts: searchedCounts };
    const rows = searched.filter((inv) => invoiceProductType(inv) === productType);
    const byStatus = new Map();
    for (const inv of rows) byStatus.set(inv.status, (byStatus.get(inv.status) || 0) + 1);
    return { beforeStatus: rows, counts: byStatus };
  }, [searched, searchedCounts, productType]);
  const results = useMemo(() => status ? beforeStatus.filter((inv) => inv.status === status) : beforeStatus, [beforeStatus, status]);
  const productOptions = useMemo(() => {
    const byType = new Map();
    for (const inv of searched) {
      if (status && inv.status !== status) continue;
      const type = invoiceProductType(inv);
      if (type !== '-') byType.set(type, (byType.get(type) || 0) + 1);
    }
    if (productType && !byType.has(productType)) byType.set(productType, 0);
    return [{ value: '', label: 'All product types' },
      ...[...byType].sort(([a], [b]) => a.localeCompare(b)).map(([value, count]) => ({ value, label: value, count }))];
  }, [searched, status, productType]);
  const statusOptions = useMemo(() => [
    { value: '', label: 'All Statuses', count: beforeStatus.length },
    ...ALL_STATUSES.map((st) => ({ value: st, label: st, count: counts.get(st) || 0 })),
  ], [beforeStatus.length, counts]);

  // ── Active chips ──
  const vendorLabel  = vendor  ? (invoices.find((i) => i.vcode   === vendor )?.vendor ?? vendor)  : null;
  const channelLabel = channel ? (CHANNELS.find((c) => c.key     === channel)?.label  ?? channel) : null;
  const pickedMonth  = calendarMonthOf(dateFrom, dateTo); // set by a dashboard month click
  // Opened from a dashboard tile / month: the breadcrumb names exactly what is listed.
  useBreadcrumbLabel(fromTracking
    ? `${status || productType ? `${[status, productType].filter(Boolean).join(' · ')} invoices` : 'All invoices'}${pickedMonth ? ` · ${pickedMonth.label}` : ''}`
    : null);

  // Comma hint
  const tokenCount = query.split(',').filter((s) => s.trim()).length;
  const nextHint = parsed.mode === 'any'
    ? (parsed.any ? 'Searches all table fields · commas match invoice, PO, item, UTR in order' : null)
    : tokenCount === 1 ? '+ PO with comma' : tokenCount === 2 ? '+ PO item with comma' : tokenCount === 3 ? '+ UTR with comma' : null;

  return (
    <>
      {/* ── Filter card ─────────────────────────────────────────── */}
      <div className="card search-hero-card" style={{ marginBottom: '1.25rem' }}>

        {/* Search input */}
        <div className="search-hero">
          <Search size={18} className="search-hero-ic" />
          <input
            ref={inputRef}
            className="search-box search-hero-input"
            placeholder={INVOICE_SEARCH_PLACEHOLDER}
            value={query}
            onChange={(e) => handleQuery(e.target.value)}
            autoFocus={!fromTracking}
            aria-label={INVOICE_SEARCH_LABEL}
          />
          {query && (
            <button
              type="button"
              className="search-hero-clear"
              onClick={() => { handleQuery(''); inputRef.current?.focus(); }}
              aria-label="Clear search"
            ><X size={14} /></button>
          )}
        </div>

        {/* ── Active scope chips (search tokens, vendor, channel, financial year) ── */}
        {(parsed.any || parsed.invoice || parsed.po || parsed.item || parsed.utr || vendorLabel || channelLabel || pickedMonth || nextHint) && (
          <div className="search-active-chips">
            {parsed.any && <FilterChip label="Search" value={parsed.any} tone="brand"
              onRemove={() => handleQuery('')} />}
            {parsed.invoice && <FilterChip label="Invoice" value={parsed.invoice} tone="brand"
              onRemove={() => { const parts = query.split(','); parts[0] = ''; handleQuery(parts.join(',').replace(/^,+/, '')); }} />}
            {parsed.po      && <FilterChip label="PO"      value={parsed.po}      tone="brand"
              onRemove={() => { const parts = query.split(','); parts[1] = ''; handleQuery(parts.join(',')); }} />}
            {parsed.item    && <FilterChip label="Item"    value={parsed.item}    tone="brand"
              onRemove={() => { const parts = query.split(','); parts[2] = ''; handleQuery(parts.join(',')); }} />}
            {parsed.utr     && <FilterChip label="UTR"     value={parsed.utr}     tone="brand"
              onRemove={() => { const parts = query.split(','); parts[3] = ''; handleQuery(parts.join(',')); }} />}

            {vendorLabel  && <FilterChip label="Vendor"  value={vendorLabel}  tone="blue"
              onRemove={() => dispatch(setScopeFilter({ key: 'vcode', value: '' }))} />}
            {channelLabel && <FilterChip label="Channel" value={channelLabel} tone="blue"
              onRemove={() => dispatch(setScopeFilter({ key: 'channel', value: '' }))} />}
            {pickedMonth && <FilterChip label="Month" value={`${pickedMonth.label} · ${dateLabel}`} tone="brand"
              onRemove={() => { handleDateFrom(''); handleDateTo(''); }} />}
            {nextHint && !parsed.item && (
              <span style={{ fontSize: '0.71875rem', color: 'var(--text-muted)', fontStyle: 'italic', alignSelf: 'center' }}>
                {nextHint}
              </span>
            )}
          </div>
        )}

        {/* ── Status, product type and date range: one row of compact chips ── */}
        <div className="inv-filter-row">
          <Dropdown variant="chip" label="Status" ariaLabel="Filter by status" value={status} options={statusOptions} onChange={handleStatus} />
          <Dropdown variant="chip" label="Product" ariaLabel="Filter by product type" value={productType} options={productOptions} onChange={handleProductType} />
          <InvoiceDateTypeFilter variant="chip" />
          <div className={`date-range-chip${dateFrom || dateTo ? ' has-value' : ''}`}>
            <Clock size={12} />
            <input type="date" aria-label={`${dateLabel} From`} value={dateFrom} max={dateTo || undefined}
              onChange={(e) => handleDateFrom(e.target.value)} />
            <span aria-hidden="true">–</span>
            <input type="date" aria-label={`${dateLabel} To`} value={dateTo} min={dateFrom || undefined}
              onChange={(e) => handleDateTo(e.target.value)} />
          </div>
          <span className="inv-filter-meta" />
          <button type="button" className="btn btn-sm btn-ghost"
            title="Remove the date limit and the financial year limit" onClick={showAllDates}>All dates</button>
          <button type="button" className="btn btn-sm btn-ghost"
            title="Remove all filters and show every invoice" onClick={clearAll}><RotateCcw size={13} />Clear</button>
        </div>
      </div>

      {/* ── Results table — always shown, never empty-first ── */}
      <div className="card search-results" aria-busy={searchPending}>
        {searchPending && <p role="status" className="cell-muted">Updating results…</p>}
        <InvoiceTable
          invoices={results}
          tableKey="searchInvoice"
          mode="full"
          hideSearch
          busy={searchPending}
          filteredCount={results.length}
          lead={(
            <div className="results-title">
              <span className="srm-table-title">Invoices<span className="srm-count-pill">{results.length.toLocaleString()} invoice{results.length === 1 ? '' : 's'}</span></span>
              <span>{!dateFrom && !dateTo ? 'all dates' : `${fmtDate(dateFrom) || 'earliest'} to ${fmtDate(dateTo) || 'latest'}`}</span>
            </div>
          )}
        />
      </div>
    </>
  );
}
