import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { restoreSession, loadBootstrap } from './hydrateThunks';

/** Gates the app until a session (if any) has been restored and the dataset
 *  hydrated. With no stored token this resolves immediately and the login
 *  page renders. */
export default function Bootstrapper({ children }) {
  const dispatch = useDispatch();
  const loggedIn = useSelector((s) => s.auth.loggedIn);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (loggedIn) await dispatch(loadBootstrap());
        else await dispatch(restoreSession());
      } catch {
        /* fall through to render — an unauthenticated app shows the login page */
      }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#667', font: '15px system-ui' }}>
        Loading…
      </div>
    );
  }
  return children;
}
