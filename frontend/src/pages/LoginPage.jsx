import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { DEFAULT_CHANNEL_AVAILABILITY } from '../data/constants';
import { useDispatch } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { loginThunk } from '../features/bootstrap/hydrateThunks';
import { pushToast } from '../features/ui/uiSlice';
import AppHeader from '../components/login/AppHeader.jsx';
import BrandPanel from '../components/login/BrandPanel.jsx';
import AuthCard from '../components/login/AuthCard.jsx';
import AccountTypeSelector from '../components/login/AccountTypeSelector.jsx';
import WorkspaceSelector from '../components/login/WorkspaceSelector.jsx';
import FormField from '../components/login/FormField.jsx';
import PasswordField from '../components/login/PasswordField.jsx';
import PrimaryButton from '../components/login/PrimaryButton.jsx';
import { IdIcon, AlertIcon, CheckIcon } from '../components/login/icons.jsx';
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
    api.get('/v1/auth/portal-availability').then((data) => {
      if (!stale && data.channelAvailability) {
        setAvailability(data.channelAvailability);
        setChannelScope((current) => data.channelAvailability[current] === false ? 'all' : current);
      }
    }).catch(() => { if (!stale) setError('Unable to load portal options. Refresh the page to try again.'); });
    return () => { stale = true; };
  }, [tab]);
  const [empId, setEmpId] = useState('');
  const [pan, setPan] = useState(searchParams.get('pan') || '');
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
            ? 'PAN or password is incorrect, or the account is inactive.'
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
    if (!pan.trim()) fe.pan = 'Enter your PAN.';
    if (!password) fe.password = 'Enter your password.';
    setFieldErr(fe);
    if (Object.keys(fe).length) return;
    runLogin({ mode: 'supplierPassword', pan: pan.trim().toUpperCase(), password }, '/supplier/dashboard');
  }


  const notify = (msg) => dispatch(pushToast(msg));

  function selectAccountType(nextTab) {
    setError('');
    setFieldErr({});
    setPassword('');
    navigate(`/login?account=${nextTab}`, { replace: true });
  }

  const forgotLink = (
    <button type="button" className="lgn-link" onClick={() => navigate('/forgot-password')}>
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
          <CheckIcon /><span>Your password is set. Sign in with your PAN and password.</span>
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
    <div className="lgn-page">
      <AppHeader />

      <div className="lgn-hero">
        <BrandPanel />

        <section className="lgn-hero-right">
          <AuthCard>
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
                  <span>Use the PAN registered to your supplier account.</span>
                </div>
                <FormField
                  id="lgn-pan"
                  label="PAN"
                  icon={<IdIcon className="lgn-ic" />}
                  error={fieldErr.pan}
                  type="text"
                  autoComplete="username"
                  placeholder="e.g. ABCDE1234F"
                  maxLength={10}
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                />
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  error={fieldErr.password}
                  visible={showPw}
                  onToggleVisible={() => setShowPw((v) => !v)}
                  placeholder="Enter your supplier password"
                />
                {rememberRow}
                <PrimaryButton loading={busy} done={done} />
              </form>
            )}
          </AuthCard>
        </section>
      </div>
    </div>
  );
}
