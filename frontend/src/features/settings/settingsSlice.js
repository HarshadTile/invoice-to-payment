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
    toggleTwoFactorLocal(state) {
      state.twoFactorOn = !state.twoFactorOn;
    },
  },
});

export const { hydrateSettings, togglePermissionLocal, toggleTwoFactorLocal } = settingsSlice.actions;
export default settingsSlice.reducer;

/* ---- write-through thunks ---- */
export const togglePermission = (payload) => async (dispatch, getState) => {
  dispatch(togglePermissionLocal(payload));
  await api.put('/v1/settings', { roleMatrix: getState().settings.roleMatrix });
};

export const toggleTwoFactor = () => async (dispatch, getState) => {
  dispatch(toggleTwoFactorLocal());
  await api.put('/v1/settings', { twoFactorOn: getState().settings.twoFactorOn });
};
