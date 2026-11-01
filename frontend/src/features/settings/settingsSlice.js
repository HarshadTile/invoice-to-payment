import { createSlice } from '@reduxjs/toolkit';
import { ROLE_MATRIX, DEFAULT_CHANNEL_AVAILABILITY } from '../../data/constants';
import { settingsApi } from '../../api/settingsApi';

// Seeded with the static defaults so selectors work before bootstrap; replaced
// by hydrateSettings once the API responds.
const initialState = {
  channelAvailability: { ...DEFAULT_CHANNEL_AVAILABILITY },
  roleMatrix: JSON.parse(JSON.stringify(ROLE_MATRIX)),
  integrations: [],
  senderEmail: 'i2ptracker@company.com',
  twoFactorOn: false,
  inviteLinkExpiryMinutes: 10080,
  resetLinkExpiryMinutes: 1440,
  supplierInviteLinkExpiryMinutes: 10080,
  supplierResetLinkExpiryMinutes: 1440,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    hydrateSettings(state, action) {
      const p = action.payload || {};
      if (p.channelAvailability) state.channelAvailability = { ...DEFAULT_CHANNEL_AVAILABILITY, ...p.channelAvailability };
      if (p.roleMatrix) state.roleMatrix = p.roleMatrix;
      if (p.integrations) state.integrations = p.integrations;
      if (p.senderEmail != null) state.senderEmail = p.senderEmail;
      if (p.twoFactorOn != null) state.twoFactorOn = p.twoFactorOn;
      if (p.inviteLinkExpiryMinutes != null) state.inviteLinkExpiryMinutes = p.inviteLinkExpiryMinutes;
      if (p.resetLinkExpiryMinutes != null) state.resetLinkExpiryMinutes = p.resetLinkExpiryMinutes;
      if (p.supplierInviteLinkExpiryMinutes != null) state.supplierInviteLinkExpiryMinutes = p.supplierInviteLinkExpiryMinutes;
      if (p.supplierResetLinkExpiryMinutes != null) state.supplierResetLinkExpiryMinutes = p.supplierResetLinkExpiryMinutes;
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
// Optimistic, but the server has the final say (it validates and permission-checks every
// edit): if it refuses, undo the local toggle and let the caller show why.
export const togglePermission = (payload) => async (dispatch, getState) => {
  dispatch(togglePermissionLocal(payload));
  try {
    await settingsApi.save({ roleMatrix: getState().settings.roleMatrix });
  } catch (err) {
    dispatch(togglePermissionLocal(payload));
    throw err;
  }
};

export const toggleTwoFactor = () => async (dispatch, getState) => {
  dispatch(toggleTwoFactorLocal());
  try {
    await settingsApi.save({ twoFactorOn: getState().settings.twoFactorOn });
  } catch (err) {
    dispatch(toggleTwoFactorLocal());
    throw err;
  }
};

/* ---- roles: create, rename, delete (the server keeps users' roles in step) ---- */
const applyRoles = (dispatch, result) => {
  dispatch(hydrateSettings({ roleMatrix: result.roleMatrix }));
  return result;
};
export const loadRoleSummary = () => async (dispatch) => applyRoles(dispatch, await settingsApi.roleSummary());
export const createRole = ({ name, copyFrom }) => async (dispatch) => applyRoles(dispatch, await settingsApi.createRole(name, copyFrom));
export const renameRole = (name, newName) => async (dispatch) => applyRoles(dispatch, await settingsApi.renameRole(name, newName));
export const deleteRole = (name, moveTo) => async (dispatch) => applyRoles(dispatch, await settingsApi.deleteRole(name, moveTo));
