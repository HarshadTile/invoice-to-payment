import { useState, useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectScopedInvoices } from '../features/invoices/selectors';
import { CHANNELS, STATUS_CHIP, APP_NOW } from '../data/constants';
import { getFiscalYear } from '../utils/businessLogic';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import Dropdown from '../components/common/Dropdown.jsx';
import { Search, X } from '../components/common/icons.jsx';

const ALL_STATUSES = Object.keys(STATUS_CHIP);

/* ── Helpers ───────────────────────────────────────────────────────── */
function toYMD(date) { return date.toISOString().split('T')[0]; }

function defaultDateFrom() {
  const d = new Date(APP_NOW);
  d.setDate(d.getDate() - 90);
  return toYMD(d);
}
function defaultDateTo() { return toYMD(new Date(APP_NOW)); }

function parseInvDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split(' ');
  if (parts.length !== 3) return dateStr;
  const [d, mStr, y] = parts;
  const monthMap = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
  };
  const m = monthMap[mStr.slice(0, 3)] || '01'; // "Sept" as well as "Sep"
  return `${y}-${m}-${d.padStart(2, '0')}`;
}

/** Financial year (Apr–Mar) of an invoice, e.g. "2026-27". */
function invoiceFY(inv) {
  const ymd = inv.rawDate || parseInvDate(inv.date);
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  if (!y || !m) return '';
  const start = m < 4 ? y - 1 : y;
  return `${start}-${String(start + 1).slice(2)}`;
}

function fmtDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  return `${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]} ${y}`;
}

/* ── Smart query parser: invoice, PO, item (NO vendor) ─────────────── */
function parseQuery(raw) {
  const parts = raw.split(',').map((s) => s.trim());
  return { invoice: parts[0] || '', po: parts[1] || '', item: parts[2] || '' };
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
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px 3px 10px', borderRadius: 20,
      background: styles.bg, border: `1px solid ${styles.border}`,
      fontSize: 12, fontWeight: 600, color: styles.color,
    }}>
      <span style={{ opacity: .65, fontWeight: 400, fontSize: 11 }}>{label}:</span>
      {value}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: styles.btnColor, fontSize: 15, lineHeight: 1,
          padding: '0 1px', marginLeft: 1, opacity: .8,
        }}
      >×</button>
    </span>
  );
}

