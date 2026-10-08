import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { loginThunk } from '../features/bootstrap/hydrateThunks';
import { pushToast } from '../features/ui/uiSlice';
import { supplierForVendorCode } from '../utils/businessLogic';
import AppHeader from '../components/login/AppHeader.jsx';
import BrandPanel from '../components/login/BrandPanel.jsx';
import AuthCard from '../components/login/AuthCard.jsx';
import AccountTypeSelector from '../components/login/AccountTypeSelector.jsx';
import WorkspaceSelector from '../components/login/WorkspaceSelector.jsx';
import FormField from '../components/login/FormField.jsx';
import PasswordField from '../components/login/PasswordField.jsx';
import PrimaryButton from '../components/login/PrimaryButton.jsx';
import { IdIcon, HashIcon, AlertIcon, CheckIcon } from '../components/login/icons.jsx';
import './login.css';

export default function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [tab, setTab] = useState('internal');
  const [status, setStatus] = useState('idle'); // idle | busy | success
  const [error, setError] = useState('');
  const [fieldErr, setFieldErr] = useState({});
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);

  const [channelScope, setChannelScope] = useState('all');
  const [empId, setEmpId] = useState('');
  const [vcode, setVcode] = useState('');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [password, setPassword] = useState('');

  const busy = status === 'busy';
  const done = status === 'success';

  function switchTab(next) {
    if (next === tab) return;
    setTab(next);
    setError('');
    setFieldErr({});
    setPassword('');
    setShowPw(false);
  }

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
          : 'Invalid EAML / Employee ID or password.');
      } else {
        setError(err.message || 'Something went wrong. Please try again.');
      }
    }
  }

  function submitInternal(e) {
    e.preventDefault();
    const fe = {};
    if (!empId.trim()) fe.empId = 'Enter your EAML / Employee ID.';
    if (!password) fe.password = 'Enter your password.';
    setFieldErr(fe);
    if (Object.keys(fe).length) return;
    runLogin({ mode: 'internal', username: empId.trim(), password, channelScope }, '/app/invoices');
  }


  async function submitSupplier(e) {
    e.preventDefault();
    const fe = {};
    if (!vcode.trim()) fe.vcode = 'Enter your vendor code.';
    setFieldErr(fe);
    if (Object.keys(fe).length) return;

    runLogin({ mode: 'supplier', vcode: vcode.trim(), company: supplierForVendorCode(vcode.trim()) }, '/supplier/home');
  }


  const notify = (msg) => dispatch(pushToast(msg));

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
      {done && (
        <div className="lgn-alert success" role="status">
          <CheckIcon /><span>Signed in — taking you to your workspace…</span>
        </div>
      )}
    </>
  );

  return (
    <div className="lgn-page">
      <AppHeader onNotify={notify} />

      <div className="lgn-hero">
        <BrandPanel />

        <section className="lgn-hero-right">
          <AuthCard
            onNotify={notify}
            subtitle={tab === 'supplier' ? 'Use your vendor code to continue.' : 'Sign in to continue.'}
          >
            <AccountTypeSelector value={tab} onChange={switchTab} />
            {alerts}

            {tab === 'internal' ? (
              <form className="lgn-form" onSubmit={submitInternal} noValidate>
                <WorkspaceSelector value={channelScope} onChange={setChannelScope} />
                <FormField
                  id="lgn-empid"
                  label="Enter Email ID"
                  icon={<IdIcon className="lgn-ic" />}
                  error={fieldErr.empId}
                  type="text"
                  autoComplete="username"
                  placeholder="Enter your Mahindra Email ID"
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
                />
                {passwordField}
                {rememberRow}
                <PrimaryButton loading={busy} done={done} />
              </form>
            ) : (
              <form className="lgn-form" onSubmit={submitSupplier} noValidate>
                <div className="lgn-form-spacer supplier-code-only" aria-hidden="true" />
                <FormField
                  id="lgn-vcode"
                  label="Vendor Code"
                  icon={<HashIcon className="lgn-ic" />}
                  error={fieldErr.vcode}
                  type="text"
                  autoComplete="username"
                  placeholder="Enter vendor code"
                  value={vcode}
                  onChange={(e) => setVcode(e.target.value)}
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
