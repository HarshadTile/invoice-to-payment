import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/login/AppHeader.jsx';
import BrandPanel from '../components/login/BrandPanel.jsx';
import './login.css';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  return (
    <div className="lgn-page">
      <AppHeader onNotify={() => {}} />
      <div className="lgn-hero">
        <BrandPanel />
        <section className="lgn-hero-right">
          <div className="lgn-card">
            <div className="lgn-card-head">
              <p className="lgn-kicker">Password recovery</p>
              <h2>Forgot your password?</h2>
              <p className="lgn-card-sub">Contact your administrator and provide your sign-in email. They can generate a one-time password reset link for you.</p>
            </div>
            <p className="modal-copy">No email is sent automatically. Open the link your administrator shares, choose a new password, then return to sign in.</p>
            <button type="button" className="lgn-submit" onClick={() => navigate('/login?account=internal')}>Back to sign in</button>

          </div>
        </section>
      </div>
    </div>
  );
}
