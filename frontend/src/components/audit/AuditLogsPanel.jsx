import { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectTable, setRowsLocal } from '../../features/tables/tablesSlice';
import { api } from '../../api/client';
import EditableTable from '../common/EditableTable.jsx';

const AUDIT_POLL_MS = 5000;
const TABLE_KEY = 'settings-audit';

/** Who changed what in the app (logins, users, roles, settings). Read-only and append-only on the server. */
export default function AuditLogsPanel() {
  const dispatch = useDispatch();
  const stored = useSelector((s) => selectTable(s, TABLE_KEY));
  // The server appends oldest-first ([timestamp, user, action, detail]); show the newest entry at
  // the top and put the timestamp in the last column.
  const rows = useMemo(() => [...stored].reverse().map(([when, who, action, detail]) => [who, action, detail, when]), [stored]);

  // Keep the log live: re-fetch every few seconds while this tab is open and visible,
  // and once immediately on mount/refocus. Skip the store update when nothing changed
  // so an idle log doesn't re-render (or reset the search box) on every tick.
  useEffect(() => {
    let cancelled = false;
    let latest = JSON.stringify(stored);
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const { rows: fresh } = await api.get(`/v1/tables/${TABLE_KEY}`);
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

  return (
    <div className="card">
      <p className="card-hint" style={{ margin: '0 0 10px' }}>Live: updates automatically every few seconds. Newest first.</p>
      <EditableTable tableKey={TABLE_KEY} cols={['User', 'Action', 'Detail', 'Timestamp']} rows={rows} canImportExport={false} tableClass="audit-table" />
    </div>
  );
}
