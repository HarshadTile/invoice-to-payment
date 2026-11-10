import { useState, useEffect } from 'react';
import { settingsApi } from '../api/settingsApi';
import { DEFAULT_CHANNEL_AVAILABILITY } from '../data/constants';
import { useDispatch } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { loginThunk } from '../features/bootstrap/hydrateThunks';
import { pushToast } from '../features/ui/uiSlice';
import AuthLayout from '../components/login/AuthLayout.jsx';
import SupportFooter from '../components/login/SupportFooter.jsx';
import AccountTypeSelector from '../components/login/AccountTypeSelector.jsx';
import WorkspaceSelector from '../components/login/WorkspaceSelector.jsx';
import FormField from '../components/login/FormField.jsx';
import PasswordField from '../components/login/PasswordField.jsx';
import PrimaryButton from '../components/login/PrimaryButton.jsx';
import { IdIcon, MailIcon, AlertIcon, CheckIcon } from '../components/login/icons.jsx';
import './login.css';

export default function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const tab = searchParams.get('account') === 'internal' ? 'internal' : 'supplier';
  const setupComplete = tab === 'supplier' && searchParams.get('setup') === 'complete';
  const [status, setStatus] = useState('idle'); // idle | busy | success
  const [error, setError] = useState('');
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
        setError(form.mode === 'supplier'
          ? 'Invalid vendor code.'
          : form.mode === 'supplierPassword'
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


  const notify = (msg) => dispatch(pushToast(msg));

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
