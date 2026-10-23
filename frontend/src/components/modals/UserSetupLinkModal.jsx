import { useEffect, useRef, useState } from 'react';
import ModalShell from './ModalShell.jsx';
import './UserSetupLinkModal.css';
import { formatLinkExpiry } from '../../utils/linkExpiry';
import { CheckCircle, Clock, Shield, Mail, Key, ChevronDown } from '../common/icons.jsx';

export default function UserSetupLinkModal({ user, setupLink, expiresAt, linkType, expiryMinutes, onClose }) {
  const [copyState, setCopyState] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const messageRef = useRef(null);
  const previewRef = useRef(null);
  const copyTimerRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const invite = linkType === 'invite';
  const hostname = new URL(setupLink).hostname;
  const localOnly = ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  const lanOnly = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
  const expiry = new Date(expiresAt);
  const minutes = Math.max(0, Math.ceil((expiry.getTime() - now) / 60000));
  const expired = minutes === 0;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const timeLeft = days ? `${days} ${days === 1 ? 'day' : 'days'}${hours ? ` ${hours}h` : ''}` : minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`;
  const message = `Hello ${user.name},\n\n${invite ? 'Your Invoice to Payment Tracker account is ready.' : 'You can reset your Invoice to Payment Tracker password.'}\nSign-in email: ${user.email}\n\n${invite ? 'Set' : 'Reset'} your password: ${setupLink}\n\nExpires: ${expiry.toLocaleString()}. This link works once.\nAfter setting your password, sign in with the email above.${lanOnly ? '\nConnect to the office network or VPN to open this link.' : ''}`;
  const initials = user.name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  const invitationMessage = message + (expiryMinutes != null ? `\nLink validity: ${formatLinkExpiry(expiryMinutes)}.` : '');

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => { clearInterval(timer); clearTimeout(copyTimerRef.current); };
  }, []);

  async function copy() {
    clearTimeout(copyTimerRef.current);
    setCopied(false);
    try {
      await navigator.clipboard.writeText(invitationMessage);
      setCopied(true);
      copyTimerRef.current = setTimeout(() => setCopied(false), 3000);
      setCopyState('Invitation copied with the sign-in email and password link.');
    } catch {
      if (previewRef.current) previewRef.current.open = true;
      messageRef.current?.focus();
      messageRef.current?.select();
      setCopyState('Select the invitation message and copy it manually. It includes the sign-in email and link.');
    }
  }

  return (
    <ModalShell className="user-setup-link-modal" title={<span className="user-setup-link-heading"><span className={`user-setup-link-success-icon${expired ? ' expired' : ''}`}><Shield size={24} /></span><span><span className="user-setup-link-eyebrow">Account access</span><span className="user-setup-link-title">{invite ? 'Password setup link ready' : 'Password reset link ready'}</span></span></span>} width={580} onClose={onClose}
      foot={<><span className="user-setup-link-footer-note"><Mail size={15} />No email sent</span><button type="button" className="btn" onClick={onClose}>Done</button></>}>
      <div className="user-setup-link">
        <p className="user-setup-link-intro">Share this invitation privately so {user.name.split(' ')[0]} can {invite ? 'set up their account' : 'choose a new password'}.</p>
        <div className="user-setup-link-account">
          <div className="user-setup-link-person"><span className="user-setup-link-avatar" aria-hidden="true">{initials}</span><div><strong>{user.name}</strong><span>{user.email}</span><small>Sign-in email</small></div></div>
          <div className={`user-setup-link-expiry${expired ? ' expired' : ''}`} role="timer"><span className="user-setup-link-expiry-label"><Clock size={14} />{expired ? 'Expired' : 'Valid for'}</span><strong>{expired ? 'Link expired' : timeLeft}</strong><span>{expiryMinutes != null ? formatLinkExpiry(expiryMinutes) : 'One-time access'}</span></div>
          <div className="user-setup-link-expiry-date">Expires {expiry.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} at {expiry.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
        </div>
        <section className="user-setup-link-share">
          <div className="user-setup-link-share-label"><label htmlFor="user-setup-link">One-time {invite ? 'setup' : 'reset'} link</label><span><Key size={12} />Single use</span></div>
          <div className="user-setup-link-url-wrap"><Key size={16} /><input id="user-setup-link" className="user-setup-link-url" readOnly value={setupLink} onFocus={(event) => event.target.select()} /></div>
          <button type="button" className={`btn primary user-setup-link-copy${copied ? ' user-setup-link-copied' : ''}`} disabled={expired} onClick={copy}>{copied ? <><CheckCircle size={18} /><span>✓ Copied</span></> : <><Mail size={18} />Copy invitation</>}</button>
          <p className="user-setup-link-copy-hint">Copies the sign-in email, password link and expiry together.</p>
          {copyState && <p role="status" className={`user-setup-link-copy-status${copied ? ' success' : ''}`}>{copyState}</p>}
        </section>
        <details ref={previewRef} className="user-setup-link-preview"><summary><Mail size={16} /><span>View invitation message</span><ChevronDown size={16} /></summary><div><label htmlFor="user-setup-message">Invitation message <span>Ready to share with {user.name.split(' ')[0]}</span></label><textarea ref={messageRef} id="user-setup-message" readOnly rows={6} value={invitationMessage} onFocus={(event) => event.target.select()} /></div></details>
        <div className="user-setup-link-notes"><p><Shield size={15} /><span>Works once. A new link replaces this one.</span></p>
          {localOnly && <p role="note"><span>Local demo only: this link works on this computer. Use a reachable address before sharing.</span></p>}
          {lanOnly && <p role="note"><span>LAN link: {user.name.split(' ')[0]} must be on the office network or VPN.</span></p>}
        </div>
        {expired && <p className="form-error">Generate a new link from the user's key icon.</p>}
      </div>
    </ModalShell>
  );
}
