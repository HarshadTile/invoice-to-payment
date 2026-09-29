import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import { selectTable, toggleNotifRule } from '../features/tables/tablesSlice';
import { CHANNEL_LABEL } from '../data/constants';
import { togglePermission } from '../features/settings/settingsSlice';
import { selectPerm } from '../features/auth/authSlice';
import { pushToast } from '../features/ui/uiSlice';
import { usersApi } from '../api/usersApi';
import EditableTable from '../components/common/EditableTable.jsx';
import Badge from '../components/common/Badge.jsx';
import ModalShell from '../components/modals/ModalShell.jsx';
import UserFormModal from '../components/modals/UserFormModal.jsx';
import ResetPasswordModal from '../components/modals/ResetPasswordModal.jsx';
import { Plus, Edit, Trash, Key, Inbox } from '../components/common/icons.jsx';

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
  const dispatch = useDispatch();
  const perm = useSelector(selectPerm);
  const currentUserId = useSelector((s) => s.auth.id);
  const roles = Object.keys(useSelector((s) => s.settings.roleMatrix));

  const [users, setUsers] = useState(null); // null while loading
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [formUser, setFormUser] = useState(undefined); // undefined = closed, null = create, object = edit
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [resetUser, setResetUser] = useState(null);

  const load = () => usersApi.list().then(setUsers).catch((err) => setLoadError(err.message));
  useEffect(() => { load(); }, []);

  const q = search.trim().toLowerCase();
  const filtered = (users || []).filter((u) => !q
    || [u.name, u.email, u.role, u.channelScope].join(' ').toLowerCase().includes(q));

  async function handleSave(values) {
    if (formUser) {
      const updated = await usersApi.update(formUser.id, values);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      dispatch(pushToast(`${updated.name} updated.`));
    } else {
      const created = await usersApi.create(values);
      setUsers((prev) => [...(prev || []), created]);
      dispatch(pushToast(`${created.name} added.`));
    }
    setFormUser(undefined);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await usersApi.remove(pendingDelete.id);
      setUsers((prev) => prev.filter((u) => u.id !== pendingDelete.id));
      dispatch(pushToast(`${pendingDelete.name} removed.`));
      setPendingDelete(null);
    } catch (err) {
      dispatch(pushToast(err.message));
    } finally {
      setDeleting(false);
    }
  }

  async function handleResetPassword(password) {
    await usersApi.resetPassword(resetUser.id, password);
    dispatch(pushToast(`Password reset for ${resetUser.name}.`));
    setResetUser(null);
  }

  return (
    <div className="card">
      <div className="toolbar">
        <div className="toolbar-left">
          <input
            className="search-box" placeholder="Search users..." aria-label="Search users"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {perm.manageUsers && (
          <div className="toolbar-right">
            <button type="button" className="btn primary" onClick={() => setFormUser(null)}><Plus />Add User</button>
          </div>
        )}
      </div>

      {loadError && <div className="form-error" role="alert">Couldn't load users: {loadError}</div>}

      {users === null && !loadError ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>Loading users…</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Portal</th>
                <th scope="col">Status</th>
                {perm.manageUsers && <th scope="col" className="col-actions">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={perm.manageUsers ? 6 : 5}>
                  <div className="empty-state">
                    <Inbox />
                    <b>No users match</b>
                    <span>{q ? 'Try a different search.' : 'No accounts have been created yet.'}</span>
                  </div>
                </td></tr>
              )}
              {filtered.map((u) => {
                const isSelf = u.id === currentUserId;
                return (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td className="cell-muted">{u.email}</td>
                    <td><span className="role-chip">{u.role}</span></td>
                    <td>{u.channelScope === 'all' ? 'All Channels — HQ' : (CHANNEL_LABEL[u.channelScope] || u.channelScope)}</td>
                    <td><Badge tone={u.status === 'Active' ? 'green' : 'gray'}>{u.status}</Badge></td>
                    {perm.manageUsers && (
                      <td className="col-actions">
                        <div className="row-actions">
                          <button type="button" className="kebab" title="Edit user" aria-label={`Edit ${u.name}`}
                            onClick={() => setFormUser(u)}><Edit /></button>
                          <button type="button" className="kebab" title="Reset password" aria-label={`Reset password for ${u.name}`}
                            onClick={() => setResetUser(u)}><Key /></button>
                          <button
                            type="button" className="kebab" aria-label={`Remove ${u.name}`}
                            title={isSelf ? "You can't remove your own account" : 'Remove user'}
                            disabled={isSelf}
                            onClick={() => setPendingDelete(u)}
                          ><Trash /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {formUser !== undefined && (
        <UserFormModal user={formUser} roles={roles} onClose={() => setFormUser(undefined)} onSave={handleSave} />
      )}

      {resetUser && (
        <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} onReset={handleResetPassword} />
      )}

      {pendingDelete && (
        <ModalShell
          title="Remove User"
          width={440}
          foot={(
            <>
              <button type="button" className="btn" onClick={() => setPendingDelete(null)} disabled={deleting}>Cancel</button>
              <button type="button" className="btn danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Removing…' : 'Remove User'}
              </button>
            </>
          )}
        >
          <p className="modal-copy">
            Remove <b>{pendingDelete.name}</b> ({pendingDelete.email})? They will no longer be able to sign in. This can't be undone.
          </p>
        </ModalShell>
      )}
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
