import { useState } from 'react';
import ModalShell from './ModalShell.jsx';

export default function ResetPasswordModal({ user, onClose, onReset }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setError('');
    setBusy(true);
    try {
      await onReset(password);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title={`Reset Password: ${user.name}`}
      width={440}
      foot={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Reset Password'}
          </button>
        </>
      )}
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      <p className="modal-copy" style={{ marginBottom: 14 }}>
        Set a new password for <b>{user.name}</b> ({user.username}). They'll need it the next time they sign in.
      </p>
      <div className="form-field">
        <label>New Password</label>
        <input
          type="password" value={password} autoFocus autoComplete="new-password"
          placeholder="At least 8 characters" onChange={(e) => setPassword(e.target.value)}
        />
      </div>
    </ModalShell>
  );
}
