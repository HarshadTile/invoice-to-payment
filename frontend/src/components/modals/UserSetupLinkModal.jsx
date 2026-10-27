import AccessLinkModal from './AccessLinkModal.jsx';
import { formatLinkExpiry } from '../../utils/linkExpiry';

export default function UserSetupLinkModal({ user, setupLink, expiresAt, linkType, expiryMinutes, onClose }) {
  const invite = linkType === 'invite';
  const expiry = new Date(expiresAt);
  let lan = false;
  try { lan = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(new URL(setupLink).hostname); } catch { /* No network hint for invalid URLs. */ }
  const message = `Hello ${user.name},\n\n${invite ? 'Your Invoice to Payment Tracker account is ready.' : 'You can reset your Invoice to Payment Tracker password.'}\nSign-in email: ${user.email}\n\n${invite ? 'Set' : 'Reset'} your password: ${setupLink}\n\nExpires: ${expiry.toLocaleString()}. This link works once.\nAfter setting your password, sign in with the email above.${lan ? '\nConnect to the office network or VPN to open this link.' : ''}${expiryMinutes != null ? `\nLink validity: ${formatLinkExpiry(expiryMinutes)}.` : ''}`;
  return <AccessLinkModal name={user.name} identity={user.email} identityLabel="Email" setupLink={setupLink} expiresAt={expiresAt} expiryMinutes={expiryMinutes ?? (invite ? 10080 : 1440)} linkType={linkType} message={message} onClose={onClose} />;
}
