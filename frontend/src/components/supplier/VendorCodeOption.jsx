import { useSelector } from 'react-redux';
import { CHANNEL_LABEL } from '../../data/constants';

/**
 * Which vendor codes this person may tick or untick. Admins: any. A channel team: codes in its
 * own channels (a code in both channels belongs to both teams) and codes the data doesn't know.
 * The server applies the same rule, so another team's codes are never changed by a save.
 * Returns code -> "Managed by the PO Portal team" for a code this person can't change, else null.
 */
export function useCodeOwner(codeChannels = {}) {
  const { role, channelScope, allowedChannels } = useSelector((s) => s.auth);
  if (role === 'Admin') return () => null;
  const mine = new Set([...(allowedChannels || []), ...(channelScope && channelScope !== 'all' ? [channelScope] : [])]);
  return (code) => {
    const channels = codeChannels[code] || [];
    if (!channels.length || channels.some((c) => mine.has(c))) return null;
    return `Managed by the ${channels.map((c) => CHANNEL_LABEL[c] || c).join(' / ')} team`;
  };
}

/** One vendor code with a tick box; another team's code is shown read-only with who manages it. */
export default function VendorCodeOption({ code, checked, onToggle, owner }) {
  return (
    <label className={`supplier-code-option${checked ? ' is-selected' : ''}${owner ? ' is-locked' : ''}`} title={owner || undefined}>
      <input type="checkbox" aria-label={code} checked={checked} disabled={!!owner} onChange={onToggle} />
      <span className="supplier-code-check" aria-hidden="true" />
      <span className="supplier-code-text">{code}</span>
      <span className="supplier-code-state">{owner || (checked ? 'Included' : 'Excluded')}</span>
    </label>
  );
}
