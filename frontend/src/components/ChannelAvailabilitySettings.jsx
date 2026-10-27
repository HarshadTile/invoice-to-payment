import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { api } from '../api/client';
import { CHANNELS, DEFAULT_CHANNEL_AVAILABILITY } from '../data/constants';
import { hydrateSettings } from '../features/settings/settingsSlice';
import { setScopeFilter } from '../features/ui/uiSlice';
import './ChannelAvailabilitySettings.css';

export default function ChannelAvailabilitySettings() {
  const dispatch = useDispatch();
  const saved = useSelector((state) => state.settings.channelAvailability) ?? DEFAULT_CHANNEL_AVAILABILITY;
  const scopeChannel = useSelector((state) => state.ui.scope.channel);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function toggle(channel) {
    setBusy(true); setMessage(''); setError('');
    const channelAvailability = { ...saved, [channel.key]: !saved[channel.key] };
    try {
      await api.put('/v1/settings', { channelAvailability });
      dispatch(hydrateSettings({ channelAvailability }));
      if (channelAvailability[scopeChannel] === false) dispatch(setScopeFilter({ key: 'channel', value: '' }));
      setMessage(`${channel.label} ${channelAvailability[channel.key] ? 'enabled' : 'disabled'}.`);
    } catch (err) { setError(err.message || 'Unable to update portal availability.'); }
    finally { setBusy(false); }
  }

  return <section className="portal-availability" aria-labelledby="portal-availability-title">
    <h3 id="portal-availability-title">Portal Availability</h3>
    <p>Enable the channels available at login and in portal navigation. Existing account assignments and invoice data are retained.</p>
    <div className="portal-availability-grid">
      {CHANNELS.map((channel) => <div className="portal-availability-item" key={channel.key}>
        <div><strong>{channel.label}</strong><small>{saved[channel.key] ? 'Enabled' : 'Disabled'}</small></div>
        <button type="button" role="switch" aria-label={`Enable ${channel.label}`} aria-checked={!!saved[channel.key]} disabled={busy} className="portal-availability-switch" onClick={() => toggle(channel)}><span /></button>
      </div>)}
    </div>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </section>;
}
