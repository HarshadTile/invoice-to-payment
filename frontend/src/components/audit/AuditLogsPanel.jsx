import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectTable, setRowsLocal } from '../../features/tables/tablesSlice';
import { workspaceApi } from '../../api/workspaceApi';
import StatCard from '../common/StatCard.jsx';
import PagerFoot from '../common/PagerFoot.jsx';
import { Avatar } from '../settings/SettingsParts.jsx';
import { Activity, AlertTriangle, Building, Edit, LogIn, Search, Settings, Users } from '../common/icons.jsx';

const AUDIT_POLL_MS = 5000;
const TABLE_KEY = 'settings-audit';
const PAGE_SIZE = 25;
const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

/** What kind of event a log line is, from its action text. */
export function auditCategory(action) {
  const text = String(action || '').toLowerCase();
  if (text.includes('fail')) return 'failed';
  if (/logged (in|out)|login|logout|sign/.test(text)) return 'signin';
  if (/supplier|vendor/.test(text)) return 'suppliers';
  if (/user|password|setup link|reset link/.test(text)) return 'users';
  if (/setting|role|permission|notification|expiry|channel|portal/.test(text)) return 'settings';
  return 'other';
}

const CATEGORY = {
  signin: { label: 'Sign-ins', icon: LogIn, tone: 'blue' },
  failed: { label: 'Failed', icon: AlertTriangle, tone: 'red' },
  users: { label: 'Users', icon: Users, tone: 'purple' },
  suppliers: { label: 'Suppliers', icon: Building, tone: 'amber' },
  settings: { label: 'Settings', icon: Settings, tone: 'green' },
  other: { label: 'Other', icon: Edit, tone: 'gray' },
};
const FILTERS = ['all', 'signin', 'failed', 'users', 'suppliers', 'settings'];

/** "31 Oct 2026, 04:52:10 PM" or "2026-08-06 07:10" -> "2026-10-31". */
export function auditDay(when) {
  const text = String(when || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/.exec(text);
  return m && MONTHS[m[2].toLowerCase()] ? `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}` : '';
}

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Who changed what in the app (logins, users, roles, settings). Read-only and append-only on the server. */
export default function AuditLogsPanel() {
  const dispatch = useDispatch();
  const stored = useSelector((s) => selectTable(s, TABLE_KEY));
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // The server appends oldest-first ([timestamp, user, action, detail]); show the newest at the top.
  const rows = useMemo(() => [...stored].reverse().map(([when, who, action, detail], index) => ({
    key: `${stored.length - index}`, when, who, action, detail, category: auditCategory(action), day: auditDay(when),
  })), [stored]);

  // Keep the log live: re-fetch every few seconds while this page is open and visible,
  // and once immediately on mount/refocus. Skip the store update when nothing changed
  // so an idle log doesn't re-render on every tick.
  useEffect(() => {
    let cancelled = false;
    let latest = JSON.stringify(stored);
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const { rows: fresh } = await workspaceApi.getTable(TABLE_KEY);
        const next = JSON.stringify(fresh);
        if (!cancelled && next !== latest) {
          latest = next;
          dispatch(setRowsLocal({ key: TABLE_KEY, rows: fresh }));
        }
      } catch { /* transient failure — the next tick retries */ }
    };
    refresh();
    const timer = setInterval(refresh, AUDIT_POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const today = todayKey();
  const stats = useMemo(() => {
    const s = { today: 0, signin: 0, failed: 0, changes: 0 };
    for (const r of rows) {
      if (r.day !== today) continue;
      s.today += 1;
      if (r.category === 'signin') s.signin += 1;
      else if (r.category === 'failed') s.failed += 1;
      else s.changes += 1;
    }
    return s;
  }, [rows, today]);

  const needle = search.trim().toLowerCase();
  const shown = rows.filter((r) => (filter === 'all' || r.category === filter)
    && (!needle || `${r.who} ${r.action} ${r.detail} ${r.when}`.toLowerCase().includes(needle)));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const pageRows = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const pick = (f) => { setFilter(f); setPage(1); };

  return (
    <>
      <div className="kpi-grid set-kpis four">
        <StatCard tone="shade-total" icon={<Activity size={16} />} label="Events today" value={stats.today} sub={`${rows.length.toLocaleString('en-IN')} in the log`} onClick={() => pick('all')} active={filter === 'all'} />
        <StatCard tone="shade-approved" icon={<LogIn size={16} />} label="Sign-ins today" value={stats.signin} sub="Staff and suppliers" onClick={() => pick('signin')} active={filter === 'signin'} />
        <StatCard tone="shade-pending" icon={<AlertTriangle size={16} />} label="Failed sign-ins today" value={stats.failed} sub={stats.failed ? 'Worth a look' : 'None today'} onClick={() => pick('failed')} active={filter === 'failed'} />
        <StatCard tone="shade-paid" icon={<Edit size={16} />} label="Changes today" value={stats.changes} sub="Users, suppliers and settings" />
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
            <input placeholder="Search person, action or detail..." aria-label="Search the audit log"
              value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </label>
          <span className="set-live"><span className="set-live-dot" aria-hidden="true" />Live: updates automatically every few seconds. Newest first.</span>
        </div>

        <div className="table-scroll">
          <table className="data-table set-table audit-table">
            <thead>
              <tr><th scope="col">Event</th><th scope="col">By</th><th scope="col">Detail</th><th scope="col">When</th></tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr><td colSpan={4}><div className="empty-state"><Activity /><b>No events</b><span>{needle || filter !== 'all' ? 'Try a different search or filter.' : 'Activity appears here as it happens.'}</span></div></td></tr>
              )}
              {pageRows.map((r) => {
                const { icon: Icon, tone } = CATEGORY[r.category];
                return (
                  <tr key={r.key}>
                    <td><span className={`log-event ${tone}`}><span className="log-event-ic" aria-hidden="true"><Icon size={12} /></span>{r.action}</span></td>
                    <td><span className="set-person compact"><Avatar name={r.who} size="sm" /><span>{r.who}</span></span></td>
                    <td className="cell-muted set-detail" title={r.detail}>{r.detail || '—'}</td>
                    <td className="cell-muted" style={{ whiteSpace: 'nowrap' }}>{r.when}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PagerFoot total={shown.length} page={current} pageSize={PAGE_SIZE} onPage={setPage} />
      </div>
    </>
  );
}
