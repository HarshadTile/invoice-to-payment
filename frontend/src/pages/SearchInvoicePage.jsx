import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectScopedInvoices } from '../features/invoices/selectors';
import { CHANNELS, INTERNAL_TEAM_CHANNELS, STATUS_CHIP, APP_NOW } from '../data/constants';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import { Search } from '../components/common/icons.jsx';

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
  const m = monthMap[mStr] || '01';
  return `${y}-${m}-${d.padStart(2, '0')}`;
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
  const [dateFrom, setDateFrom] = useState(() => getParam(searchParams, 'date_from', defaultDateFrom()));
  const [dateTo,   setDateTo]   = useState(() => getParam(searchParams, 'date_to',   defaultDateTo()));
  const [filtersOpen, setFiltersOpen] = useState(!!(
    getParam(searchParams, 'status') || getParam(searchParams, 'date_from') || getParam(searchParams, 'date_to')
  ));

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

  const clearDateRange = () => {
    setDateFrom(''); setDateTo('');
    sync({ date_from: '', date_to: '' });
  };
  const resetToDefault = () => {
    const df = defaultDateFrom(), dt = defaultDateTo();
    setDateFrom(df); setDateTo(dt);
    sync({ date_from: df, date_to: dt });
  };

  const clearAll = () => {
    const df = defaultDateFrom(), dt = defaultDateTo();
    setQuery(''); setStatus(''); setDateFrom(df); setDateTo(dt);
    // vendor/channel cleared via topbar → URL
    sync({ q: '', status: '', date_from: df, date_to: dt, vcode: '', channel: '' });
    setVendor(''); setChannel('');
    inputRef.current?.focus();
  };

  // ── Filter logic ──
  const parsed = parseQuery(query);

  const results = invoices.filter((inv) => {
    if (parsed.invoice && !inv.no.toLowerCase().includes(parsed.invoice.toLowerCase())) return false;
    if (parsed.po      && !inv.po.toLowerCase().includes(parsed.po.toLowerCase()))      return false;
    if (parsed.item    && String(inv.poItem) !== parsed.item)                           return false;
    if (vendor  && inv.vcode   !== vendor)  return false;
    if (channel && inv.channel !== channel) return false;
    if (status  && inv.status  !== status)  return false;
    const invYMD = parseInvDate(inv.date);
    if (dateFrom && invYMD < dateFrom) return false;
    if (dateTo   && invYMD > dateTo)   return false;
    return true;
  });

  // ── Active chips ──
  const vendorLabel  = vendor  ? (invoices.find((i) => i.vcode   === vendor )?.vendor ?? vendor)  : null;
  const channelLabel = channel ? (CHANNELS.find((c) => c.key     === channel)?.label  ?? channel) : null;

  const isDefaultDate = dateFrom === defaultDateFrom() && dateTo === defaultDateTo();
  const hasActiveFilters = !!(query.trim() || vendor || channel || status || dateFrom || dateTo);

  // Comma hint
  const tokenCount = query.split(',').filter((s) => s.trim()).length;
  const nextHint   = tokenCount === 1 ? '+ PO with comma' : tokenCount === 2 ? '+ PO item with comma' : null;

  return (
    <>
      <h1 className="page-title">Find an invoice, fast</h1>
      <p className="page-sub">
        Results default to the last 90 days. Type to narrow — invoice, PO, item separated by commas.
        Use the <strong>Vendor</strong> and <strong>Channel</strong> dropdowns in the top bar to scope further.
      </p>

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
            placeholder="Invoice no, PO no, PO item…  (comma-separated)"
            value={query}
            onChange={(e) => handleQuery(e.target.value)}
            autoFocus
            aria-label="Search — comma-separated: invoice, PO, item"
          />
          {query && (
            <button
              type="button"
              onClick={() => { handleQuery(''); inputRef.current?.focus(); }}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}
              aria-label="Clear search"
            >×</button>
          )}
        </div>

        {/* ── Active filter chips (all in one row, one consistent style) ── */}
        {hasActiveFilters && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>

            {/* Search token chips */}
            {parsed.invoice && <FilterChip label="Invoice" value={parsed.invoice} tone="brand"
              onRemove={() => { const parts = query.split(','); parts[0] = ''; handleQuery(parts.join(',').replace(/^,+/, '')); }} />}
            {parsed.po      && <FilterChip label="PO"      value={parsed.po}      tone="brand"
              onRemove={() => { const parts = query.split(','); parts[1] = ''; handleQuery(parts.join(',')); }} />}
            {parsed.item    && <FilterChip label="Item"    value={parsed.item}    tone="brand"
              onRemove={() => { const parts = query.split(','); parts[2] = ''; handleQuery(parts.join(',')); }} />}

            {/* Scope chips (blue) */}
            {vendorLabel  && <FilterChip label="Vendor"  value={vendorLabel}  tone="blue"
              onRemove={() => { setVendor('');  sync({ vcode: '' }); }} />}
            {channelLabel && <FilterChip label="Channel" value={channelLabel} tone="blue"
              onRemove={() => { setChannel(''); sync({ channel: '' }); }} />}

            {/* Status chip */}
            {status && <FilterChip label="Status" value={status} tone="amber"
              onRemove={() => handleStatus('')} />}

            {/* Date range chip */}
            {(dateFrom || dateTo) && (
              <FilterChip
                label="Date"
                value={`${fmtDate(dateFrom) || '…'} → ${fmtDate(dateTo) || '…'}`}
                tone={isDefaultDate ? 'blue' : 'brand'}
                onRemove={clearDateRange}
              />
            )}

            {/* Comma hint */}
            {nextHint && !parsed.item && (
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic', alignSelf: 'center' }}>
                {nextHint}
              </span>
            )}

            {/* Clear all — only when non-default filters exist */}
            {(query || vendor || channel || status || !isDefaultDate) && (
              <button
                type="button"
                className="btn danger"
                style={{ minHeight: 26, padding: '2px 10px', fontSize: 11.5, marginLeft: 4 }}
                onClick={clearAll}
              >✕ Reset all</button>
            )}
          </div>
        )}

        {/* ── Collapsible: Status + Date range ── */}
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', padding: '4px 0',
            fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer',
          }}
          aria-expanded={filtersOpen}
        >
          <span style={{ fontSize: 10, display: 'inline-block', transition: 'transform .18s', transform: filtersOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
          Status &amp; date range
          {(status || !isDefaultDate) && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 18, height: 18, borderRadius: '50%',
              background: 'var(--brand)', color: '#fff', fontSize: 10, fontWeight: 700,
            }}>{[status, !isDefaultDate].filter(Boolean).length}</span>
          )}
        </button>

        {filtersOpen && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
            {/* Status */}
            <select className="search-box" style={{ width: '100%' }} aria-label="Filter by status"
              value={status} onChange={(e) => handleStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            {/* Date From */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Date From</span>
              <input type="date" className="search-box" style={{ width: '100%' }} aria-label="Date from"
                value={dateFrom} onChange={(e) => handleDateFrom(e.target.value)} />
            </div>

            {/* Date To */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Date To</span>
              <input type="date" className="search-box" style={{ width: '100%' }} aria-label="Date to"
                value={dateTo} onChange={(e) => handleDateTo(e.target.value)} />
            </div>

            {/* Date actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" style={{ fontSize: 12, minHeight: 34, width: '100%' }}
                onClick={resetToDefault}>↺ Last 90 days</button>
              <button type="button" className="btn" style={{ fontSize: 12, minHeight: 34, width: '100%' }}
                onClick={clearDateRange}>Show all time</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Results table — always shown, never empty-first ── */}
      <div className="card">
        <h3>
          {results.length.toLocaleString()} invoice{results.length === 1 ? '' : 's'}
          {(dateFrom || dateTo) && !query && !vendor && !channel && !status && (
            <span className="card-hint">
              {isDefaultDate ? 'last 90 days' : `${fmtDate(dateFrom) || 'all'} → ${fmtDate(dateTo) || 'present'}`}
            </span>
          )}
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
