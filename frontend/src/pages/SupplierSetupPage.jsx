import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { api } from '../api/client';
import { authApi } from '../api/authApi';
import { PASSWORD_HINT, passwordProblem } from '../utils/passwordRules';
import { logoutThunk } from '../features/bootstrap/hydrateThunks';
import AuthLayout from '../components/login/AuthLayout.jsx';
import FormField from '../components/login/FormField.jsx';
import PasswordField from '../components/login/PasswordField.jsx';
import { AlertIcon, MailIcon } from '../components/login/icons.jsx';
import './login.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Opened from the emailed setup / reset link: the supplier confirms their email and chooses a password. */
export default function SupplierSetupPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [supplierName, setSupplierName] = useState('');
  const [linkError, setLinkError] = useState(token ? '' : 'This link is missing its token. Ask the team for a new link.');
  const [checking, setChecking] = useState(!!token);
  const [email, setEmail] = useState('');
  const [reset, setReset] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [phase, setPhase] = useState('');

  useEffect(() => {
    if (!token) return;
    authApi.checkSetupLink(token)
      .then((res) => { setSupplierName(res.name); setReset(res.linkType === 'reset'); })
      .catch((err) => setLinkError(err.message))
      .finally(() => setChecking(false));
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    const emailValue = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(emailValue)) { setError('Enter the email address this link was sent to.'); return; }
    const weak = passwordProblem(password);
    if (weak) { setError(weak); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setError('');
    setBusy(true);
    let passwordWasSet = setupComplete;
    try {
      if (!setupComplete) {
        setPhase('Setting up your account…');
        await authApi.completeSupplierSetup({ token, email: emailValue, password });
        // Keep this state so the supplier can continue to sign-in if needed.
        setSetupComplete(true);
        passwordWasSet = true;
      }
      // Clear any existing internal session so the login route can show the
      // supplier sign-in form instead of redirecting back into the staff app.
      if (api.hasToken()) await dispatch(logoutThunk());
      const params = new URLSearchParams({ email: emailValue, setup: 'complete' });
      params.set('account', 'supplier');
      navigate(`/login?${params.toString()}`, { replace: true });
    } catch (err) {
      setBusy(false);
      setPhase('');
      setError(passwordWasSet
        ? 'Your password is set. Continue to the supplier sign-in page to log in.'
        : (err.message || 'Something went wrong. Please try again.'));
    }
  }

  return (
    <AuthLayout
      kicker="Supplier account"
      title={reset ? 'Choose a new password' : 'Set your password'}
      subtitle={supplierName && <>Welcome, {supplierName}. Confirm your email and choose a password.</>}
    >

      {checking && <div className="supplier-setup-progress" role="status"><span className="supplier-setup-spinner" />Checking your setup link…</div>}
      {linkError && <div className="lgn-alert error" role="alert"><AlertIcon /><span>{linkError}</span></div>}
      {error && <div className="lgn-alert error" role="alert"><AlertIcon /><span>{error}</span></div>}
      {busy && <div className="supplier-setup-progress" role="status"><span className="supplier-setup-spinner" />{phase}</div>}

      {!checking && !linkError && !busy && (
        <form className="lgn-form" onSubmit={submit} noValidate>
          <FormField
            id="sp-email" label="Email" icon={<MailIcon className="lgn-ic" />}
            type="email" autoComplete="username" placeholder="The email this link was sent to"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
          <PasswordField
            id="sp-password" label="New password" value={password} onChange={setPassword}
            visible={showPw} onToggleVisible={() => setShowPw((v) => !v)}
            autoComplete="new-password" placeholder="At least 12 characters" note={PASSWORD_HINT}
          />
          <PasswordField
            id="sp-confirm" label="Confirm password" value={confirm} onChange={setConfirm}
            visible={showPw} onToggleVisible={() => setShowPw((v) => !v)}
            autoComplete="new-password" placeholder="Re-enter the password above"
          />
          <button type="submit" className="lgn-submit" disabled={busy}>
            {setupComplete ? 'Continue to supplier sign in' : 'Set password and continue'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
