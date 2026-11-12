import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { restoreSession, loadBootstrap } from './hydrateThunks';

/** Gates the app until a session (if any) has been restored and the dataset
 *  hydrated. With no stored token this resolves immediately and the login
 *  page renders. If the server can't be reached while a session is stored, it
 *  says so with Retry rather than showing the sign-in page (the session is kept). */
export default function Bootstrapper({ children }) {
  const dispatch = useDispatch();
  const loggedIn = useSelector((s) => s.auth.loggedIn);
  const [state, setState] = useState('loading'); // loading | ready | unreachable

  const start = useCallback(async () => {
    setState('loading');
    let result = null;
    try {
      if (loggedIn) await dispatch(loadBootstrap());
      else result = await dispatch(restoreSession());
    } catch {
      /* fall through to render — an unauthenticated app shows the login page */
    }
    return result === 'unreachable' ? 'unreachable' : 'ready';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    start().then((next) => { if (alive) setState(next); });
    return () => { alive = false; };
  }, [start]);

  if (state === 'unreachable') {
    return (
      <div role="alert" style={{ padding: '3rem 1rem', textAlign: 'center', color: '#445', font: '0.9375em system-ui' }}>
        <p style={{ fontWeight: 600, margin: '0 0 0.5rem' }}>The server can&apos;t be reached right now.</p>
        <p style={{ margin: '0 0 1.25rem', color: '#667' }}>You are still signed in. Check your connection, then try again.</p>
        <button type="button" className="btn primary" onClick={() => start().then(setState)}>Retry</button>
      </div>
    );
  }
  if (state !== 'ready') {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: '#667', font: '0.9375em system-ui' }}>
        Loading…
      </div>
    );
  }
  return children;
}
