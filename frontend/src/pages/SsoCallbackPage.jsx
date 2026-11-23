import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ssoLoginThunk } from '../features/bootstrap/hydrateThunks';
import { pushToast } from '../features/ui/uiSlice';
import AuthLayout from '../components/login/AuthLayout.jsx';
import { AlertIcon } from '../components/login/icons.jsx';
import './login.css';

/** Where the backend sends the browser after a successful CC Services sign-in, with a one-time
 *  code (?code=…). The code is swapped for the normal session once, then removed from the URL. */
export default function SsoCallbackPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');
  const [error, setError] = useState(code ? '' : 'This sign-in link is invalid or has expired. Sign in again.');
  const started = useRef(false); // the code works once; React's dev double-run must not spend it twice

  useEffect(() => {
    if (started.current || !code) return;
    started.current = true;
    window.history.replaceState(null, '', '/sso/callback');
    dispatch(ssoLoginThunk(code))
      .then(() => {
        dispatch(pushToast('Signed in.'));
        navigate('/app/invoices', { replace: true });
      })
      .catch((err) => setError(err.message || 'Something went wrong. Please sign in again.'));
  }, [dispatch, navigate, code]);

  return (
    <AuthLayout kicker="Single sign-on" title={error ? 'Sign-in did not complete' : 'Signing you in…'}>
      {error ? (
        <>
          <div className="lgn-alert error" role="alert"><AlertIcon /><span>{error}</span></div>
          <button type="button" className="lgn-submit" onClick={() => navigate('/login?account=internal', { replace: true })}>
            Back to sign in
          </button>
        </>
      ) : (
        <p className="lgn-card-sub" role="status">Please wait while we open your workspace.</p>
      )}
    </AuthLayout>
  );
}
