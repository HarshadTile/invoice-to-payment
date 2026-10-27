import { useState } from 'react';
import ModalShell from './ModalShell.jsx';
import { useSelector } from 'react-redux';
import { formatLinkExpiry } from '../../utils/linkExpiry';

/**
 * Confirms generating a shareable link to set a password — the admin triggering this
 * never sets or sees it themselves; only the account holder does, via that link.
 * For a pending ("Invited") account, this replaces their setup link.
 */
export default function ResetPasswordModal({ user, onClose, onReset }) {
  const isInvite = user.status === 'Invited';
  const expiryMinutes = useSelector((state) => isInvite ? state.settings.inviteLinkExpiryMinutes : state.settings.resetLinkExpiryMinutes) ?? (isInvite ? 10080 : 1440);
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
      title={isInvite ? `New Setup Link: ${user.name}` : `Reset Password: ${user.name}`}
      width={440}
      onClose={busy ? () => {} : onClose}
      foot={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn primary" onClick={send} disabled={busy}>
            {busy ? 'Generating…' : 'Generate Link'}
          </button>
        </>
      )}
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      {isInvite ? (
        <p className="modal-copy">
          Generate a new setup link for <b>{user.name}</b> ({user.email})? Their earlier link will stop
          working. Copy and share the new link so they can set their password. It expires in {formatLinkExpiry(expiryMinutes)}.
        </p>
      ) : (
        <p className="modal-copy">
          Generate a password reset link for <b>{user.name}</b> ({user.email})?
          Copy and share it privately. It expires in {formatLinkExpiry(expiryMinutes)} and replaces earlier links. No email is sent.
        </p>
      )}
    </ModalShell>
  );
}
