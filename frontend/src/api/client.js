/* Thin fetch wrapper for the I2P API.
 *
 * - prefixes every path with /api (paths start with /v1, which Vite proxies to the FastAPI backend)
 * - attaches the bearer token (from localStorage if "remember me" was checked,
 *   otherwise sessionStorage)
 * - throws an Error carrying the server's message + status on non-2xx */
const TOKEN_KEY = 'i2p_token';

function readStored(store) {
  try {
    return store.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

let token = readStored(localStorage) || readStored(sessionStorage);

function clearStored() {
  token = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

/* Sign-in, password and portal calls answer 401 for a wrong password; that is not a session ending. */
const AUTH_ENTRY = /^\/v1\/auth\/(login|supplier\/(login|check|complete|forgot)|forgot|reset|password-link|portal-availability)/;
/* A 403 that means the session itself is over, not that one action is not allowed. */
const SESSION_OVER_403 = {
  'This account has been deactivated.': 'This account has been deactivated. Contact an administrator.',
  'Workspace access is no longer authorised.': 'Your access to this workspace has changed. Please sign in again.',
};
export const SESSION_ENDED_EVENT = 'i2p:session-ended';
/** Where the reason is kept for the sign-in page to show once. */
export const SESSION_MESSAGE_KEY = 'i2p_session_message';

/** The server ended this session (signed out elsewhere, deactivated, access changed): forget the
 *  token and tell the app, which returns to sign-in with the reason. */
function endSession(status, message) {
  clearStored();
  const reason = status === 401 ? 'Your session has ended. Please sign in again.' : SESSION_OVER_403[message];
  window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail: { message: reason } }));
}

async function req(method, path, body, options = {}) {
  const sentToken = !!token;
  const isForm = body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(!isForm && body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    body: body === undefined ? undefined : (isForm ? body : JSON.stringify(body)),
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.error === 'string') message = data.error;
      else if (data?.error?.message) message = data.error.message;
      else if (data?.detail?.error?.message) message = data.detail.error.message;
      else if (typeof data?.detail === 'string') message = data.detail;
    } catch {
      /* response had no JSON body */
    }
    const err = new Error(message);
    err.status = res.status;
    if (sentToken && !AUTH_ENTRY.test(path)
      && (res.status === 401 || (res.status === 403 && SESSION_OVER_403[message]))) {
      endSession(res.status, message);
    }
    throw err;
  }

  if (res.status === 204) return null;
  return options.as === 'blob' ? res.blob() : res.json();
}

function writeToken(value, persist) {
  const primary = persist ? localStorage : sessionStorage;
  const other = persist ? sessionStorage : localStorage;
  try { primary.setItem(TOKEN_KEY, value); } catch { /* ignore */ }
  try { other.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export const api = {
  get: (path, options) => req('GET', path, undefined, options),
  /** A file download (e.g. a CSV export) with the same auth and error handling. */
  getBlob: (path, options) => req('GET', path, undefined, { ...options, as: 'blob' }),
  post: (path, body, options) => req('POST', path, body, options),
  patch: (path, body, options) => req('PATCH', path, body, options),
  put: (path, body, options) => req('PUT', path, body, options),
  delete: (path, options) => req('DELETE', path, undefined, options),
  setToken(value, { persist = true } = {}) {
    token = value;
    writeToken(value, persist);
  },
  clearToken: clearStored,
  hasToken: () => !!token,
  authHeaders: () => (token ? { Authorization: `Bearer ${token}` } : {}),
};
