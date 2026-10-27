import { useEffect, useId, useRef, useState } from 'react';
import ModalShell from './ModalShell.jsx';
import { Clock, Shield, Mail, Key, ChevronDown, CheckCircle } from '../common/icons.jsx';
import { formatLinkExpiry } from '../../utils/linkExpiry';
import './AccessLinkModal.css';

/** Shared presentation and copy behavior for internal-user and supplier password links. */
export default function AccessLinkModal({ name, identity, identityLabel, setupLink, expiresAt, expiryMinutes, linkType, message, messageLabel = 'Invitation message', onClose }) {
  const id = useId();
  const previewRef = useRef(null);
  const messageRef = useRef(null);
  const copyTimer = useRef(null);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [now, setNow] = useState(Date.now);
  const expiryTime = expiresAt ? new Date(expiresAt).getTime() : NaN;
  const expired = Number.isFinite(expiryTime) && expiryTime <= now;
  const invite = linkType !== 'reset';
  const expiryDate = Number.isFinite(expiryTime) ? new Date(expiryTime).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }) : '';
  let hostname = '';
  try { hostname = new URL(setupLink).hostname; } catch { /* The link remains selectable. */ }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  const lan = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
  const initials = name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => { clearInterval(timer); clearTimeout(copyTimer.current); };
  }, []);

  async function copy() {
    clearTimeout(copyTimer.current);
    setCopied(false);
    setFeedback('');
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setFeedback('Invitation copied.');
      copyTimer.current = setTimeout(() => { setCopied(false); setFeedback(''); }, 3000);
    } catch {
      if (previewRef.current) previewRef.current.open = true;
      messageRef.current?.focus();
      messageRef.current?.select();
      setFeedback('Select the invitation message and copy it manually.');
    }
  }

  return <ModalShell className="access-link-modal" width={480} onClose={onClose}
    title={<span className="access-link-heading"><span className="access-link-icon"><Shield size={19} /></span>{invite ? 'Setup link ready' : 'Password reset link ready'}</span>}
    foot={<><span className="access-link-policy"><Shield size={13} /><span>Single use · New link replaces previous link</span></span><button type="button" className="btn" onClick={onClose}>Done</button></>}>
    <div className="access-link-account"><span className="access-link-avatar" aria-hidden="true">{initials}</span><div><strong>{name}</strong><span><span className="access-link-identity-label">{identityLabel}</span> {identity}</span></div></div>
    <div className={`access-link-expiry${expired ? ' expired' : ''}`} role="timer"><Clock size={14} /><span>{expired ? 'Link expired' : `Valid for ${formatLinkExpiry(expiryMinutes)}`}{expiryDate && <> · Expires {expiryDate}</>}</span></div>
    <div className="access-link-field"><label htmlFor={`${id}-url`}>One-time {invite ? 'setup' : 'reset'} link</label><div className="access-link-url-wrap"><Key size={15} /><input id={`${id}-url`} readOnly value={setupLink} onFocus={(event) => event.target.select()} /></div></div>
    <button type="button" aria-label={copied ? '✓ Copied' : 'Copy invitation'} className={`btn primary access-link-copy${copied ? ' access-link-copied' : ''}`} disabled={expired} onClick={copy}>{copied ? <><CheckCircle size={16} /><span>Copied</span></> : <><Mail size={16} /><span>Copy invitation</span></>}</button>
    {feedback && <p role="status" className={`access-link-feedback${copied ? ' success' : ''}`}>{feedback}</p>}
    <details ref={previewRef} className="access-link-preview"><summary><Mail size={14} /><span>Preview message</span><ChevronDown size={14} /></summary><label htmlFor={`${id}-message`}>{messageLabel}</label><textarea ref={messageRef} id={`${id}-message`} readOnly rows={5} value={message} onFocus={(event) => event.target.select()} /></details>
    {local && <p role="note" className="access-link-network">Local demo only: this link opens on this computer.</p>}
    {lan && <p role="note" className="access-link-network">LAN link: office network or VPN required.</p>}
    {expired && <p className="form-error">Generate a new link from the account's key icon.</p>}
  </ModalShell>;
}
