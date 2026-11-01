import { useSelector } from 'react-redux';
import PasswordLinkExpirySettings from './PasswordLinkExpirySettings.jsx';
import { formatLinkExpiry } from '../../utils/linkExpiry';
import { ChevronRight, Clock } from '../common/icons.jsx';

/** One of five colour tones, always the same for the same name. */
export function nameTone(name) {
  let hash = 0;
  for (const ch of String(name || '')) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return hash % 5;
}

/** A person's (or company's, or role's) initials in a round tile; the colour follows the name.
 *  "Invoice Team L2" -> "L2": a trailing level reads better than the first letters. */
export function Avatar({ name, size = 'md' }) {
  const text = String(name || '?').trim();
  const level = /\b(L\d+)$/i.exec(text);
  const words = text.split(/[\s@._-]+/).filter(Boolean);
  const initials = level ? level[1] : (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2));
  return <span className={`set-avatar ${size} tone-${nameTone(name)}`} aria-hidden="true">{initials.toUpperCase()}</span>;
}

/** A few tags, then "+N more" (all of them in its tooltip), so long lists never widen the table. */
export function TagList({ items, max = 4, mono = true }) {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  return (
    <span className={`set-tags${mono ? ' mono' : ''}`}>
      {shown.map((item) => <span key={item} className="set-tag">{item}</span>)}
      {rest > 0 && <span className="set-tag more" title={items.join(', ')}>+{rest} more</span>}
    </span>
  );
}

/** The password link expiry form, folded into one line that shows the current values. */
export function ExpiryDisclosure({ accountType = 'internal' }) {
  const settings = useSelector((s) => s.settings);
  const supplier = accountType === 'supplier';
  const invite = settings[supplier ? 'supplierInviteLinkExpiryMinutes' : 'inviteLinkExpiryMinutes'] ?? 10080;
  const reset = settings[supplier ? 'supplierResetLinkExpiryMinutes' : 'resetLinkExpiryMinutes'] ?? 1440;
  return (
    <details className="set-disclosure">
      <summary>
        <span className="set-disclosure-ic" aria-hidden="true"><Clock size={15} /></span>
        <span className="set-disclosure-text">
          <b>Password link expiry</b>
          <small>New account {formatLinkExpiry(invite)} · Password reset {formatLinkExpiry(reset)}</small>
        </span>
        <span className="set-disclosure-action">Change<ChevronRight size={14} /></span>
      </summary>
      <PasswordLinkExpirySettings accountType={accountType} />
    </details>
  );
}
