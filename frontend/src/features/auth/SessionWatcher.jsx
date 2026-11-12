import { useEffect, useRef } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, SESSION_ENDED_EVENT, SESSION_MESSAGE_KEY } from '../../api/client';
import { ticketsApi } from '../../api/ticketsApi';
import { invoicesQueryApi } from '../../api/invoicesQueryApi';
import { logout as logoutLocal } from './authSlice';

const CHECK_EVERY_MS = 15000;

/** When the server ends the session mid-use (signed out elsewhere, account deactivated, workspace
 *  access changed), drop the loaded data and go back to sign-in with the reason, instead of
 *  leaving the page showing data the person may no longer see. Pages whose data was loaded at
 *  sign-in make no request when opened, so the session is also checked on page changes and when
 *  the tab comes back into focus (at most every 15 seconds); the API client reports the result. */
export default function SessionWatcher() {
  const dispatch = useDispatch();
  const store = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const loggedIn = useSelector((s) => s.auth.loggedIn);
  const lastCheck = useRef(Date.now());

  useEffect(() => {
    function onEnded(event) {
      const { auth } = store.getState();
      if (!auth.loggedIn) return; // already signed out; several failing requests send this at once
      const account = auth.authType === 'supplier' ? 'supplier' : 'internal';
      dispatch(logoutLocal());
      dispatch(ticketsApi.util.resetApiState());
      dispatch(invoicesQueryApi.util.resetApiState());
      try { sessionStorage.setItem(SESSION_MESSAGE_KEY, event.detail?.message || ''); } catch { /* ignore */ }
      navigate(`/login?account=${account}`, { replace: true });
    }
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
  }, [dispatch, navigate, store]);

  useEffect(() => {
    if (!loggedIn) return undefined;
    const check = () => {
      if (!api.hasToken() || Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
      lastCheck.current = Date.now();
      api.get('/v1/auth/me').catch(() => { /* a 401/403 is reported by the API client; network errors are ignored */ });
    };
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loggedIn, location.pathname]);

  return null;
}
