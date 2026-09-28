import { createSlice } from '@reduxjs/toolkit';
import { panFor, supplierForVendorCode } from '../../utils/businessLogic';
import { runtime } from '../../data/runtime';
import { CHANNEL_LABEL, ROLE_MATRIX } from '../../data/constants';

export const AUTH_BYPASS = import.meta.env.MODE !== 'test'
  && import.meta.env.VITE_DISABLE_AUTH === 'true';

/* Valid channelScope values:
 *   'all'        — HQ / Admin: sees all 4 channels
 *   'msetuSrm'   — locked to Msetu / SRM only
 *   'poPortal'   — locked to PO Portal only
 *   'mfoxPortal' — locked to MFOX Portal only
 *   (Manual has no own login — HQ only) */

const initialState = {
  loggedIn: AUTH_BYPASS,
  authType: 'internal', // 'internal' | 'supplier'
  channelScope: 'all', // 'all' | 'msetuSrm' | 'poPortal' | 'mfoxPortal'
  role: 'Admin', // 'Admin' | 'MDE Invoice Team'
  supplierQuery: null,
  supplierPAN: null,
  supplierLoginVcode: null,
  currentUser: { name: 'Ravi Kulkarni', initials: 'RK', title: 'MDE Invoice Lead', dept: 'Procurement', email: 'r.kulkarni@company.com' },
};

const CHANNEL_KEYS = new Set(['msetuSrm', 'poPortal', 'mfoxPortal']);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    switchIdentity(state, action) {
      // payload: 'internal:all' | 'internal:msetuSrm' | 'internal:poPortal' | 'internal:mfoxPortal' | 'supplier:<vendorCode>'
      const [kind, val] = action.payload.split(':');
      if (kind === 'supplier') {
        const supplier = supplierForVendorCode(val);
        state.authType = 'supplier';
        state.supplierQuery = supplier;
        state.supplierPAN = runtime.invoices.find((invoice) => invoice.vcode === val)?.pan || panFor(supplier);
        state.supplierLoginVcode = val;
      } else {
        state.authType = 'internal';
        state.channelScope = CHANNEL_KEYS.has(val) ? val : 'all';
        state.role = state.channelScope === 'all' ? 'Admin' : 'MDE Invoice Team';
        state.supplierQuery = null;
        state.supplierPAN = null;
        state.supplierLoginVcode = null;
      }
    },
    logout(state) {
      if (AUTH_BYPASS) return;
      Object.assign(state, initialState, { loggedIn: false });
    },
    // Apply the auth object returned by POST /api/login or GET /api/me.
    setAuthFromServer(state, action) {
      Object.assign(state, action.payload, { loggedIn: true });
      if (state.authType === 'supplier') {
        state.supplierLoginVcode = state.vcode;
        state.supplierQuery = state.company;
        state.supplierPAN = state.pan;
      }
    },
  },
});

export const { switchIdentity, logout, setAuthFromServer } = authSlice.actions;
export default authSlice.reducer;

/* ---- selectors ---- */
export const selectPerm = (state) => {
  return ROLE_MATRIX[state.auth.role] || ROLE_MATRIX.Viewer || {};
};

/** Is the current login locked to a single channel? */
export const selectIsChannelLocked = (state) => state.auth.channelScope !== 'all' && state.auth.authType === 'internal';

/** Human-readable label for the current scope. */
export const selectScopeLabel = (state) => {
  if (state.auth.channelScope === 'all') return 'All Channels (HQ)';
  return CHANNEL_LABEL[state.auth.channelScope] || state.auth.channelScope;
};
