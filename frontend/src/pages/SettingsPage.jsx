import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { CHANNEL_LABEL } from '../data/constants';
import { togglePermission } from '../features/settings/settingsSlice';
import { selectPerm } from '../features/auth/authSlice';
import { pushToast } from '../features/ui/uiSlice';
import { usersApi } from '../api/usersApi';
import Badge from '../components/common/Badge.jsx';
import AuditLogsPanel from '../components/audit/AuditLogsPanel.jsx';
import ModalShell from '../components/modals/ModalShell.jsx';
import UserFormModal from '../components/modals/UserFormModal.jsx';
import ResetPasswordModal from '../components/modals/ResetPasswordModal.jsx';
import { Plus, Edit, Trash, Key, Inbox, ChevronRight } from '../components/common/icons.jsx';

// Mirrors ADMIN_LOCKED_CAPABILITIES on the server (app/core/permissions.py).
const ADMIN_LOCKED = ['manageUsers', 'manageConfig', 'manageRoles'];
const CAPS = [
  ['createTrace', 'Search Invoice(s)'],
  ['importExport', 'Export Data'],
  ['manageConfig', 'Manage Integration Settings'],
  ['manageUsers', 'Manage Users'],
  ['manageRoles', 'Manage Roles & Permissions'],
  ['viewAuditLog', 'View Audit Logs'],
];

export default function SettingsPage() {
  const { sub: routeSub } = useParams();
  const location = useLocation();
  const sub = routeSub || location.pathname.split('/').filter(Boolean).at(-1);

  return (
    <>
      {sub === 'integrations' && <IntegrationsTab />}
      {sub === 'auditLogs' && <AuditLogsPanel />}
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
            {!rows.length && (
              <tr><td colSpan={3} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>No integration status data available.</td></tr>
            )}
          </tbody>
        </table>
      </div>
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
    || [u.name, u.email, u.role, u.channelScope, ...(u.channels || []), u.ticketRole].join(' ').toLowerCase().includes(q));

  async function handleSave(values) {
    if (formUser) {
      const updated = await usersApi.update(formUser.id, values);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      if (updated.emailLink === 'sent') dispatch(pushToast(`${updated.name} updated. A sign-in link was sent to ${updated.email}.`));
      else if (updated.emailLink === 'failed') dispatch(pushToast(`${updated.name} updated, but the email to ${updated.email} couldn't be sent. Use the key icon to resend.`));
      else dispatch(pushToast(`${updated.name} updated.`));
    } else {
      const created = await usersApi.create(values);
      setUsers((prev) => [...(prev || []), created]);
      dispatch(pushToast(`Invite sent to ${created.email}.`));
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

  async function handleResetPassword() {
    await usersApi.resetPassword(resetUser.id);
    dispatch(pushToast(resetUser.status === 'Invited'
      ? `Invite resent to ${resetUser.email}.`
      : `Reset link sent to ${resetUser.email}.`));
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
                <th scope="col">Inquiry Desk</th>
                <th scope="col">Channels</th>
                <th scope="col">Status</th>
                {perm.manageUsers && <th scope="col" className="col-actions">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={perm.manageUsers ? 7 : 6}>
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
                    <td>{u.ticketRole === 'ADMIN' ? 'Admin' : u.ticketRole === 'CHANNEL_LEAD' ? 'Channel Lead' : u.ticketRole === 'ASSIGNEE' ? 'Assignee' : 'No Access'}</td>
                    <td>{u.role === 'Admin' || u.channelScope === 'all' ? 'All Channels — HQ' : ((u.channels && u.channels.length ? u.channels : [u.channelScope]).map((c) => CHANNEL_LABEL[c] || c).join(', '))}</td>
                    <td><Badge tone={u.status === 'Active' ? 'green' : u.status === 'Invited' ? 'amber' : 'gray'}>{u.status}</Badge></td>
                    {perm.manageUsers && (
                      <td className="col-actions">
                        <div className="row-actions">
                          <button type="button" className="kebab" title="Edit user" aria-label={`Edit ${u.name}`}
                            onClick={() => setFormUser(u)}><Edit /></button>
                          <button
                            type="button" className="kebab"
                            title={u.status === 'Invited' ? 'Resend invite' : 'Reset password'}
                            aria-label={`${u.status === 'Invited' ? 'Resend invite to' : 'Reset password for'} ${u.name}`}
                            onClick={() => setResetUser(u)}
                          ><Key /></button>
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
          onClose={deleting ? () => {} : () => setPendingDelete(null)}
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
    <>
      <div className="card">
        <h3 style={{ margin: '0 0 4px' }}>Application roles</h3>
        <p className="card-hint" style={{ margin: '0 0 12px' }}>
          What each role can do in the app. Changes apply immediately, are checked by the server and are recorded in the audit log.
        </p>
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
                        disabled={r === 'Admin' && ADMIN_LOCKED.includes(capKey)}
                        title={r === 'Admin' && ADMIN_LOCKED.includes(capKey) ? 'Admin always keeps this, so someone can always fix a mistake.' : undefined}
                        onClick={() => dispatch(togglePermission({ role: r, cap: capKey }))
                          .catch((err) => dispatch(pushToast(err.message || 'Could not save that change.')))}
                      >{roleMatrix[r][capKey] ? '✓' : ''}</button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <TicketPermissionsCard />
    </>
  );
}

/** Read-only reference: what each Ticket Role may do in the Inquiry Desk. The table comes from the
 *  server, generated from the same rules the ticket endpoints enforce. A user's ticket role
 *  is set per person under Users; it is separate from their application role above. */
function StatusChips({ text, own }) {
  const items = String(text || '').split(',').map((t) => t.trim()).filter(Boolean);
  if (!items.length) return null;
  return <div className={`tp-val${own ? ' own' : ''}`}>{items.join(', ')}{own && <sup>*</sup>}</div>;
}

function TicketPermissionsCard() {
  const [matrix, setMatrix] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api.get('/v1/ticket-permissions')
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data?.roles) && Array.isArray(data?.rows)) setMatrix(data);
        else setFailed(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="card tp-card">
      <button type="button" className="tp-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>
          <b>Inquiry Desk ticket roles</b>
          <small>What each ticket role can do, by query status. Read-only.</small>
        </span>
        <span className={`chev${open ? ' open' : ''}`} aria-hidden="true"><ChevronRight size={16} /></span>
      </button>

      {open && (
        <div className="tp-body">
          <ul className="tp-notes">
            <li>A person's ticket role is set under <b>Users</b> and is separate from their application role.</li>
            <li>Channel Leads act only on queries in their authorized channels.</li>
            <li>Replying to the supplier and resolving are for the query's assignee, so a Channel Lead or Admin must assign it to themselves first.</li>
          </ul>
          {failed && <p className="tp-state">Couldn't load the ticket permissions.</p>}
          {!matrix && !failed && <p className="tp-state">Loading…</p>}
          {matrix && (
            <>
              <div className="table-scroll">
                <table className="tp-table">
                  <thead><tr><th>Action</th>{matrix.roles.map((r) => <th key={r}>{r}</th>)}</tr></thead>
                  <tbody>
                    {matrix.rows.map((row) => (
                      <tr key={row.action}>
                        <td>{row.action}</td>
                        {row.cells.map((cell, i) => (
                          <td key={matrix.roles[i]}>
                            {!cell.text && !cell.ifAssigned && <span className="tp-none">–</span>}
                            {cell.text && <StatusChips text={cell.text} />}
                            {cell.ifAssigned && <StatusChips text={cell.ifAssigned} own />}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="tp-legend"><sup>*</sup> Only when the query is assigned to that person.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
