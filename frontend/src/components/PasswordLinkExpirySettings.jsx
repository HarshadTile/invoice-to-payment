import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { api } from '../api/client';
import { hydrateSettings } from '../features/settings/settingsSlice';
import { LINK_EXPIRY_OPTIONS } from '../utils/linkExpiry';
import { Clock, Shield, CheckCircle } from './common/icons.jsx';
import './PasswordLinkExpirySettings.css';

export default function PasswordLinkExpirySettings({ accountType = 'internal' }) {
  const dispatch = useDispatch();
  const saved = useSelector((state) => state.settings);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const supplier = accountType === 'supplier';
  const inviteField = supplier ? 'supplierInviteLinkExpiryMinutes' : 'inviteLinkExpiryMinutes';
  const resetField = supplier ? 'supplierResetLinkExpiryMinutes' : 'resetLinkExpiryMinutes';
  const values = {
    [inviteField]: draft[inviteField] ?? saved[inviteField] ?? 10080,
    [resetField]: draft[resetField] ?? saved[resetField] ?? 1440,
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
    <div className="link-expiry-heading"><span className="link-expiry-icon"><Shield size={21} /></span><div><h3>Password Link Expiry</h3><p>{supplier ? 'Set the time available for suppliers to create or reset a password.' : 'Set the time available to create or reset a password.'}</p></div><span className="link-expiry-limit"><Clock size={13} />Up to 7 days</span></div>
    <div className="link-expiry-controls">
      {[
        [inviteField, 'New account setup', supplier ? 'For newly invited suppliers' : 'For newly invited users'], [resetField, 'Password reset', 'For existing accounts'],
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