/* ── Page ────────────────────────────────────────────────────────────── */
export default function SearchInvoicePage() {
  const invoices = useSelector(selectScopedInvoices);
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialise from URL; default date range = last 90 days
  const [query,    setQuery]    = useState(() => getParam(searchParams, 'q'));
  const [vendor,   setVendor]   = useState(() => getParam(searchParams, 'vcode'));
  const [channel,  setChannel]  = useState(() => getParam(searchParams, 'channel'));
  const [status,   setStatus]   = useState(() => getParam(searchParams, 'status'));
  // Same default as the top bar's dropdown: the current financial year until the user picks one, or 'all'
  const fy = getParam(searchParams, 'fy', getFiscalYear(new Date().toISOString()));
  const [dateFrom, setDateFrom] = useState(() => getParam(searchParams, 'date_from', defaultDateFrom()));
  const [dateTo,   setDateTo]   = useState(() => getParam(searchParams, 'date_to',   defaultDateTo()));

  const inputRef = useRef(null);

  // Write defaults into URL on first load if they weren't already there
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;
    if (!next.has('date_from')) { next.set('date_from', dateFrom); changed = true; }
    if (!next.has('date_to'))   { next.set('date_to',   dateTo);   changed = true; }
    if (changed) setSearchParams(next, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync topbar vendor/channel URL changes → local state
  useEffect(() => {
    const v = searchParams.get('vcode')   || '';
    const c = searchParams.get('channel') || '';
    setVendor(v);
    setChannel(c);
  }, [searchParams]);

  const sync = useCallback((updates) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([k, v]) => {
        if (v) next.set(k, v); else next.delete(k);
      });
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleQuery   = (v) => { setQuery(v);    sync({ q: v }); };
  const handleStatus  = (v) => { setStatus(v);   sync({ status: v }); };
  const handleDateFrom = (v) => { setDateFrom(v); sync({ date_from: v }); };
  const handleDateTo  = (v) => { setDateTo(v);   sync({ date_to: v }); };

  // Same three actions as the My Invoices page
  const showLast90Days = () => {
    const df = defaultDateFrom(), dt = defaultDateTo();
    setDateFrom(df); setDateTo(dt);
    sync({ date_from: df, date_to: dt, fy: '' });
  };
  const showAllDates = () => {
    setDateFrom(''); setDateTo('');
    sync({ date_from: '', date_to: '', fy: 'all' });
  };
  const clearAll = () => {
    setQuery(''); setStatus(''); setDateFrom(''); setDateTo('');
    setVendor(''); setChannel(''); // vendor/channel also live in the top bar -> URL
    sync({ q: '', status: '', date_from: '', date_to: '', vcode: '', channel: '', fy: 'all' });
    inputRef.current?.focus();
  };

  // ── Filter logic ──
  const parsed = parseQuery(query);

  const matches = (inv, skipStatus) => {
    if (parsed.invoice && !inv.no.toLowerCase().includes(parsed.invoice.toLowerCase())) return false;
    if (parsed.po      && !inv.po.toLowerCase().includes(parsed.po.toLowerCase()))      return false;
    if (parsed.item    && String(inv.poItem) !== parsed.item)                           return false;
    if (vendor  && inv.vcode   !== vendor)  return false;
    if (channel && inv.channel !== channel) return false;
    if (!skipStatus && status && inv.status !== status) return false;
    if (fy !== 'all' && invoiceFY(inv) !== fy) return false;
    const invYMD = inv.rawDate || parseInvDate(inv.date);
    if (dateFrom && invYMD < dateFrom) return false;
    if (dateTo   && invYMD > dateTo)   return false;
    return true;
  };
  const results = invoices.filter((inv) => matches(inv, false));
  const beforeStatus = invoices.filter((inv) => matches(inv, true));
  const statusOptions = [
    { value: '', label: 'All Statuses', count: beforeStatus.length },
    ...ALL_STATUSES.map((st) => ({ value: st, label: st, count: beforeStatus.filter((i) => i.status === st).length })),
  ];

  // ── Active chips ──
  const vendorLabel  = vendor  ? (invoices.find((i) => i.vcode   === vendor )?.vendor ?? vendor)  : null;
  const channelLabel = channel ? (CHANNELS.find((c) => c.key     === channel)?.label  ?? channel) : null;

  const isDefaultDate = dateFrom === defaultDateFrom() && dateTo === defaultDateTo();

  // Picking a financial year replaces the default "last 90 days" window; otherwise the two would
  // contradict each other (e.g. FY 2025-26 + a window that only covers 2026).
  useEffect(() => {
    if (fy !== 'all' && dateFrom === defaultDateFrom() && dateTo === defaultDateTo()) {
      setDateFrom(''); setDateTo('');
      sync({ date_from: '', date_to: '' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy]);

  // Comma hint
  const tokenCount = query.split(',').filter((s) => s.trim()).length;
  const nextHint   = tokenCount === 1 ? '+ PO with comma' : tokenCount === 2 ? '+ PO item with comma' : null;

  return (
    <>
      {/* ── Filter card ─────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>

        {/* Search input */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search
            size={16}
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
          />
          <input
            ref={inputRef}
            className="search-box"
            style={{ width: '100%', height: 44, paddingLeft: 40, paddingRight: query ? 36 : 14, fontSize: 14 }}
            placeholder="Invoice no, PO no, PO item...  (comma-separated)"
            value={query}
            onChange={(e) => handleQuery(e.target.value)}
            autoFocus
            aria-label="Search - comma-separated: invoice, PO, item"
          />
          {query && (
            <button
              type="button"
              onClick={() => { handleQuery(''); inputRef.current?.focus(); }}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}
              aria-label="Clear search"
            >&times;</button>
          )}
        </div>

        {/* ── Active scope chips (search tokens, vendor, channel, financial year) ── */}
        {(parsed.invoice || parsed.po || parsed.item || vendorLabel || channelLabel || fy !== 'all' || nextHint) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            {parsed.invoice && <FilterChip label="Invoice" value={parsed.invoice} tone="brand"
              onRemove={() => { const parts = query.split(','); parts[0] = ''; handleQuery(parts.join(',').replace(/^,+/, '')); }} />}
            {parsed.po      && <FilterChip label="PO"      value={parsed.po}      tone="brand"
              onRemove={() => { const parts = query.split(','); parts[1] = ''; handleQuery(parts.join(',')); }} />}
            {parsed.item    && <FilterChip label="Item"    value={parsed.item}    tone="brand"
              onRemove={() => { const parts = query.split(','); parts[2] = ''; handleQuery(parts.join(',')); }} />}

            {vendorLabel  && <FilterChip label="Vendor"  value={vendorLabel}  tone="blue"
              onRemove={() => { setVendor('');  sync({ vcode: '' }); }} />}
            {channelLabel && <FilterChip label="Channel" value={channelLabel} tone="blue"
              onRemove={() => { setChannel(''); sync({ channel: '' }); }} />}
            {fy !== 'all' && <FilterChip label="Financial Year" value={fy} tone="blue"
              onRemove={() => sync({ fy: '' })} />}

            {nextHint && !parsed.item && (
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic', alignSelf: 'center' }}>
                {nextHint}
              </span>
            )}
          </div>
        )}

        {/* ── Status + date range (same layout as My Invoices) ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 190px', minWidth: 0 }}>
            <Dropdown label="Status" ariaLabel="Filter by status" value={status} options={statusOptions} onChange={handleStatus} />
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 160px' }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Date From</span>
            <input type="date" className="search-box" style={{ width: '100%' }} value={dateFrom} max={dateTo || undefined}
              onChange={(e) => handleDateFrom(e.target.value)} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 160px' }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Date To</span>
            <input type="date" className="search-box" style={{ width: '100%' }} value={dateTo} min={dateFrom || undefined}
              onChange={(e) => handleDateTo(e.target.value)} />
          </label>

          <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
            <button type="button" className="btn" style={{ height: 38, whiteSpace: 'nowrap' }}
              title="Back to the default view: last 90 days, all financial years" onClick={showLast90Days}>&#8634; Last 90 days</button>
            <button type="button" className="btn" style={{ height: 38, whiteSpace: 'nowrap' }}
              title="Remove the date limit and the financial year limit" onClick={showAllDates}>All dates</button>
            <button type="button" className="btn" style={{ height: 38, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title="Remove all filters and show every invoice" onClick={clearAll}><X size={14} />Clear</button>
          </div>
        </div>
      </div>

      {/* ── Results table — always shown, never empty-first ── */}
      <div className="card">
        <h3>
          {results.length.toLocaleString()} invoice{results.length === 1 ? '' : 's'}
          <span className="card-hint">
            {!dateFrom && !dateTo ? 'all dates' : (isDefaultDate ? 'last 90 days' : `${fmtDate(dateFrom) || 'earliest'} to ${fmtDate(dateTo) || 'latest'}`)}
          </span>
        </h3>
        <InvoiceTable
          invoices={results}
          tableKey="searchInvoice"
          mode="full"
          hideSearch
          filteredCount={results.length}
        />
      </div>
    </>
  );
}
