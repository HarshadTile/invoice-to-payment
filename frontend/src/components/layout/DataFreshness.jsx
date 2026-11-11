import { SYNC_LIVE, useGetSyncStatusQuery } from '../../api/invoiceSyncApi';
import { useNotificationIdentity } from '../../features/notifications/useNotificationActions';
import { freshnessLabel } from '../../utils/syncStatus';
import { AlertTriangle, Clock } from '../common/icons.jsx';

/** "Data as of 6 Nov, 6:22 pm" in the top bar: amber when the automatic sync is failing or the
 *  data is older than the backend's stale limit. Hidden until the status is known. */
export default function DataFreshness() {
  const identity = useNotificationIdentity(); // keys the cache per signed-in person
  const { data } = useGetSyncStatusQuery(identity, { ...SYNC_LIVE, skip: !identity });
  const label = freshnessLabel(data);
  if (!label) return null;
  const Icon = label.tone === 'warn' ? AlertTriangle : Clock;
  return (
    <span className={`data-freshness is-${label.tone}`} title={label.title} role="status">
      <Icon size={13} aria-hidden="true" />
      <span>{label.text}</span>
    </span>
  );
}
