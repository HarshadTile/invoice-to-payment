import { createSlice } from '@reduxjs/toolkit';
import { ROLE_MATRIX } from '../../data/constants';
import { api } from '../../api/client';

// Seeded with the static defaults so selectors work before bootstrap; replaced
// by hydrateSettings once the API responds.
const initialState = {
  roleMatrix: JSON.parse(JSON.stringify(ROLE_MATRIX)),
  integrations: [
    ['Msetu / SRM', 'Connected', '06 Aug 2026, 07:00 AM'],
    ['PO Portal', 'Connected', '06 Aug 2026, 07:02 AM'],
    ['SAP (MIRO / ML81N / FBL1N)', 'Connected', '06 Aug 2026, 07:05 AM'],
    ['MFOX Portal', 'Connection Error', '06 Aug 2026, 07:08 AM'],
  ],
  senderEmail: 'i2ptracker@company.com',
  twoFactorOn: false,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    hydrateSettings(state, action) {
      const p = action.payload || {};
      if (p.roleMatrix) state.roleMatrix = p.roleMatrix;
      if (p.integrations) state.integrations = p.integrations;
      if (p.senderEmail != null) state.senderEmail = p.senderEmail;
      if (p.twoFactorOn != null) state.twoFactorOn = p.twoFactorOn;
    },
    togglePermissionLocal(state, action) {
      const { role, cap } = action.payload;
      state.roleMatrix[role][cap] = !state.roleMatrix[role][cap];
    },
    setSenderEmailLocal(state, action) {
      state.senderEmail = action.payload;
    },
    toggleTwoFactorLocal(state) {
      state.twoFactorOn = !state.twoFactorOn;
    },
  },
});

export const { hydrateSettings, togglePermissionLocal, toggleTwoFactorLocal, setSenderEmailLocal } = settingsSlice.actions;
export default settingsSlice.reducer;

/* ---- write-through thunks ---- */
// Optimistic, but the server has the final say (it validates and permission-checks every
// edit): if it refuses, undo the local toggle and let the caller show why.
export const togglePermission = (payload) => async (dispatch, getState) => {
  dispatch(togglePermissionLocal(payload));
  try {
    await api.put('/v1/settings', { roleMatrix: getState().settings.roleMatrix });
  } catch (err) {
    dispatch(togglePermissionLocal(payload));
    throw err;
  }
};

// Saved only once the server accepts it, so the field never shows an address that wasn't stored.
export const saveSenderEmail = (email) => async (dispatch) => {
  await api.put('/v1/settings', { senderEmail: email });
  dispatch(setSenderEmailLocal(email));
};

export const toggleTwoFactor = () => async (dispatch, getState) => {
  dispatch(toggleTwoFactorLocal());
  try {
    await api.put('/v1/settings', { twoFactorOn: getState().settings.twoFactorOn });
  } catch (err) {
    dispatch(toggleTwoFactorLocal());
    throw err;
  }
};
