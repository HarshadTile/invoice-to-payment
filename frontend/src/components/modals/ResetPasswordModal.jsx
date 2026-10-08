import { useState } from 'react';
import ModalShell from './ModalShell.jsx';

/**
 * Confirms emailing this account a link to set a password — the admin triggering this
 * never sets or sees it themselves; only the account holder does, via that link.
 * For a still-pending ("Invited") account, this resends their original invite instead.
 */
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
      title={isInvite ? `Resend Invite: ${user.name}` : `Reset Password: ${user.name}`}
      width={440}
      foot={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn primary" onClick={send} disabled={busy}>
            {busy ? 'Sending…' : isInvite ? 'Resend Invite' : 'Send Reset Link'}
          </button>
        </>
      )}
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      {isInvite ? (
        <p className="modal-copy">
          Resend the invite to <b>{user.name}</b> at <b>{user.email}</b>? Their earlier invite link stops
          working and this new one takes over — they'll set their own password by following it.
        </p>
      ) : (
        <p className="modal-copy">
          Send a password reset link to <b>{user.name}</b> at <b>{user.email}</b>?
          They'll set their own new password by following the link — you won't see or choose it here.
        </p>
      )}
    </ModalShell>
  );
}
