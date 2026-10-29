import { useState } from 'react';
import ModalShell from './ModalShell.jsx';

/** Confirms sending an account setup or password reset email. */
export default function ResetPasswordModal({ user, onClose, onReset }) {
  const isInvite = user.status === 'Invited';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    setError('');
    setBusy(true);
    try {
      await onReset();
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title={isInvite ? `Email Setup Instructions: ${user.name}` : `Email Password Reset: ${user.name}`}
      width={440}
      onClose={busy ? () => {} : onClose}
      foot={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn primary" onClick={send} disabled={busy}>
            {busy ? 'Sending…' : 'Send Email'}
          </button>
        </>
      )}
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      {isInvite ? (
        <p className="modal-copy">Send <b>{user.name}</b> ({user.email}) a new account setup email? Any earlier setup link will stop working.</p>
      ) : (
        <p className="modal-copy">Send a password reset email to <b>{user.name}</b> ({user.email})? Any earlier reset link will stop working.</p>
      )}
    </ModalShell>
  );
}
