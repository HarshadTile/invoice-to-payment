import { useState, useRef, useMemo, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CHANNELS, CHANNEL_LABEL } from '../../data/constants';
import { runtime, suppliersFromRuntime } from '../../data/runtime';
import { vendorCodesFor, getFiscalYear } from '../../utils/businessLogic';
import { selectScopedInvoices } from '../../features/invoices/selectors';
import { switchIdentity } from '../../features/auth/authSlice';
import { pushToast, resetFiltersOnIdentitySwitch, toggleSidebar } from '../../features/ui/uiSlice';
import { Bell, HelpCircle, ChevronDown, Menu } from '../common/icons.jsx';
import UserMenu from './UserMenu.jsx';

const SETTINGS_LABEL = {
  integrations: 'Integration Settings', notifications: 'Notifications', auditLogs: 'Audit Logs',
  users: 'Users', roles: 'Roles & Permissions',
};

function crumbFor(pathname, params) {
  if (pathname.startsWith('/app/invoices')) return 'Invoice Tracking';
  if (pathname.startsWith('/app/search')) return 'Search Invoice(s)';
  if (pathname.startsWith('/app/channel/')) { const c = CHANNELS.find((x) => x.key === params.key); return `Processing Channels / ${c ? c.label : ''}`; }
  if (pathname.startsWith('/app/vendor-code/') || pathname.startsWith('/supplier/vendor-code/')) return `Supplier Visibility / ${params.code || ''}`;
  if (pathname.startsWith('/app/supplier-visibility')) return 'Supplier Visibility';
  if (pathname.startsWith('/app/logs')) return 'Logs / History';
  if (pathname.startsWith('/app/inquiry-desk')) return 'Inquiry Desk';
  if (pathname.startsWith('/supplier/home')) return 'My Invoices';
  if (pathname.startsWith('/supplier/tickets')) return 'My Queries';
  if (pathname.startsWith('/supplier/logs')) return 'Logs';
  if (pathname.startsWith('/app/outputs')) return 'Vendor Status Reports';
  if (pathname.startsWith('/app/sync-log')) return 'Sync Log';
  if (pathname.startsWith('/app/settings/')) return `Settings / ${SETTINGS_LABEL[pathname.split('/').pop()] || ''}`;
  if (pathname.startsWith('/app/profile') || pathname.startsWith('/supplier/profile')) return 'Profile';
  return '';
}

