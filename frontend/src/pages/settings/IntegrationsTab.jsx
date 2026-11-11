import { useSelector } from 'react-redux';
import StatCard from '../../components/common/StatCard.jsx';
import ChannelAvailabilitySettings from '../../components/settings/ChannelAvailabilitySettings.jsx';
import InvoiceSyncPanel from '../../components/settings/InvoiceSyncPanel.jsx';
import { CheckCircle, Link2, Layers, AlertTriangle } from '../../components/common/icons.jsx';
import { useGetSyncStatusQuery } from '../../api/invoiceSyncApi';
import { useNotificationIdentity } from '../../features/notifications/useNotificationActions';

export default function IntegrationsTab() {
  const availability = useSelector((s) => s.settings.channelAvailability) || {};
  const identity = useNotificationIdentity();
  const { data: sync } = useGetSyncStatusQuery(identity, { skip: !identity });
  const sources = sync?.sources || [];
  const channelKeys = Object.keys(availability);
  const enabled = channelKeys.filter((k) => availability[k]).length;
  const healthy = sources.filter((s) => s.lastSyncOk).length;
  const failing = sources.length - healthy + (sync?.stale ? 1 : 0);
  return (
    <>
      <div className="kpi-grid set-kpis">
        <StatCard tone="shade-total" icon={<Layers size={16} />} label="Portals enabled" value={`${enabled} / ${channelKeys.length || 0}`} sub="Available at sign-in and in navigation" />
        <StatCard tone="shade-paid" icon={<Link2 size={16} />} label="Data sources healthy" value={`${healthy} / ${sources.length}`}
          sub={sync?.live === false ? 'Live sync is off (local files)' : 'Invoice data synced from BigQuery'} />
        <StatCard tone={failing ? 'shade-pending' : 'shade-approved'} icon={failing ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
          label="Needs attention" value={failing}
          sub={failing ? (sync?.stale ? 'Invoice data is out of date' : 'Sync errors to check') : 'Invoice data is up to date'} />
      </div>
      <InvoiceSyncPanel canRun />
      <div className="card set-card">
        <ChannelAvailabilitySettings />
      </div>
    </>
  );
}
