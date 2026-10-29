import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/login/AppHeader.jsx';
import BrandPanel from '../components/login/BrandPanel.jsx';
import FormField from '../components/login/FormField.jsx';
import { Mail } from '../components/common/icons.jsx';
import { authApi } from '../api/authApi.js';
import './login.css';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message || 'Could not submit the reset request. Please try again.');
    } finally {
      setBusy(false);
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
              <p className="lgn-kicker">Password recovery</p>
              <h2>Forgot your password?</h2>
              <p className="lgn-card-sub">Enter your sign-in email and we’ll send a one-time password reset link if it matches an active account.</p>
            </div>
            {sent ? (
              <>
                <div className="lgn-alert success" role="status">
                  If an active account matches that email, password reset instructions will be sent.
                </div>
                <button type="button" className="lgn-submit" onClick={() => navigate('/login?account=internal')}>Back to sign in</button>
              </>
            ) : (
              <form className="lgn-form" onSubmit={submit} noValidate>
                {error && <div className="lgn-alert error" role="alert">{error}</div>}
                <FormField
                  id="forgot-email"
                  label="Sign-in email"
                  icon={<Mail className="lgn-ic" />}
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <button type="submit" className="lgn-submit" disabled={busy || !email.trim()}>
                  {busy ? 'Sending…' : 'Send reset email'}
                </button>
                <button type="button" className="lgn-link" onClick={() => navigate('/login?account=internal')}>Back to sign in</button>
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
