import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { CHANNEL_LABEL } from '../../data/constants';
import { selectPerm } from '../../features/auth/authSlice';
import { pushToast } from '../../features/ui/uiSlice';
import { usersApi } from '../../api/usersApi';
import Badge from '../../components/common/Badge.jsx';
import StatCard from '../../components/common/StatCard.jsx';
import ModalShell from '../../components/modals/ModalShell.jsx';
import UserFormModal from '../../components/modals/UserFormModal.jsx';
import ResetPasswordModal from '../../components/modals/ResetPasswordModal.jsx';
import { Avatar, ExpiryDisclosure, TagList, nameTone } from '../../components/settings/SettingsParts.jsx';
import { Plus, Edit, Trash, Key, Inbox, Search, Users, CheckCircle, Clock, X } from '../../components/common/icons.jsx';

const TICKET_ROLE_LABEL = { ADMIN: 'Admin', CHANNEL_LEAD: 'Channel Lead', ASSIGNEE: 'Assignee' };

const USER_FILTERS = [
  { key: '', label: 'Total users', icon: Users, tone: 'shade-total', sub: 'Everyone with an internal account' },
  { key: 'Active', label: 'Active', icon: CheckCircle, tone: 'shade-paid', sub: 'Can sign in' },
  { key: 'Invited', label: 'Invited', icon: Clock, tone: 'shade-pending', sub: 'Password not set yet' },
  { key: 'Inactive', label: 'Inactive', icon: X, tone: 'shade-neutral', sub: 'Access switched off' },
];

export default function UsersTab() {
  const dispatch = useDispatch();
  const perm = useSelector(selectPerm);
  const currentUserId = useSelector((s) => s.auth.id);
  const roles = Object.keys(useSelector((s) => s.settings.roleMatrix));

  const [users, setUsers] = useState(null); // null while loading
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const roleFilter = searchParams.get('role') || '';
  const clearRole = () => { const next = new URLSearchParams(searchParams); next.delete('role'); setSearchParams(next, { replace: true }); };
  const [formUser, setFormUser] = useState(undefined); // undefined = closed, null = create, object = edit
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [resetUser, setResetUser] = useState(null);

  const load = () => usersApi.list().then(setUsers).catch((err) => setLoadError(err.message));
  useEffect(() => { load(); }, []);

  const q = search.trim().toLowerCase();
  const counts = useMemo(() => {
    const c = { '': 0, Active: 0, Invited: 0, Inactive: 0 };
    for (const u of users || []) { c[''] += 1; c[u.status] = (c[u.status] || 0) + 1; }
    return c;
  }, [users]);
  const filtered = (users || []).filter((u) => (!statusFilter || u.status === statusFilter) && (!roleFilter || u.role === roleFilter) && (!q
    || [u.name, u.email, u.role, u.channelScope, ...(u.channels || []), u.ticketRole].join(' ').toLowerCase().includes(q)));

  async function handleSave(values) {
    if (formUser) {
      const { emailSent, ...updated } = await usersApi.update(formUser.id, values);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      dispatch(pushToast(`${updated.name} updated.${emailSent === true ? ' Account email sent.' : emailSent === false ? ' Email could not be sent; check SMTP and use Send Access Email to retry.' : ''}`));
    } else {
      const { emailSent, ...created } = await usersApi.create(values);
      setUsers((prev) => [...(prev || []), created]);
      dispatch(pushToast(`User created.${emailSent ? ' Invitation email sent.' : ' Invitation email could not be sent; check SMTP and use Send Access Email to retry.'}`));
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
    const result = await usersApi.resetPassword(resetUser.id);
    dispatch(pushToast(result.emailSent ? `Access email sent to ${resetUser.email}.` : 'Email could not be sent; check SMTP configuration and try again.'));
    setResetUser(null);
  }

  return (
    <>
      <div className="kpi-grid set-kpis four">
        {USER_FILTERS.map(({ key, label, icon: Icon, tone, sub }) => (
          <StatCard key={key || 'all'} tone={tone} icon={<Icon size={16} />} label={label} sub={sub}
            value={users ? counts[key] || 0 : '–'} onClick={() => setStatusFilter(key)} active={statusFilter === key} />
        ))}
      </div>

      <div className="card set-card">
        {perm.manageUsers && <ExpiryDisclosure />}
        <div className="set-toolbar">
          <label className="set-search">
            <Search size={15} />
            <input placeholder="Search users by name, email, role or channel..." aria-label="Search users"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          {roleFilter && (
            <span className="chip reports-chip">
              Role: {roleFilter}
              <button type="button" onClick={clearRole} aria-label="Remove role filter"><X size={12} /></button>
            </span>
          )}
          <span className="set-count">{filtered.length} user{filtered.length === 1 ? '' : 's'}{statusFilter ? ` · ${statusFilter}` : ''}</span>
          {perm.manageUsers && (
            <button type="button" className="btn primary" onClick={() => setFormUser(null)}><Plus />Add User</button>
          )}
        </div>

        {loadError && <div className="form-error" role="alert">Couldn't load users: {loadError}</div>}

        {users === null && !loadError ? (
          <p className="set-loading">Loading users…</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table set-table">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Role</th>
                  <th scope="col">Inquiry Desk</th>
                  <th scope="col">Channels</th>
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
                      <span>{q || statusFilter ? 'Try a different search or filter.' : 'No accounts have been created yet.'}</span>
                    </div>
                  </td></tr>
                )}
                {filtered.map((u) => {
                  const isSelf = u.id === currentUserId;
                  const allChannels = u.role === 'Admin' || u.channelScope === 'all';
                  return (
                    <tr key={u.id}>
                      <td>
                        <span className="set-person">
                          <Avatar name={u.name} />
                          <span><b>{u.name}{isSelf && <span className="set-you">You</span>}</b><small>{u.email}</small></span>
                        </span>
                      </td>
                      <td><span className={`role-chip ${u.role === 'Admin' ? 'role-admin' : `tone-${nameTone(u.role)}`}`}>{u.role}</span></td>
                      <td className={u.ticketRole && TICKET_ROLE_LABEL[u.ticketRole] ? '' : 'cell-muted'}>{TICKET_ROLE_LABEL[u.ticketRole] || 'No Access'}</td>
                      <td>{allChannels
                        ? <span className="set-tag hq">All Channels — HQ</span>
                        : <TagList mono={false} items={(u.channels && u.channels.length ? u.channels : [u.channelScope]).map((c) => CHANNEL_LABEL[c] || c)} />}</td>
                      <td><Badge tone={u.status === 'Active' ? 'green' : u.status === 'Invited' ? 'amber' : 'gray'}>{u.status}</Badge></td>
                      {perm.manageUsers && (
                        <td className="col-actions">
                          <div className="row-actions">
                            <button type="button" className="kebab" title="Edit user" aria-label={`Edit ${u.name}`}
                              onClick={() => setFormUser(u)}><Edit /></button>
                            <button
                              type="button" className="kebab"
                              title="Send account setup or password reset email"
                              aria-label={`Send access email to ${u.name}`}
                              disabled={u.status === 'Inactive'}
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
      </div>

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
    </>
  );
}
