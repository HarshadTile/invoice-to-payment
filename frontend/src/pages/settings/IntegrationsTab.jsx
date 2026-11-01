import { useSelector } from 'react-redux';
import Badge from '../../components/common/Badge.jsx';
import StatCard from '../../components/common/StatCard.jsx';
import ChannelAvailabilitySettings from '../../components/settings/ChannelAvailabilitySettings.jsx';
import { CheckCircle, Link2, Layers, AlertTriangle, Database } from '../../components/common/icons.jsx';

export default function IntegrationsTab() {
  const rows = useSelector((s) => s.settings.integrations);
  const availability = useSelector((s) => s.settings.channelAvailability) || {};
  const channelKeys = Object.keys(availability);
  const enabled = channelKeys.filter((k) => availability[k]).length;
  const connected = rows.filter((r) => r[1] === 'Connected').length;
  const failing = rows.length - connected;
  return (
    <>
      <div className="kpi-grid set-kpis">
        <StatCard tone="shade-total" icon={<Layers size={16} />} label="Portals enabled" value={`${enabled} / ${channelKeys.length || 0}`} sub="Available at sign-in and in navigation" />
        <StatCard tone="shade-paid" icon={<Link2 size={16} />} label="Integrations connected" value={`${connected} / ${rows.length}`} sub="Source systems feeding invoice data" />
        <StatCard tone={failing ? 'shade-pending' : 'shade-approved'} icon={failing ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
          label="Needs attention" value={failing} sub={failing ? 'Connection errors to check' : 'Every integration is healthy'} />
      </div>
      <div className="card set-card">
        <ChannelAvailabilitySettings />
      </div>
      <div className="card set-card">
        <div className="set-card-head">
          <span className="set-card-ic" aria-hidden="true"><Database size={16} /></span>
          <div><h3>Data integrations</h3><p>The systems invoice and payment data is synced from.</p></div>
        </div>
        {rows.length ? (
          <ul className="set-integrations">
            {rows.map((r) => {
              const ok = r[1] === 'Connected';
              return (
                <li key={r[0]} className={ok ? 'ok' : 'bad'}>
                  <span className="set-int-ic" aria-hidden="true">{ok ? <Link2 size={16} /> : <AlertTriangle size={16} />}</span>
                  <span className="set-int-name"><b>{r[0]}</b><small>Last synced {r[2] || '—'}</small></span>
                  <Badge tone={ok ? 'green' : 'red'}><span className="set-dot" aria-hidden="true" />{r[1]}</Badge>
                </li>
              );
            })}
          </ul>
        ) : <p className="chart-empty">No integration status data available.</p>}
      </div>
    </>
  );
}
