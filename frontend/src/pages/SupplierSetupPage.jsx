import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { api } from '../api/client';
import { authApi } from '../api/authApi';
import { logoutThunk } from '../features/bootstrap/hydrateThunks';
import AppHeader from '../components/login/AppHeader.jsx';
import BrandPanel from '../components/login/BrandPanel.jsx';
import FormField from '../components/login/FormField.jsx';
import PasswordField from '../components/login/PasswordField.jsx';
import { AlertIcon, HashIcon } from '../components/login/icons.jsx';
import './login.css';

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Opened from the link the team shared: the supplier confirms their PAN and chooses a password. */
export default function SupplierSetupPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [supplierName, setSupplierName] = useState('');
  const [linkError, setLinkError] = useState(token ? '' : 'This link is missing its token. Ask the team for a new link.');
  const [checking, setChecking] = useState(!!token);
  const [pan, setPan] = useState('');
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
      .then((res) => setSupplierName(res.name))
      .catch((err) => setLinkError(err.message))
      .finally(() => setChecking(false));
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    const panValue = pan.trim().toUpperCase();
    if (!PAN_PATTERN.test(panValue)) { setError('Enter your 10-character PAN, like ABCDE1234F.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setError('');
    setBusy(true);
    let passwordWasSet = setupComplete;
    try {
      if (!setupComplete) {
        setPhase('Setting up your account…');
        await authApi.completeSupplierSetup({ token, pan: panValue, password });
        // Keep this state so the supplier can continue to sign-in if needed.
        setSetupComplete(true);
        passwordWasSet = true;
      }
      // Clear any existing internal session so the login route can show the
      // supplier sign-in form instead of redirecting back into the staff app.
      if (api.hasToken()) await dispatch(logoutThunk());
      const params = new URLSearchParams({ mode: 'pan', pan: panValue, setup: 'complete' });
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
    <div className="lgn-page">
      <AppHeader />
      <div className="lgn-hero">
        <BrandPanel />
        <section className="lgn-hero-right">
          <div className="lgn-card">
            <div className="lgn-card-head">
              <p className="lgn-kicker">Supplier account</p>
              <h2>Set your password</h2>
              {supplierName && <p className="lgn-card-sub">Welcome, {supplierName}. Confirm your PAN and choose a password.</p>}
            </div>

            {checking && <div className="supplier-setup-progress" role="status"><span className="supplier-setup-spinner" />Checking your setup link…</div>}
            {linkError && <div className="lgn-alert error" role="alert"><AlertIcon /><span>{linkError}</span></div>}
            {error && <div className="lgn-alert error" role="alert"><AlertIcon /><span>{error}</span></div>}
            {busy && <div className="supplier-setup-progress" role="status"><span className="supplier-setup-spinner" />{phase}</div>}

            {!checking && !linkError && !busy && (
              <form className="lgn-form" onSubmit={submit} noValidate>
                <FormField
                  id="sp-pan" label="PAN" icon={<HashIcon className="lgn-ic" />}
                  type="text" autoComplete="off" placeholder="ABCDE1234F" maxLength={10}
                  value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())}
                />
                <PasswordField
                  id="sp-password" label="New password" value={password} onChange={setPassword}
                  visible={showPw} onToggleVisible={() => setShowPw((v) => !v)}
                  autoComplete="new-password" placeholder="At least 8 characters"
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
          </div>
        </section>
      </div>
    </div>
  );
}
