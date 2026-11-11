import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { auditApi } from '../../api/auditApi';
import { pushToast } from '../../features/ui/uiSlice';
import StatCard from '../common/StatCard.jsx';
import PagerFoot from '../common/PagerFoot.jsx';
import { Avatar } from '../settings/SettingsParts.jsx';
import { Activity, AlertTriangle, Building, Download, Edit, LogIn, Search, Settings, Users } from '../common/icons.jsx';

const PAGE_SIZE = 25;
const REFRESH_MS = 30000;
const SEARCH_DELAY_MS = 350;

const CATEGORY = {
  signin: { label: 'Sign-ins', icon: LogIn, tone: 'blue' },
  failed: { label: 'Failed', icon: AlertTriangle, tone: 'red' },
  users: { label: 'Users', icon: Users, tone: 'purple' },
  suppliers: { label: 'Suppliers', icon: Building, tone: 'amber' },
  settings: { label: 'Settings', icon: Settings, tone: 'green' },
  other: { label: 'Other', icon: Edit, tone: 'gray' },
};
const FILTERS = ['all', 'signin', 'failed', 'users', 'suppliers', 'settings'];

/** '11 Nov 2026, 02:29:53 pm' in the viewer's time zone (the server stores UTC). */
export function formatAuditTime(iso, locale = 'en-IN') {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(locale, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });
}

/** Midnight today in the viewer's time zone, as an ISO instant (for the "today" counts). */
export function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

/** Who changed what in the app (sign-ins, users, suppliers, settings). Read-only and append-only:
 *  the server filters, searches and pages it, so the page stays fast however long the log grows. */
export default function AuditLogsPanel() {
  const dispatch = useDispatch();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Search runs after typing pauses, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    auditApi.list({ page, page_size: PAGE_SIZE, category: filter, q: query, since: startOfToday() })
      .then((result) => { if (!cancelled) { setData(result); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [filter, query, page, tick]);

  // New events appear without a reload: refresh every 30 s while the page is visible.
  useEffect(() => {
    const refresh = () => { if (!document.hidden) setTick((n) => n + 1); };
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);

  async function exportCsv() {
    setExporting(true);
    try {
      await auditApi.download({ category: filter, q: query });
    } catch {
      dispatch(pushToast("Couldn't export the audit log. Please try again."));
    } finally {
      setExporting(false);
    }
  }

  const pick = (f) => { setFilter(f); setPage(1); };
  const items = data?.items || [];
  const summary = data?.summary || { total: 0, signin: 0, failed: 0, changes: 0 };
  const logTotal = data?.logTotal ?? 0;

  return (
    <>
      <div className="kpi-grid set-kpis four">
        <StatCard tone="shade-total" icon={<Activity size={16} />} label="Events today" value={summary.total} sub={`${logTotal.toLocaleString('en-IN')} in the log`} onClick={() => pick('all')} active={filter === 'all'} />
        <StatCard tone="shade-approved" icon={<LogIn size={16} />} label="Sign-ins today" value={summary.signin} sub="Staff and suppliers" onClick={() => pick('signin')} active={filter === 'signin'} />
        <StatCard tone="shade-pending" icon={<AlertTriangle size={16} />} label="Failed sign-ins today" value={summary.failed} sub={summary.failed ? 'Worth a look' : 'None today'} onClick={() => pick('failed')} active={filter === 'failed'} />
        <StatCard tone="shade-paid" icon={<Edit size={16} />} label="Changes today" value={summary.changes} sub="Users, suppliers and settings" />
      </div>

      <div className="card set-card">
        <div className="set-toolbar">
          <div className="sm-filter" role="group" aria-label="Event type">
            {FILTERS.map((f) => (
              <button key={f} type="button" className={`sm-chip${filter === f ? ' active' : ''}`} aria-pressed={filter === f} onClick={() => pick(f)}>
                {f === 'all' ? 'All' : CATEGORY[f].label}
              </button>
            ))}
          </div>
          <label className="set-search">
            <Search size={15} />
            <input placeholder="Search person, action, detail or IP..." aria-label="Search the audit log"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button type="button" className="btn btn-sm" onClick={exportCsv} disabled={exporting}>
            <Download size={14} />{exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <span className="set-live"><span className="set-live-dot" aria-hidden="true" />Updates every 30 seconds. Newest first.</span>
        </div>

        <div className="table-scroll">
          <table className="data-table set-table audit-table">
            <thead>
              <tr><th scope="col">Event</th><th scope="col">By</th><th scope="col">Detail</th><th scope="col">IP address</th><th scope="col">When</th></tr>
            </thead>
            <tbody>
              {failed && !data && (
                <tr><td colSpan={5}><div className="empty-state"><AlertTriangle /><b>Couldn't load the audit log</b><span>It will try again shortly.</span></div></td></tr>
              )}
              {data && items.length === 0 && (
                <tr><td colSpan={5}><div className="empty-state"><Activity /><b>No events</b><span>{query || filter !== 'all' ? 'Try a different search or filter.' : 'Activity appears here as it happens.'}</span></div></td></tr>
              )}
              {items.map((r) => {
                const { icon: Icon, tone } = CATEGORY[r.category] || CATEGORY.other;
                return (
                  <tr key={r.id}>
                    <td><span className={`log-event ${tone}`}><span className="log-event-ic" aria-hidden="true"><Icon size={12} /></span>{r.action}</span></td>
                    <td><span className="set-person compact"><Avatar name={r.who} size="sm" /><span>{r.who}</span></span></td>
                    <td className="cell-muted set-detail" title={r.detail}>{r.detail || '—'}</td>
                    <td className="cell-muted" style={{ whiteSpace: 'nowrap' }}>{r.ip || '—'}</td>
                    <td className="cell-muted" style={{ whiteSpace: 'nowrap' }}>{formatAuditTime(r.when)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PagerFoot total={data?.total || 0} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
      </div>
    </>
  );
}
