import { useState, useEffect } from 'react';
import { settingsApi } from '../api/settingsApi';
import { authApi } from '../api/authApi';
import { DEFAULT_CHANNEL_AVAILABILITY } from '../data/constants';
import { useDispatch } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { loginThunk } from '../features/bootstrap/hydrateThunks';
import { pushToast } from '../features/ui/uiSlice';
import { SESSION_MESSAGE_KEY } from '../api/client';
import AuthLayout from '../components/login/AuthLayout.jsx';
import SupportFooter from '../components/login/SupportFooter.jsx';
import AccountTypeSelector from '../components/login/AccountTypeSelector.jsx';
import WorkspaceSelector from '../components/login/WorkspaceSelector.jsx';
import FormField from '../components/login/FormField.jsx';
import PasswordField from '../components/login/PasswordField.jsx';
import PrimaryButton from '../components/login/PrimaryButton.jsx';
import { IdIcon, MailIcon, AlertIcon, CheckIcon } from '../components/login/icons.jsx';
import './login.css';

// Why single sign-on sent the person back here (?sso_error=… from the backend callback).
const SSO_ERRORS = {
  disabled: 'Single sign-on is not available right now. Sign in with your email and password.',
  state: 'The sign-in took too long or was started in another window. Please try again.',
  expired: 'The sign-in took too long. Please try again.',
  replay: 'That sign-in was already used. Please try again.',
  no_account: 'Your company account has no access to this portal yet. Ask an administrator to add you.',
  inactive: 'This account is not active. Contact an administrator.',
  locked: 'This account is locked after too many wrong passwords. Try again later.',
  busy: 'Too many sign-in attempts. Wait a few minutes and try again.',
};
const SSO_FAILED = 'Single sign-on could not confirm your identity. Please try again.';

