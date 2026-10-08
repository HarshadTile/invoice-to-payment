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
 * Three separate concepts, deliberately not mixed in one dropdown:
 *  - Application Role: what the person may do in the app (Admin, Invoice Team, ...).
 *  - Ticket Role: what they may do in the Inquiry Desk. Never implied by the application
 *    role — an Accounts or Viewer user has no ticket access unless one is granted here.
 *  - Authorized Channel: the one channel they work in. Admin always has all of them.
 */
export default function UserFormModal({ user, roles, onClose, onSave }) {
  const editing = !!user;
  const [values, setValues] = useState(() => (editing
    ? {
      name: user.name, email: user.email, role: user.role, status: user.status,
      // An Admin's ticket role is the inherited ADMIN, which isn't a grantable value: if they're
      // later changed to another role, start from no ticket access.
      ticketRole: user.ticketRole && user.ticketRole !== 'ADMIN' ? user.ticketRole : 'NO_ACCESS',
      // One channel per person; an older account that still has several starts from the first.
      channels: (user.channels || []).slice(0, 1),
    }
    : {
      name: '', email: '', role: roles[0] || 'Viewer',
      ticketRole: 'NO_ACCESS', channels: [],
    }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = values.role === 'Admin';
  const set = (key) => (e) => setValues((prev) => ({ ...prev, [key]: e.target.value }));
  const pickChannel = (key) => setValues((prev) => ({ ...prev, channels: [key] }));

  function validate() {
    if (!values.name.trim()) return 'Full name is required.';
    if (!emailPattern.test(values.email)) return 'Enter a valid email address.';
    if (!isAdmin && values.channels.length === 0) return 'Select the channel this user can access.';
    return '';
  }

  async function save() {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError('');
    setBusy(true);
    try {
      await onSave({
        ...values,
        channels: isAdmin ? [] : values.channels,
        // Admin inherits full ticket access on the server; send nothing to override.
        ticketRole: isAdmin ? undefined : values.ticketRole,
      });
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
      onClose={busy ? () => {} : onClose}
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

      <div className="row">
        <div className="form-field" style={{ flex: 1 }}>
          <label>Full Name</label>
          <input value={values.name} onChange={set('name')} autoFocus />
        </div>
        <div className="form-field" style={{ flex: 1 }}>
          <label>Email</label>
          <input type="email" value={values.email} onChange={set('email')} />
        </div>
      </div>
      {!editing && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '-6px 0 14px' }}>
          They sign in with this email and get a message to set their own password. No password is set here.
        </p>
      )}

      <div className="row">
        <div className="form-field" style={{ flex: 1 }}>
          <label>Application Role</label>
          <select value={values.role} onChange={set('role')}>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="form-field" style={{ flex: 1 }}>
          <label>Ticket Role</label>
          {isAdmin ? (
            <input value="Admin (inherited)" readOnly />
          ) : (
            <select value={values.ticketRole} onChange={set('ticketRole')}>
              <option value="NO_ACCESS">No Ticket Access</option>
              <option value="ASSIGNEE">Assignee</option>
              <option value="CHANNEL_LEAD">Channel Lead</option>
            </select>
          )}
        </div>
      </div>

      <div className="form-field">
        <label>Authorized Channel</label>
        {isAdmin ? (
          <input value="All Channels — HQ / Admin" readOnly />
        ) : (
          <div className="choice-grid">
            {LOGIN_CHANNELS.map((c) => (
              <label key={c.key} className="choice-tile">
                <input
                  type="radio"
                  name="authorized-channel"
                  checked={values.channels.includes(c.key)}
                  onChange={() => pickChannel(c.key)}
                />
                {c.label}
              </label>
            ))}
          </div>
        )}
      </div>

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
