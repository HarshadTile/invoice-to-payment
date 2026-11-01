import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../components/login/AuthLayout.jsx';
import FormField from '../components/login/FormField.jsx';
import { AlertIcon, BuildingIcon, CheckIcon, HashIcon, MailIcon } from '../components/login/icons.jsx';
import { authApi } from '../api/authApi.js';
import './login.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** "ABC1, abc2  DEF3" -> ['ABC1', 'abc2', 'DEF3'] (trimmed, no repeats). */
export function splitCodes(text) {
  const seen = new Set();
  return String(text || '').split(/[,;\s]+/).map((c) => c.trim()).filter((c) => {
    if (!c || seen.has(c.toLowerCase())) return false;
    seen.add(c.toLowerCase());
    return true;
  });
}

/**
 * Public page: a supplier without an account asks for one. The Mahindra team reviews the
 * request in Supplier Management and the supplier hears back by email either way.
 */
export default function SupplierRequestPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', pan: '', codes: '', note: '' });
  const [fieldErr, setFieldErr] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: key === 'pan' ? e.target.value.toUpperCase() : e.target.value }));
  const codes = splitCodes(form.codes);

  async function submit(e) {
    e.preventDefault();
    const fe = {};
    if (!form.name.trim()) fe.name = 'Enter your company name.';
    if (!EMAIL_PATTERN.test(form.email.trim())) fe.email = 'Enter a valid email address.';
    if (!PAN_PATTERN.test(form.pan.trim())) fe.pan = 'Enter your 10-character PAN, like ABCDE1234F.';
    if (!codes.length) fe.codes = 'Enter at least one vendor code.';
    setFieldErr(fe);
    if (Object.keys(fe).length) return;
    setError('');
    setBusy(true);
    try {
      await authApi.submitSupplierRequest({
        name: form.name.trim(), email: form.email.trim(), pan: form.pan.trim(),
        vendorCodes: codes, note: form.note.trim() || null,
      });
      setSentTo(form.email.trim());
    } catch (err) {
      setError(err.message || 'Could not send your request. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      kicker="Supplier portal"
      title="Request an account"
      subtitle="Tell us who you are and which vendor codes you supply under."
      cardClassName="lgn-request-card"
      outside={sentTo && (
        <div className="lgn-dialog-backdrop">
          <div className="lgn-dialog" role="dialog" aria-modal="true" aria-labelledby="req-done-title">
            <span className="lgn-dialog-ic" aria-hidden="true"><CheckIcon /></span>
            <h3 id="req-done-title">Request submitted</h3>
            <p>Thank you. The Mahindra team will review your request, and you'll receive an email at <b>{sentTo}</b> with the next step.</p>
            <button type="button" className="lgn-submit" onClick={() => navigate('/login?account=supplier')}>Back to sign in</button>
          </div>
        </div>
      )}
    >
      {error && <div className="lgn-alert error" role="alert"><AlertIcon /><span>{error}</span></div>}
      <form className="lgn-form" onSubmit={submit} noValidate>
        <p className="lgn-form-section">Your details</p>
        <FormField id="req-name" label="Company" icon={<BuildingIcon className="lgn-ic" />}
          error={fieldErr.name} autoComplete="organization" placeholder="e.g. Acme Tools"
          value={form.name} onChange={set('name')} maxLength={255} />
        <FormField id="req-email" label="Email" icon={<MailIcon className="lgn-ic" />}
          error={fieldErr.email} type="email" autoComplete="email" placeholder="you@company.com"
          value={form.email} onChange={set('email')} />
        <p className="lgn-form-hint">Your email becomes your sign-in. Each account needs its own email.</p>
        <p className="lgn-form-section">Vendor details</p>
        <FormField id="req-pan" label="PAN" icon={<HashIcon className="lgn-ic" />}
          error={fieldErr.pan} placeholder="ABCDE1234F" maxLength={10}
          value={form.pan} onChange={set('pan')} />
        <div className="lgn-field">
          <div className="lgn-label-row"><label htmlFor="req-codes">Vendor codes</label></div>
          <textarea id="req-codes" className="lgn-textarea" rows={2} placeholder="Separate with commas, e.g. DIE00131AA, DIM00505AA"
            aria-invalid={fieldErr.codes ? true : undefined} value={form.codes} onChange={set('codes')} />
          {codes.length > 0 && (
            <div className="lgn-code-chips" aria-label="Vendor codes entered">
              {codes.map((c) => <span key={c}>{c}</span>)}
              <small>{codes.length} code{codes.length === 1 ? '' : 's'}</small>
            </div>
          )}
          <span className="lgn-field-msg" aria-hidden={fieldErr.codes ? undefined : true}>{fieldErr.codes || ' '}</span>
        </div>
        <div className="lgn-field">
          <div className="lgn-label-row"><label htmlFor="req-note">Note <span className="lgn-optional">(optional)</span></label></div>
          <textarea id="req-note" className="lgn-textarea" rows={2} maxLength={1000}
            placeholder="If you're unsure about something, mention it here"
            value={form.note} onChange={set('note')} />
        </div>
        <button type="submit" className="lgn-submit" disabled={busy}>{busy ? 'Sending…' : 'Submit request'}</button>
        <div className="lgn-register">
          <span>Already have an account?</span>
          <button type="button" className="lgn-link" onClick={() => navigate('/login?account=supplier')}>Sign in</button>
        </div>
      </form>
    </AuthLayout>
  );
}
