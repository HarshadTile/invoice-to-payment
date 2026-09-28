import SupportFooter from './SupportFooter.jsx';

/** White authentication card: heading block + form content + support footer. */
export default function AuthCard({ children, onNotify, subtitle }) {
  return (
    <div className="lgn-card">
      <div className="lgn-card-head">
        <p className="lgn-kicker">Welcome back</p>
        <h2>Sign in to Invoice to Payment Tracker</h2>
        <p className="lgn-card-sub">{subtitle || 'Sign in to continue.'}</p>
      </div>
      {children}
      <SupportFooter onNotify={onNotify} />
    </div>
  );
}
