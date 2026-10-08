import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/authApi';
import AppHeader from '../components/login/AppHeader.jsx';
import BrandPanel from '../components/login/BrandPanel.jsx';
import FormField from '../components/login/FormField.jsx';
import { IdIcon, AlertIcon, CheckIcon } from '../components/login/icons.jsx';
import './login.css';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('idle'); // idle | busy | done

  async function submit(e) {
    e.preventDefault();
    if (!email.trim()) { setError('Enter your email address.'); return; }
    setError('');
    setStatus('busy');
    try {
      await authApi.forgotPassword(email.trim());
      setStatus('done');
    } catch (err) {
      setStatus('idle');
      setError(err.message || 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className="lgn-page">
      <AppHeader onNotify={() => {}} />
      <div className="lgn-hero">
        <BrandPanel />
        <section className="lgn-hero-right">
          <div className="lgn-card">
            <div className="lgn-card-head">
              <p className="lgn-kicker">Reset your password</p>
              <h2>Forgot your password?</h2>
              <p className="lgn-card-sub">
                Enter the email on your account and, if it's registered, we'll send a link to set a new one.
              </p>
            </div>

            {error && (
              <div className="lgn-alert error" role="alert"><AlertIcon /><span>{error}</span></div>
            )}

            {status === 'done' ? (
              <>
                <div className="lgn-alert success" role="status">
                  <CheckIcon /><span>If that email has an account, a reset link has been sent to it. Check your inbox.</span>
                </div>
                <button type="button" className="lgn-submit" onClick={() => navigate('/login')}>Back to sign in</button>
              </>
            ) : (
              <form className="lgn-form" onSubmit={submit} noValidate>
                <FormField
                  id="fp-email"
                  label="Email"
                  icon={<IdIcon className="lgn-ic" />}
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button type="submit" className="lgn-submit" disabled={status === 'busy'}>
                  {status === 'busy' ? 'Sending…' : 'Send reset link'}
                </button>
                <button type="button" className="lgn-link" style={{ marginTop: 14 }} onClick={() => navigate('/login')}>
                  Back to sign in
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