/* ── Compact vendor dropdown for topbar ─────────────────────────── */
function TopbarVendorDropdown({ searchParams, onUpdate }) {
  const [open, setOpen]   = useState(false);
  const [typeQ, setTypeQ] = useState('');
  const wrapRef           = useRef(null);
  const currentVcode      = searchParams.get('vcode') || '';

  const vendors = useMemo(() => {
    const seen = new Map();
    runtime.invoices.forEach((inv) => {
      if (!seen.has(inv.vendor)) seen.set(inv.vendor, inv.vcode);
    });
    return [...seen.entries()]
      .map(([vendor, vcode]) => ({ vendor, vcode }))
      .sort((a, b) => a.vendor.localeCompare(b.vendor));
  }, []);

  const filtered = typeQ.trim()
    ? vendors.filter((v) =>
        v.vendor.toLowerCase().includes(typeQ.toLowerCase()) ||
        v.vcode.toLowerCase().includes(typeQ.toLowerCase()),
      )
    : vendors;

  const selectedLabel = currentVcode
    ? vendors.find((v) => v.vcode === currentVcode)?.vendor ?? currentVcode
    : null;

  function pick(vcode) { onUpdate('vcode', vcode); setOpen(false); setTypeQ(''); }

  // Close on click outside
  useEffect(() => {
    function handler(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 38, maxWidth: 210, padding: '0 10px 0 12px',
          background: currentVcode ? '#EFF6FF' : '#F0F1F4',
          border: `1px solid ${currentVcode ? '#3B82F6' : 'var(--border)'}`,
          borderRadius: 9, fontSize: 12.5, fontWeight: 500,
          color: currentVcode ? '#1D4ED8' : 'var(--text-body)',
          cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden',
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Filter by vendor"
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
          {selectedLabel ?? 'All Vendors'}
        </span>
        {currentVcode
          ? <span onClick={(e) => { e.stopPropagation(); pick(''); }} style={{ opacity: .7, fontSize: 15, lineHeight: 1, flexShrink: 0 }} aria-label="Clear vendor filter">×</span>
          : <ChevronDown size={13} style={{ flexShrink: 0, opacity: .6 }} />
        }
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 60,
          width: 280, background: '#fff',
          border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 12px 34px rgba(23,24,26,.13)', overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-soft)' }}>
            <input autoFocus className="search-box" style={{ width: '100%', height: 34, fontSize: 12.5 }}
              placeholder="Search vendor name or code…" value={typeQ} onChange={(e) => setTypeQ(e.target.value)} />
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }} role="listbox">
            <button type="button" role="option" aria-selected={!currentVcode} onClick={() => pick('')}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none',
                background: !currentVcode ? 'var(--brand-tint)' : 'none', color: !currentVcode ? 'var(--brand-dark)' : 'var(--text-body)',
                fontWeight: !currentVcode ? 700 : 500, fontSize: 13, cursor: 'pointer' }}>
              All Vendors
            </button>
            {filtered.length === 0 && <p style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>No vendors match "{typeQ}"</p>}
            {filtered.map((v) => (
              <button key={v.vcode} type="button" role="option" aria-selected={currentVcode === v.vcode} onClick={() => pick(v.vcode)}
                style={{ display: 'flex', flexDirection: 'column', width: '100%', textAlign: 'left', padding: '8px 14px', border: 'none',
                  background: currentVcode === v.vcode ? 'var(--brand-tint)' : 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { if (currentVcode !== v.vcode) e.currentTarget.style.background = 'var(--gray-bg)'; }}
                onMouseLeave={(e) => { if (currentVcode !== v.vcode) e.currentTarget.style.background = 'none'; }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: currentVcode === v.vcode ? 'var(--brand-dark)' : 'var(--text-body)' }}>{v.vendor}</span>
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', marginTop: 1 }}>{v.vcode}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Compact channel dropdown for topbar (tier-scoped) ─────────── */
function TopbarChannelDropdown({ searchParams, onUpdate, channelScope }) {
  const [open, setOpen]   = useState(false);
  const [typeQ, setTypeQ] = useState('');
  const wrapRef           = useRef(null);
  const currentKey        = searchParams.get('channel') || '';

  // Only shown for HQ, so all channels are allowed
  const allowedChannels = CHANNELS;

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
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 38, maxWidth: 180, padding: '0 10px 0 12px',
          background: currentKey ? '#EFF6FF' : '#F0F1F4',
          border: `1px solid ${currentKey ? '#3B82F6' : 'var(--border)'}`,
          borderRadius: 9, fontSize: 12.5, fontWeight: 500,
          color: currentKey ? '#1D4ED8' : 'var(--text-body)',
          cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden',
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Filter by processing channel"
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
          {selectedLabel ?? 'All Channels'}
        </span>
        {currentKey
          ? <span onClick={(e) => { e.stopPropagation(); pick(''); }} style={{ opacity: .7, fontSize: 15, lineHeight: 1, flexShrink: 0 }} aria-label="Clear channel filter">×</span>
          : <ChevronDown size={13} style={{ flexShrink: 0, opacity: .6 }} />
        }
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 60,
          width: 220, background: '#fff',
          border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 12px 34px rgba(23,24,26,.13)', overflow: 'hidden',
        }}>
          {allowedChannels.length > 5 && (
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-soft)' }}>
              <input autoFocus className="search-box" style={{ width: '100%', height: 34, fontSize: 12.5 }}
                placeholder="Search channel…" value={typeQ} onChange={(e) => setTypeQ(e.target.value)} />
            </div>
          )}
          <div style={{ maxHeight: 260, overflowY: 'auto' }} role="listbox">
            <button type="button" role="option" aria-selected={!currentKey} onClick={() => pick('')}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none',
                background: !currentKey ? 'var(--brand-tint)' : 'none', color: !currentKey ? 'var(--brand-dark)' : 'var(--text-body)',
                fontWeight: !currentKey ? 700 : 500, fontSize: 13, cursor: 'pointer' }}>
              All Channels
            </button>
            {filtered.map((c) => (
              <button key={c.key} type="button" role="option" aria-selected={currentKey === c.key} onClick={() => pick(c.key)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', fontSize: 13,
                  background: currentKey === c.key ? 'var(--brand-tint)' : 'none',
                  color: currentKey === c.key ? 'var(--brand-dark)' : 'var(--text-body)',
                  fontWeight: currentKey === c.key ? 700 : 500, cursor: 'pointer' }}
                onMouseEnter={(e) => { if (currentKey !== c.key) e.currentTarget.style.background = 'var(--gray-bg)'; }}
                onMouseLeave={(e) => { if (currentKey !== c.key) e.currentTarget.style.background = 'none'; }}>
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

function TopbarFiscalYearDropdown({ searchParams, onUpdate }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const currentFY = searchParams.get('fy') || getFiscalYear(new Date().toISOString());
  const isAll = currentFY === 'all';
  const invoices = useSelector(selectScopedInvoices);
  const fyOptions = useMemo(() => {
    const today = new Date();
    const currentY = today.getFullYear();
    const isPastMarch = today.getMonth() >= 3;
    const currentStartYear = isPastMarch ? currentY : currentY - 1;
    
    const years = new Set();
    // Always include current and last 3 years
    for (let i = 0; i < 4; i++) {
      const y = currentStartYear - i;
      years.add(`${y}-${String(y + 1).slice(2)}`);
    }
    
    // Also include any years found in actual records
    invoices.forEach((inv) => inv.date && years.add(getFiscalYear(inv.date)));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [invoices]);
  function pick(fy) { onUpdate('fy', fy); setOpen(false); }
  useEffect(() => {
    function handler(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 38, maxWidth: 160, padding: '0 10px 0 12px',
          background: !isAll ? '#EFF6FF' : '#F0F1F4',
          border: `1px solid ${!isAll ? '#3B82F6' : 'var(--border)'}`,
          borderRadius: 9, fontSize: 12.5, fontWeight: 500,
          color: !isAll ? '#1D4ED8' : 'var(--text-body)',
          cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden',
        }}
        aria-haspopup="listbox" aria-expanded={open} title="Filter by Fiscal Year"
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{isAll ? 'All Years' : `FY ${currentFY}`}</span>
        {!isAll
          ? <span onClick={(e) => { e.stopPropagation(); pick('all'); }} style={{ opacity: .7, fontSize: 15, lineHeight: 1, flexShrink: 0 }} aria-label="Clear filter">×</span>
          : <ChevronDown size={13} style={{ flexShrink: 0, opacity: .6 }} />
        }
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 60, width: 140, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 12px 34px rgba(23,24,26,.13)', overflow: 'hidden' }}>
          <div style={{ maxHeight: 260, overflowY: 'auto' }} role="listbox">
            <button type="button" role="option" aria-selected={isAll} onClick={() => pick('all')} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: isAll ? 'var(--brand-tint)' : 'none', color: isAll ? 'var(--brand-dark)' : 'var(--text-body)', fontWeight: isAll ? 700 : 500, fontSize: 13, cursor: 'pointer' }}>All Years</button>
            {fyOptions.map((fy) => (
              <button key={fy} type="button" role="option" aria-selected={currentFY === fy} onClick={() => pick(fy)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', fontSize: 13, background: currentFY === fy ? 'var(--brand-tint)' : 'none', color: currentFY === fy ? 'var(--brand-dark)' : 'var(--text-body)', fontWeight: currentFY === fy ? 700 : 500, cursor: 'pointer' }} onMouseEnter={(e) => { if (currentFY !== fy) e.currentTarget.style.background = 'var(--gray-bg)'; }} onMouseLeave={(e) => { if (currentFY !== fy) e.currentTarget.style.background = 'none'; }}>{fy}</button>
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
  const params   = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { authType, channelScope } = useSelector((s) => s.auth);

  const crumb = crumbFor(location.pathname, params);
  const isHQ = channelScope === 'all';
  const isChannelLocked = !isHQ;
  const channelLabel = CHANNEL_LABEL[channelScope] || channelScope;

  /** Update a URL param in place (keeps user on current page, e.g. Dashboard or Search) */
  function updateSearchParam(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  return (
    <header className="topbar">
      <button type="button" className="icon-btn menu-btn" aria-label="Open menu"
        onClick={() => dispatch(toggleSidebar())}>
        <Menu size={18} />
      </button>
      <div className="crumb"><b>{crumb}</b></div>

      <div className="topbar-right">
        {authType === 'supplier' && (
          <TopbarFiscalYearDropdown searchParams={searchParams} onUpdate={updateSearchParam} />
        )}
        {/* Channel + Vendor search dropdowns — shown for all internal users on all pages */}
        {authType === 'internal' && (
          <>
            {isChannelLocked ? (
              <div
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 38, padding: '0 12px',
                  background: '#F0F1F4',
                  border: '1px solid var(--border)',
                  borderRadius: 9, fontSize: 12.5, fontWeight: 600,
                  color: 'var(--text-body)', whiteSpace: 'nowrap',
                }}
                title="Your scope is locked to this channel"
              >
                {channelLabel}
              </div>
            ) : (
              <TopbarChannelDropdown searchParams={searchParams} onUpdate={updateSearchParam} channelScope={channelScope} />
            )}
            <TopbarVendorDropdown searchParams={searchParams} onUpdate={updateSearchParam} />
          </>
        )}

        <button type="button" className="icon-btn" aria-label="Notifications"
          onClick={() => dispatch(pushToast('No new notifications.'))}>
          <Bell size={18} />
        </button>
        <button type="button" className="icon-btn" aria-label="Help"
          onClick={() => dispatch(pushToast('Help & documentation coming soon.'))}>
          <HelpCircle size={18} />
        </button>

        <UserMenu />
      </div>
    </header>
  );
}
