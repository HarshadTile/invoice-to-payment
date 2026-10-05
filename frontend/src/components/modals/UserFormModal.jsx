import { useState } from 'react';
import { LOGIN_CHANNELS } from '../../data/constants';
import ModalShell from './ModalShell.jsx';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Create or edit a real login account (app/models/user.py), via the usersApi passed in.
 * `user`: null to create, an existing user object to edit.
 *
 * No password field, ever: creating an account emails the person an invite link to set
 * their own first password — nobody who creates or edits an account sets it for them.
 *
 * Portal / channel access is a property of the account (assigned here), never something the
 * person logging in gets to pick. An Admin always has every channel; any other role must be
 * locked to exactly one portal, matching the login screen's own "Portal / Team" list.
 */
export default function UserFormModal({ user, roles, onClose, onSave }) {
  const editing = !!user;
  const [values, setValues] = useState(() => (editing
    ? { name: user.name, email: user.email, role: user.role, status: user.status, channelScope: user.channelScope, ticketRole: user.ticketRole || 'NO_ACCESS' }
    : { username: '', name: '', email: '', role: roles[0] || 'Viewer', channelScope: LOGIN_CHANNELS[0]?.key || '', ticketRole: 'NO_ACCESS' }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = values.role === 'Admin';
  const set = (key) => (e) => setValues((prev) => ({ ...prev, [key]: e.target.value }));

  function validate() {
    if (!values.name.trim()) return 'Full name is required.';
    if (!emailPattern.test(values.email)) return 'Enter a valid email address.';
    if (!isAdmin && !values.channelScope) return 'Assign a portal for this role.';
    if (!editing && !values.username.trim()) return 'Username is required.';
    return '';
  }

  async function save() {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError('');
    setBusy(true);
    try {
      await onSave({ ...values, channelScope: isAdmin ? 'all' : values.channelScope });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title={editing ? `Edit User: ${user.name}` : 'Add User'}
      width={520}
      foot={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn primary" onClick={save} disabled={busy}>
            {busy ? 'Sending…' : editing ? 'Save Changes' : 'Send Invite'}
          </button>
        </>
      )}
    >
      {error && <div className="form-error" role="alert">{error}</div>}

      {!editing && (
        <div className="form-field">
          <label>Username</label>
          <input value={values.username} onChange={set('username')} autoFocus autoComplete="off" />
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0' }}>
            They'll get an email to set their own password — no password is set here.
          </p>
        </div>
      )}

      <div className="row">
        <div className="form-field" style={{ flex: 1 }}>
          <label>Full Name</label>
          <input value={values.name} onChange={set('name')} autoFocus={editing} />
        </div>
        <div className="form-field" style={{ flex: 1 }}>
          <label>Email</label>
          <input type="email" value={values.email} onChange={set('email')} />
        </div>
      </div>

      <div className="row">
        <div className="form-field" style={{ flex: 1 }}>
          <label>Role</label>
          <select
            value={values.role}
            onChange={(e) => setValues((prev) => ({
              ...prev,
              role: e.target.value,
              channelScope: prev.channelScope || LOGIN_CHANNELS[0]?.key || '',
              ticketRole: e.target.value === 'Admin'
                ? 'ADMIN'
                : (prev.role === 'Admin' ? (e.target.value === 'MDE Invoice Team' ? 'ASSIGNEE' : 'NO_ACCESS') : prev.ticketRole),
            }))}
          >
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {isAdmin ? (
          <div className="form-field" style={{ flex: 1 }}>
            <label>Portal Access</label>
            <input value="All Channels — HQ / Admin" readOnly />
          </div>
        ) : (
          <div className="form-field" style={{ flex: 1 }}>
            <label>Portal</label>
            <select value={values.channelScope} onChange={set('channelScope')}>
              {LOGIN_CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {!isAdmin && (
        <div className="form-field">
          <label>Inquiry Desk Access</label>
          <select value={values.ticketRole} onChange={set('ticketRole')}>
            <option value="NO_ACCESS">No Ticket Access</option>
            <option value="ASSIGNEE">Assignee</option>
            <option value="CHANNEL_LEAD">Channel Lead</option>
          </select>
        </div>
      )}

      {editing && (
        <div className="row">
          <div className="form-field" style={{ flex: 1 }}>
            <label>Status</label>
            {user.status === 'Invited' ? (
              <>
                <input value="Invited — hasn't set a password yet" readOnly />
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                  Use the key icon on their row to resend the invite.
                </p>
              </>
            ) : (
              <select value={values.status} onChange={set('status')}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            )}
          </div>
        </div>
      )}
    </ModalShell>
  );
}
