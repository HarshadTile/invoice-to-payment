/* Thin fetch wrapper for the I2P API.
 *
 * - prefixes every path with /api (Vite proxies that to the Express server)
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

async function req(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data && data.error) message = data.error;
    } catch {
      /* response had no JSON body */
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

function writeToken(value, persist) {
  const primary = persist ? localStorage : sessionStorage;
  const other = persist ? sessionStorage : localStorage;
  try { primary.setItem(TOKEN_KEY, value); } catch { /* ignore */ }
  try { other.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export const api = {
  get: (path) => req('GET', path),
  post: (path, body) => req('POST', path, body),
  patch: (path, body) => req('PATCH', path, body),
  put: (path, body) => req('PUT', path, body),
  setToken(value, { persist = true } = {}) {
    token = value;
    writeToken(value, persist);
  },
  clearToken() {
    token = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  },
  hasToken: () => !!token,
};
