import { api } from '../../api/client';
import { setAuthFromServer, logout as logoutLocal } from '../auth/authSlice';
import { hydrateTables } from '../tables/tablesSlice';
import { hydrateSettings } from '../settings/settingsSlice';
import { setRuntimeData } from '../../data/runtime';
import { bumpData, saveScope } from '../ui/uiSlice';
import { invoiceApi } from '../../api/invoiceApi';
import { AUTH_BYPASS } from '../auth/authSlice';
import { ticketsApi } from '../tickets/ticketsApi';

const USE_FASTAPI_INVOICES = import.meta.env.MODE !== 'test'
  && import.meta.env.VITE_USE_FASTAPI_INVOICES === 'true';

async function loadInvoices(auth, fallback) {
  // Supplier records must always come from the authenticated invoice source.
  // Workspace bootstrap data is retained only for the internal prototype path.
  if (import.meta.env.MODE === 'test') return fallback;
  if (auth?.authType !== 'supplier' && !USE_FASTAPI_INVOICES) return fallback;
  const vendorCode = auth?.authType === 'supplier' ? auth.vcode : undefined;
  return invoiceApi.listAll(vendorCode ? { vendor_code: vendorCode } : {});
}

/** Pull the whole dataset from the API and push it into the store + runtime. */
export const loadBootstrap = (auth) => async (dispatch) => {
  let b = { invoices: [], syncLog: [], tickets: [], ticketSeq: 0, tables: {}, settings: {} };
  if (!AUTH_BYPASS) b = await api.get('/v1/workspace');
  const invoices = await loadInvoices(auth, b.invoices);
  setRuntimeData({ invoices, syncLog: b.syncLog });
  dispatch(bumpData()); // memoised invoice selectors must re-read the new data
  dispatch(hydrateTables(b.tables));
  dispatch(hydrateSettings(b.settings));
  return b;
};

/** Sign in, store the token, hydrate. Throws on bad credentials.
 *  `opts.remember === false` keeps the session in sessionStorage only. */
export const loginThunk = (form, opts = {}) => async (dispatch) => {
  let token, auth;
  if (form.mode === 'supplier') {
    const res = await api.post('/v1/auth/supplier/login', form);
    token = res.token;
    auth = res.auth;
  } else {
    const res = await api.post('/v1/auth/login', form);
    token = res.token;
    auth = res.auth;
  }
  api.setToken(token, { persist: opts.remember !== false });
  dispatch(ticketsApi.util.resetApiState());
  // Load the data BEFORE flipping to "logged in": the route guards redirect into
  // the app the moment auth flips, and pages must not render (and cache) an empty
  // dataset while the bootstrap request is still in flight.
  try {
    await dispatch(loadBootstrap(auth));
  } catch (err) {
    api.clearToken();
    throw err;
  }
  dispatch(setAuthFromServer(auth));
};

/** On app start: if a token is present, revalidate it and hydrate. */
export const restoreSession = () => async (dispatch) => {
  if (!api.hasToken()) return false;
  try {
    const { auth } = await api.get('/v1/auth/me');
    dispatch(ticketsApi.util.resetApiState());
    dispatch(setAuthFromServer(auth));
    await dispatch(loadBootstrap(auth));
    return true;
  } catch {
    api.clearToken();
    return false;
  }
};

/** Invalidate the session server-side, then clear local auth. */
export const logoutThunk = () => async (dispatch) => {
  try {
    await api.post('/v1/auth/logout');
  } catch {
    /* token already gone / server down — clear locally anyway */
  }
  api.clearToken();
  dispatch(ticketsApi.util.resetApiState());
  dispatch(logoutLocal());
  saveScope({ fy: null, channel: '', vcode: '' }); // the next person starts with no top-bar scope
};
