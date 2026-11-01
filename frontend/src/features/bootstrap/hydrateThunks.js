import { api } from '../../api/client';
import { setAuthFromServer, logout as logoutLocal } from '../auth/authSlice';
import { hydrateTables } from '../tables/tablesSlice';
import { hydrateSettings } from '../settings/settingsSlice';
import { setRuntimeData } from '../../data/runtime';
import { bumpData, saveScope } from '../ui/uiSlice';
import { invoiceApi, USE_FASTAPI_INVOICES } from '../../api/invoiceApi';
import { AUTH_BYPASS } from '../auth/authSlice';
import { ticketsApi } from '../../api/ticketsApi';
import { authApi } from '../../api/authApi';
import { workspaceApi } from '../../api/workspaceApi';

async function loadInvoices(auth, fallback) {
  // Supplier records must always come from the authenticated invoice source.
  // Workspace bootstrap data is retained only for the internal prototype path.
  if (import.meta.env.MODE === 'test') return fallback;
  if (auth?.authType !== 'supplier' && !USE_FASTAPI_INVOICES) return fallback;
  // A supplier created on the Suppliers screen has a list of vendor codes and the server already
  // limits the data to them; the original vendor-code login filters by its one code, as before.
  const vendorCode = auth?.authType === 'supplier' && !auth.vcodes ? auth.vcode : undefined;
  return invoiceApi.listAll(vendorCode ? { vendor_code: vendorCode } : {});
}

/** Pull the whole dataset from the API and push it into the store + runtime. */
export const loadBootstrap = (auth) => async (dispatch) => {
  let b = { invoices: [], syncLog: [], tickets: [], ticketSeq: 0, tables: {}, settings: {} };
  if (!AUTH_BYPASS) b = await workspaceApi.load();
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
  const body = form.mode === 'supplierPassword' ? { email: form.email, password: form.password } : form;
  const { token, auth } = await authApi.login(form.mode, body);
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
    const { auth } = await authApi.me();
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
    await authApi.logout();
  } catch {
    /* token already gone / server down — clear locally anyway */
  }
  api.clearToken();
  dispatch(ticketsApi.util.resetApiState());
  dispatch(logoutLocal());
  saveScope({ fy: null, channel: '', vcode: '' }); // the next person starts with no top-bar scope
};
