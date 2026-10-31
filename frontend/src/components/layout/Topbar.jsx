import { useState, useRef, useMemo, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { CHANNEL_LABEL } from '../../data/constants';
import { pageTitle } from '../../utils/pageTitle';
import { getFiscalYear } from '../../utils/businessLogic';
import { invoiceFiscalYear, selectScopedInvoices } from '../../features/invoices/selectors';
import { pushToast, setScopeFilter, toggleSidebar, toggleSidebarCollapsed } from '../../features/ui/uiSlice';
import { useScope } from '../../features/ui/scope';
import { HelpCircle, ChevronDown, Menu, Calendar, Layers, Building } from '../common/icons.jsx';
import UserMenu from './UserMenu.jsx';
import NotificationBell from './NotificationBell.jsx';
import useEnabledChannels from '../../features/settings/useEnabledChannels';

const CRUMB_PARENTS = ['Processing Channels', 'Supplier Visibility', 'Settings'];

/** "Processing Channels / Msetu / SRM" → muted section, then the page name in bold. */
function crumbParts(crumb) {
  const parent = CRUMB_PARENTS.find((name) => crumb.startsWith(`${name} / `));
  if (!parent) return <b>{crumb}</b>;
  return <><span className="crumb-parent">{parent}</span><span className="crumb-sep"> / </span><b>{crumb.slice(parent.length + 3)}</b></>;
}

/* ── Compact vendor dropdown for topbar ─────────────────────────── */
function TopbarVendorDropdown({ scope, onUpdate }) {
  const [open, setOpen]   = useState(false);
  const [typeQ, setTypeQ] = useState('');
  const wrapRef           = useRef(null);
  const currentVcode      = scope.vcode;
  const invoices = useSelector(selectScopedInvoices);

  const vendors = useMemo(() => {
    const seen = new Map();
    invoices.forEach((inv) => {
      if (!seen.has(inv.vcode)) seen.set(inv.vcode, inv.vendor);
    });
    return [...seen.entries()]
      .map(([vcode, vendor]) => ({ vendor, vcode }))
      .sort((a, b) => a.vendor.localeCompare(b.vendor));
  }, [invoices]);

  const query = typeQ.trim().toLowerCase();
  const filtered = query ? vendors.filter((vendor) => vendor.vcode.toLowerCase().includes(query)
    || vendor.vendor.toLowerCase().includes(query)) : vendors;

  function pick(vcode) { onUpdate('vcode', vcode); setOpen(false); setTypeQ(''); }

  // Close on click outside
  useEffect(() => {
    function handler(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapRef} className="scope-dd">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`scope-pill${currentVcode ? ' is-set' : ''}`}
        style={{ maxWidth: '13.125rem' }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Filter by vendor"
      >
        <Building size={14} className="scope-pill-ic" />
        <span className="scope-pill-text">
          {currentVcode || 'Vendor Code'}
        </span>
        {currentVcode
          ? <span onClick={(e) => { e.stopPropagation(); pick(''); }} className="scope-pill-clear" aria-label="Clear vendor filter">×</span>
          : <ChevronDown size={13} className="scope-pill-chev" />
        }
      </button>

      {open && (
        <div className="scope-menu" style={{ width: '17.5rem' }}>
          <div className="scope-menu-search">
            <input autoFocus className="search-box scope-menu-input"
              aria-label="Search vendor name or code" placeholder="Search vendor name or code…"
              value={typeQ} onChange={(event) => setTypeQ(event.target.value)} />
          </div>
          <div className="scope-menu-list" role="listbox">
            <button type="button" role="option" aria-selected={!currentVcode} onClick={() => pick('')} className={`scope-opt${!currentVcode ? ' selected' : ''}`}>
              Vendor Code
            </button>
            {filtered.length === 0 && <p className="scope-empty">No vendors match.</p>}
            {filtered.map((v) => (
              <button key={v.vcode} type="button" role="option" aria-selected={currentVcode === v.vcode} onClick={() => pick(v.vcode)}
                className={`scope-opt scope-opt-vendor${currentVcode === v.vcode ? ' selected' : ''}`}>
                <span className="scope-opt-name">{v.vendor}</span>
                <span className="scope-opt-code">{v.vcode}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SupplierVendorCodeDropdown({ codes, scope, onUpdate }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const selected = codes.length === 1 ? codes[0] : (codes.includes(scope.vcode) ? scope.vcode : '');
  const choices = codes.length > 1 ? [{ value: '', label: 'All vendor codes' }, ...codes.map((code) => ({ value: code, label: code }))] : codes.map((code) => ({ value: code, label: code }));
  const selectedLabel = choices.find((choice) => choice.value === selected)?.label || codes[0];

  useEffect(() => {
    const close = (event) => { if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  function pick(value) {
    onUpdate('vcode', value);
    setOpen(false);
  }

  return (
    <div className="topbar-supplier-code" ref={wrapRef}>
      <button
        type="button"
        className="topbar-supplier-code-trigger"
        data-open={open}
        aria-label="Filter supplier invoices by vendor code"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{selectedLabel}</span><ChevronDown size={14} />
      </button>
      {open && (
        <div className="topbar-supplier-code-menu" role="listbox" aria-label="Vendor codes">
          {choices.map((choice) => (
            <button
              key={choice.value || 'all'}
              type="button"
              role="option"
              aria-selected={selected === choice.value}
              className={selected === choice.value ? 'selected' : ''}
              onClick={() => pick(choice.value)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Compact channel dropdown for topbar (tier-scoped) ─────────── */
function TopbarChannelDropdown({ scope, onUpdate }) {
  const [open, setOpen]   = useState(false);
  const [typeQ, setTypeQ] = useState('');
  const wrapRef           = useRef(null);
  const currentKey        = scope.channel;

  // Only shown for HQ, so all channels are allowed
  const allowedChannels = useEnabledChannels();

  const selectedLabel = currentKey ? allowedChannels.find((c) => c.key === currentKey)?.label ?? currentKey : null;

  const filtered = typeQ.trim()
    ? allowedChannels.filter((c) => c.label.toLowerCase().includes(typeQ.toLowerCase()))
    : allowedChannels;

  function pick(key) { onUpdate('channel', key); setOpen(false); setTypeQ(''); }

  // Close on click outside
  useEffect(() => {
    function handler(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapRef} className="scope-dd">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`scope-pill${currentKey ? ' is-set' : ''}`}
        style={{ maxWidth: '11.25rem' }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Filter by processing channel"
      >
        <Layers size={14} className="scope-pill-ic" />
        <span className="scope-pill-text">
          {selectedLabel ?? 'All Channels'}
        </span>
        {currentKey
          ? <span onClick={(e) => { e.stopPropagation(); pick(''); }} className="scope-pill-clear" aria-label="Clear channel filter">×</span>
          : <ChevronDown size={13} className="scope-pill-chev" />
        }
      </button>

      {open && (
        <div className="scope-menu" style={{ width: '13.75rem' }}>
          {allowedChannels.length > 5 && (
            <div className="scope-menu-search">
              <input autoFocus className="search-box scope-menu-input"
                placeholder="Search channel…" value={typeQ} onChange={(e) => setTypeQ(e.target.value)} />
            </div>
          )}
          <div className="scope-menu-list" role="listbox">
            <button type="button" role="option" aria-selected={!currentKey} onClick={() => pick('')} className={`scope-opt${!currentKey ? ' selected' : ''}`}>
              All Channels
            </button>
            {filtered.map((c) => (
              <button key={c.key} type="button" role="option" aria-selected={currentKey === c.key} onClick={() => pick(c.key)} className={`scope-opt${currentKey === c.key ? ' selected' : ''}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Topbar ────────────────────────────────────────────────────────── */

function TopbarFiscalYearDropdown({ scope, onUpdate, defaultFY }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const currentFY = scope.fy || defaultFY;
  const isAll = currentFY === 'all';
  const invoices = useSelector(selectScopedInvoices);
  // Only fiscal years that actually have records, plus the current one (the default) and
  // whichever is selected right now, so the list never offers a year with nothing in it.
  const fyOptions = useMemo(() => {
    const years = new Set([defaultFY]);
    if (currentFY !== 'all') years.add(currentFY);
    invoices.forEach((inv) => { const fy = invoiceFiscalYear(inv); if (fy) years.add(fy); });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [invoices, defaultFY, currentFY]);
  // "All Years" and the clear (x) only mean something when there is more than one year.
  const multiYear = fyOptions.length > 1;
  function pick(fy) { onUpdate('fy', fy); setOpen(false); }
  useEffect(() => {
    function handler(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  return (
    <div ref={wrapRef} className="scope-dd">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`scope-pill${!isAll ? ' is-set' : ''}`}
        style={{ maxWidth: '10rem' }}
        aria-haspopup="listbox" aria-expanded={open} title="Filter by Fiscal Year"
      >
        <Calendar size={14} className="scope-pill-ic" />
        <span className="scope-pill-text">{isAll ? 'All Years' : `FY ${currentFY}`}</span>
        {!isAll && multiYear
          ? <span onClick={(e) => { e.stopPropagation(); pick('all'); }} className="scope-pill-clear" aria-label="Clear filter">×</span>
          : <ChevronDown size={13} className="scope-pill-chev" />
        }
      </button>
      {open && (
        <div className="scope-menu" style={{ width: '9.5rem' }}>
          <div className="scope-menu-list" role="listbox">
            {multiYear && <button type="button" role="option" aria-selected={isAll} onClick={() => pick('all')} className={`scope-opt${isAll ? ' selected' : ''}`}>All Years</button>}
            {fyOptions.map((fy) => (
              <button key={fy} type="button" role="option" aria-selected={currentFY === fy} onClick={() => pick(fy)} className={`scope-opt${currentFY === fy ? ' selected' : ''}`}>FY {fy}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Topbar() {
  const dispatch = useDispatch();
  const location = useLocation();
  const { authType, channelScope, supplierVendorCodes } = useSelector((s) => s.auth);
  const sidebarCollapsed = useSelector((s) => s.ui.sidebarCollapsed);

  const crumb = pageTitle(location.pathname, authType === 'internal' && channelScope !== 'all' ? (CHANNEL_LABEL[channelScope] || channelScope) : '');
  const isHQ = channelScope === 'all';
  const isChannelLocked = !isHQ;
  const channelLabel = CHANNEL_LABEL[channelScope] || channelScope;

  /** The fiscal year / channel / vendor chosen here apply to every screen until cleared. */
  const scope = useScope();
  function updateScope(key, value) { dispatch(setScopeFilter({ key, value })); }

  return (
    <header className="topbar">
      {/* Desktop: collapse / expand the sidebar. (The button below is the phone-width menu.) */}
      <button
        type="button" className="icon-btn sidebar-toggle"
        aria-label={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'} title={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
        aria-expanded={!sidebarCollapsed} onClick={() => dispatch(toggleSidebarCollapsed())}
      >
        <Menu size={18} />
      </button>
      <button type="button" className="icon-btn menu-btn" aria-label="Open menu"
        onClick={() => dispatch(toggleSidebar())}>
        <Menu size={18} />
      </button>
      {/* The one visible page title (and the page's <h1>); pages don't repeat it. */}
      <div className="crumb"><h1 className="crumb-title" aria-label={crumb || undefined}>{crumbParts(crumb)}</h1></div>

      <div className="topbar-right">
        {authType === 'supplier' && (
          <TopbarFiscalYearDropdown scope={scope} onUpdate={updateScope} defaultFY={getFiscalYear(new Date().toISOString())} />
        )}
        {authType === 'supplier' && supplierVendorCodes.length > 0 && (
          <SupplierVendorCodeDropdown codes={supplierVendorCodes} scope={scope} onUpdate={updateScope} />
        )}
        {/* Internal users: financial year, channel and vendor, grouped as one scope bar on every page; FY defaults to the current one */}
        {authType === 'internal' && (
          <div className="scope-group">
          <TopbarFiscalYearDropdown scope={scope} onUpdate={updateScope} defaultFY={getFiscalYear(new Date().toISOString())} />
          <div className="topbar-context-filters">
            {isChannelLocked ? (
              <div className="scope-pill is-locked" title="Your scope is locked to this channel">
                <Layers size={14} className="scope-pill-ic" />{channelLabel}
              </div>
            ) : (
              <TopbarChannelDropdown scope={scope} onUpdate={updateScope} />
            )}
            <TopbarVendorDropdown scope={scope} onUpdate={updateScope} />
          </div>
          </div>
        )}

        <NotificationBell />
        <button type="button" className="icon-btn help-button" aria-label="Help"
          onClick={() => dispatch(pushToast('Help & documentation coming soon.'))}>
          <HelpCircle size={18} />
        </button>

        <UserMenu />
      </div>
    </header>
  );
}