export default function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const tab = searchParams.get('account') === 'internal' ? 'internal' : 'supplier';
  const setupComplete = tab === 'supplier' && searchParams.get('setup') === 'complete';
  const [status, setStatus] = useState('idle'); // idle | busy | success
  // Why the last session ended (signed out elsewhere, deactivated, access changed), shown once.
  const [error, setError] = useState(() => {
    const ssoError = searchParams.get('sso_error');
    if (ssoError) return SSO_ERRORS[ssoError] || SSO_FAILED;
    try {
      const reason = sessionStorage.getItem(SESSION_MESSAGE_KEY) || '';
      sessionStorage.removeItem(SESSION_MESSAGE_KEY);
      return reason;
    } catch { return ''; }
  });
  const [fieldErr, setFieldErr] = useState({});
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);

  const [channelScope, setChannelScope] = useState('all');
  const [availability, setAvailability] = useState(DEFAULT_CHANNEL_AVAILABILITY);
  useEffect(() => {
    let stale = false;
    settingsApi.portalAvailability().then((data) => {
      if (!stale && data.channelAvailability) {
        setAvailability(data.channelAvailability);
        setChannelScope((current) => data.channelAvailability[current] === false ? 'all' : current);
      }
    }).catch(() => { if (!stale) setError('Unable to load portal options. Refresh the page to try again.'); });
    return () => { stale = true; };
  }, [tab]);
  // The SSO button shows only when the backend has single sign-on switched on and configured.
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoLeaving, setSsoLeaving] = useState(false);
  useEffect(() => {
    if (tab !== 'internal') return undefined;
    let stale = false;
    authApi.ssoStatus().then((data) => { if (!stale) setSsoEnabled(!!data?.enabled); }).catch(() => {});
    return () => { stale = true; };
  }, [tab]);
  useEffect(() => {
    // Coming "Back" from the CC Services page restores this page from the browser cache.
    const reset = () => setSsoLeaving(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  function startSso() {
    setError('');
    setSsoLeaving(true);
    window.location.assign(authApi.ssoLoginUrl({ scope: channelScope, remember }));
  }

  const [empId, setEmpId] = useState('');
  const [supplierEmail, setSupplierEmail] = useState(searchParams.get('email') || '');
  const [password, setPassword] = useState('');

  const busy = status === 'busy';
  const done = status === 'success';

  async function runLogin(form, dest) {
    setError('');
    setStatus('busy');
    try {
      await dispatch(loginThunk(form, { remember }));
      setStatus('success');
      dispatch(pushToast('Signed in.'));
      navigate(dest);
    } catch (err) {
      setStatus('idle');
      if (err.status === 401) {
        setError(form.mode === 'supplierPassword'
          ? 'Email or password is incorrect, or the account is inactive.'
          : 'Invalid email or password.');
      } else {
        setError(err.message || 'Something went wrong. Please try again.');
      }
    }
  }

  function submitInternal(e) {
    e.preventDefault();
    const fe = {};
    if (!empId.trim()) fe.empId = 'Enter your email address.';
    if (!password) fe.password = 'Enter your password.';
    setFieldErr(fe);
    if (Object.keys(fe).length) return;
    runLogin({ mode: 'internal', username: empId.trim(), password, channelScope }, '/app/invoices');
  }


  async function submitSupplier(e) {
    e.preventDefault();
    const fe = {};
    if (!supplierEmail.trim()) fe.email = 'Enter your email address.';
    if (!password) fe.password = 'Enter your password.';
    setFieldErr(fe);
    if (Object.keys(fe).length) return;
    runLogin({ mode: 'supplierPassword', email: supplierEmail.trim().toLowerCase(), password }, '/supplier/dashboard');
  }


  function selectAccountType(nextTab) {
    setError('');
    setFieldErr({});
    setPassword('');
    navigate(`/login?account=${nextTab}`, { replace: true });
  }

  const forgotLink = (
    <button type="button" className="lgn-link" onClick={() => navigate(tab === 'supplier' ? '/forgot-password?account=supplier' : '/forgot-password')}>
      Forgot password?
    </button>
  );

  const passwordField = (
    <PasswordField
      value={password}
      onChange={setPassword}
      error={fieldErr.password}
      visible={showPw}
      onToggleVisible={() => setShowPw((v) => !v)}
      labelAction={forgotLink}
      placeholder={tab === 'supplier' ? 'Enter your supplier password' : 'Enter your Mahindra password'}
    />
  );

  const rememberRow = (
    <label className="lgn-remember">
      <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
      Remember me on this device
    </label>
  );

  const alerts = (
    <>
      {error && (
        <div className="lgn-alert error" role="alert">
          <AlertIcon /><span>{error}</span>
        </div>
      )}
      {setupComplete && !error && (
        <div className="lgn-alert success" role="status">
          <CheckIcon /><span>Your password is set. Sign in with your email and password.</span>
        </div>
      )}
      {done && (
        <div className="lgn-alert success" role="status">
          <CheckIcon /><span>Signed in — taking you to your workspace…</span>
        </div>
      )}
    </>
  );

  return (
    <AuthLayout
      kicker="Welcome back"
      title="Sign in to Invoice to Payment Tracker"
      subtitle="Sign in to continue."
      footer={<SupportFooter />}
    >
      <AccountTypeSelector value={tab} onChange={selectAccountType} />
      {alerts}

      {tab === 'internal' ? (
        <form className="lgn-form" onSubmit={submitInternal} noValidate>
          <WorkspaceSelector value={channelScope} onChange={setChannelScope} availability={availability} />
          <FormField
            id="lgn-empid"
            label="Enter Email ID"
            icon={<IdIcon className="lgn-ic" />}
            error={fieldErr.empId}
            type="text"
            autoComplete="username"
            placeholder="name@mahindra.com"
            value={empId}
            onChange={(e) => setEmpId(e.target.value)}
          />
          {passwordField}
          {rememberRow}
          <PrimaryButton loading={busy} done={done} />
          {ssoEnabled && (
            <>
              <div className="lgn-divider">or</div>
              <button type="button" className="lgn-sso" onClick={startSso} disabled={busy || done || ssoLeaving}>
                {ssoLeaving ? 'Opening company sign-in…' : 'Sign in with company account (SSO)'}
              </button>
            </>
          )}
        </form>
      ) : (
        <form className="lgn-form" onSubmit={submitSupplier} noValidate>
          <div className="lgn-supplier-note">
            <strong>Supplier portal</strong>
            <span>Sign in with the email your supplier account was set up with.</span>
          </div>
          <FormField
            id="lgn-supplier-email"
            label="Email"
            icon={<MailIcon className="lgn-ic" />}
            error={fieldErr.email}
            type="email"
            autoComplete="username"
            placeholder="you@company.com"
            value={supplierEmail}
            onChange={(e) => setSupplierEmail(e.target.value)}
          />
          {passwordField}
          {rememberRow}
          <PrimaryButton loading={busy} done={done} />
          <div className="lgn-register">
            <span>New supplier, or no account yet?</span>
            <button type="button" className="lgn-link" onClick={() => navigate('/supplier/request-access')}>Request an account</button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
