import { useDispatch, useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import { selectTable, toggleNotifRule } from '../features/tables/tablesSlice';
import { togglePermission } from '../features/settings/settingsSlice';
import { selectPerm } from '../features/auth/authSlice';
import EditableTable from '../components/common/EditableTable.jsx';
import Badge from '../components/common/Badge.jsx';

const TITLES = { integrations: 'Integration Settings', notifications: 'Notifications', auditLogs: 'Audit Logs', users: 'Users', roles: 'Roles & Permissions' };
const CAPS = [
  ['importExport', 'Import / Export Data'],
  ['editRows', 'Add / Edit / Delete Rows'],
  ['createTrace', 'Search Invoice(s)'],
  ['manageConfig', 'Manage Integration & Notification Config'],
  ['manageUsers', 'Manage Users & Roles'],
];

export default function SettingsPage() {
  const { sub: routeSub } = useParams();
  const location = useLocation();
  const sub = routeSub || location.pathname.split('/').filter(Boolean).at(-1);
  const title = TITLES[sub] || 'Settings';

  return (
    <>
      <h1 className="page-title">{title}</h1>
      {sub === 'integrations' && <IntegrationsTab />}
      {sub === 'notifications' && <NotificationsTab />}
      {sub === 'auditLogs' && <AuditLogsTab />}
      {sub === 'users' && <UsersTab />}
      {sub === 'roles' && <RolesTab />}
    </>
  );
}

function IntegrationsTab() {
  const rows = useSelector((s) => s.settings.integrations);
  return (
    <div className="card">
      <div className="table-scroll">
        <table>
          <thead><tr><th>Platform</th><th>Status</th><th>Last Synced</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}><td>{r[0]}</td><td><Badge tone={r[1] === 'Connected' ? 'green' : 'red'}>{r[1]}</Badge></td><td>{r[2]}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NotificationsTab() {
  const dispatch = useDispatch();
  const tableKey = 'settings-notifications';
  const rows = useSelector((s) => selectTable(s, tableKey));
  const senderEmail = useSelector((s) => s.settings.senderEmail);
  const perm = useSelector(selectPerm);

  return (
    <div className="card">
      <div className="toolbar">
        <div className="toolbar-left"><h3 style={{ margin: 0 }}>Auto-Notify Rules</h3></div>
      </div>
      <div className="form-field" style={{ maxWidth: 420, marginBottom: 6 }}>
        <label>Sender email for auto-mails</label>
        <input value={senderEmail} readOnly />
      </div>
      {rows.map((r, idx) => (
        <div className="notif-row" key={idx}>
          <div className="notif-main">
            <div className="notif-title">{r[0]}</div>
            <div className="notif-sub">Auto-mails <b>{r[1]}</b>{r[2] !== '-' ? <> · CC <b>{r[2]}</b></> : null}</div>
          </div>
          <button
            type="button"
            className={`toggle${r[3] === 'On' ? ' on' : ''}`}
            disabled={!perm.manageConfig}
            onClick={() => dispatch(toggleNotifRule(idx))}
          ><div className="dot" /></button>
        </div>
      ))}
    </div>
  );
}

function AuditLogsTab() {
  const tableKey = 'settings-audit';
  const rows = useSelector((s) => selectTable(s, tableKey));
  return (
    <div className="card">
      <EditableTable tableKey={tableKey} cols={['Timestamp', 'User', 'Action', 'Detail']} rows={rows} canEdit={false} allowAdd={false} canImportExport={false} />
    </div>
  );
}

function UsersTab() {
  const tableKey = 'settings-users';
  const rows = useSelector((s) => selectTable(s, tableKey));
  const perm = useSelector(selectPerm);
  return (
    <div className="card">
      <EditableTable tableKey={tableKey} cols={['Name', 'Email', 'Job Title', 'Department', 'Role', 'Status']} rows={rows} canEdit={perm.manageUsers} canImportExport={perm.importExport} />
    </div>
  );
}

function RolesTab() {
  const dispatch = useDispatch();
  const roleMatrix = useSelector((s) => s.settings.roleMatrix);
  const roles = Object.keys(roleMatrix);
  return (
    <div className="card">
      <div className="table-scroll">
        <table className="perm-table">
          <thead><tr><th>Capability</th>{roles.map((r) => <th key={r}>{r}</th>)}</tr></thead>
          <tbody>
            {CAPS.map(([capKey, capLabel]) => (
              <tr key={capKey}>
                <td>{capLabel}</td>
                {roles.map((r) => (
                  <td key={r}>
                    <button
                      type="button"
                      className={`check-toggle${roleMatrix[r][capKey] ? ' on' : ''}`}
                      onClick={() => dispatch(togglePermission({ role: r, cap: capKey }))}
                    >{roleMatrix[r][capKey] ? '✓' : ''}</button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
