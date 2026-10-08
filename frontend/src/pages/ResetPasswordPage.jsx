import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { api } from '../api/client';
import { authApi } from '../api/authApi';
import { logoutThunk } from '../features/bootstrap/hydrateThunks';
import AppHeader from '../components/login/AppHeader.jsx';
import BrandPanel from '../components/login/BrandPanel.jsx';
import PasswordField from '../components/login/PasswordField.jsx';
import { AlertIcon, CheckIcon } from '../components/login/icons.jsx';
import './login.css';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('idle'); // idle | busy | done

  async function submit(e) {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setError('');
    setStatus('busy');
    try {
      await authApi.resetPassword(token, password);
      // The browser may still hold someone else's session (e.g. the admin who sent this
      // invite). Drop it so "Go to sign in" shows the login form instead of bouncing
      // straight into that other account's app.
      if (api.hasToken()) await dispatch(logoutThunk());
      setStatus('done');
    } catch (err) {
      setStatus('idle');
      setError(err.message || 'This reset link is invalid or has expired. Request a new one.');
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
              <h2>Choose a new password</h2>
              {!token && <p className="lgn-card-sub">This link is missing its reset token — open the link from your email again, or request a new one.</p>}
            </div>

            {error && (
              <div className="lgn-alert error" role="alert"><AlertIcon /><span>{error}</span></div>
            )}

            {status === 'done' ? (
              <>
                <div className="lgn-alert success" role="status">
                  <CheckIcon /><span>Password updated. You can now sign in with your new password.</span>
                </div>
                <button type="button" className="lgn-submit" onClick={() => navigate('/login')}>Go to sign in</button>
              </>
            ) : token ? (
              <form className="lgn-form" onSubmit={submit} noValidate>
                <PasswordField
                  id="rp-password"
                  label="New password"
                  value={password}
                  onChange={setPassword}
                  visible={showPw}
                  onToggleVisible={() => setShowPw((v) => !v)}
                  autoFocus
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                />
                <PasswordField
                  id="rp-confirm"
                  label="Confirm new password"
                  value={confirm}
                  onChange={setConfirm}
                  visible={showPw}
                  onToggleVisible={() => setShowPw((v) => !v)}
                  autoComplete="new-password"
                  placeholder="Re-enter the password above"
                />
                <button type="submit" className="lgn-submit" disabled={status === 'busy'}>
                  {status === 'busy' ? 'Saving…' : 'Set new password'}
                </button>
              </form>
            ) : (
              <button type="button" className="lgn-submit" onClick={() => navigate('/forgot-password')}>Request a new link</button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
