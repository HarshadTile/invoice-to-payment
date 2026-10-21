import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { api } from '../api/client';
import { hydrateSettings } from '../features/settings/settingsSlice';
import { LINK_EXPIRY_OPTIONS } from '../utils/linkExpiry';
import { Clock, Shield, CheckCircle } from './common/icons.jsx';
import './PasswordLinkExpirySettings.css';

export default function PasswordLinkExpirySettings() {
  const dispatch = useDispatch();
  const saved = useSelector((state) => state.settings);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const values = {
    inviteLinkExpiryMinutes: draft.inviteLinkExpiryMinutes ?? saved.inviteLinkExpiryMinutes ?? 10080,
    resetLinkExpiryMinutes: draft.resetLinkExpiryMinutes ?? saved.resetLinkExpiryMinutes ?? 1440,
  };
  async function save(event) {
    event.preventDefault();
    setBusy(true); setMessage(''); setError('');
    try {
      await api.put('/v1/settings', values);
      dispatch(hydrateSettings(values));
      setDraft({});
      setMessage('Password link expiry saved. Applies to newly generated links.');
    } catch (err) { setError(err.message || 'Unable to save settings.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className="link-expiry-settings">
    <div className="link-expiry-heading"><span className="link-expiry-icon"><Shield size={21} /></span><div><h3>Password Link Expiry</h3><p>Set the time available to create or reset a password.</p></div><span className="link-expiry-limit"><Clock size={13} />Up to 7 days</span></div>
    <div className="link-expiry-controls">
      {[
        ['inviteLinkExpiryMinutes', 'New account setup', 'For newly invited users'], ['resetLinkExpiryMinutes', 'Password reset', 'For existing accounts'],
      ].map(([field, label, hint]) => <div className="link-expiry-field" key={field}>
        <label htmlFor={field}>{label}</label>
        <select id={field} aria-describedby={`${field}-hint`} value={values[field]} disabled={busy} onChange={(event) => { setDraft((prev) => ({ ...prev, [field]: Number(event.target.value) })); setMessage(''); setError(''); }}>
          {LINK_EXPIRY_OPTIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
        <small id={`${field}-hint`}>{hint}</small>
      </div>)}
      <div className="link-expiry-save"><button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving...' : 'Save expiry settings'}</button></div>
    </div>
    <p className="link-expiry-note">Applies to new links only. Existing links keep their original expiry.</p>
    {message && <p role="status" className="link-expiry-saved"><CheckCircle size={16} />{message}</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </form>;
}
