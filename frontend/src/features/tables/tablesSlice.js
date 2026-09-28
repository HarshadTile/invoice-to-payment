import { createSlice } from '@reduxjs/toolkit';
import { api } from '../../api/client';

// Row data is loaded from the API after login (see hydrateThunks.loadBootstrap).
const tablesSlice = createSlice({
  name: 'tables',
  initialState: { byKey: {} },
  reducers: {
    hydrateTables(state, action) {
      state.byKey = action.payload || {};
    },
    setRowsLocal(state, action) {
      const { key, rows } = action.payload;
      state.byKey[key] = rows;
    },
    addRowLocal(state, action) {
      const { key, row } = action.payload;
      if (!state.byKey[key]) state.byKey[key] = [];
      state.byKey[key].push(row);
    },
    updateRowLocal(state, action) {
      const { key, idx, row } = action.payload;
      if (state.byKey[key]) state.byKey[key][idx] = row;
    },
    deleteRowLocal(state, action) {
      const { key, idx } = action.payload;
      if (state.byKey[key]) state.byKey[key].splice(idx, 1);
    },
    toggleNotifRuleLocal(state, action) {
      const idx = action.payload;
      const rows = state.byKey['settings-notifications'];
      if (rows && rows[idx]) rows[idx][3] = rows[idx][3] === 'On' ? 'Off' : 'On';
    },
  },
});

export const {
  hydrateTables,
  setRowsLocal, addRowLocal, updateRowLocal, deleteRowLocal, toggleNotifRuleLocal,
} = tablesSlice.actions;
export default tablesSlice.reducer;

const EMPTY_ROWS = Object.freeze([]);
export const selectTable = (state, key) => state.tables.byKey[key] || EMPTY_ROWS;

/* ---- write-through thunks ---- */

// Persist whatever rows the given key now holds in the store.
const persist = (key) => (_dispatch, getState) => api.put(`/v1/tables/${key}`, {
  rows: getState().tables.byKey[key] || [],
});

export const setRows = (payload) => async (dispatch) => {
  dispatch(setRowsLocal(payload));
  await dispatch(persist(payload.key));
};
export const addRow = (payload) => async (dispatch) => {
  dispatch(addRowLocal(payload));
  await dispatch(persist(payload.key));
};
export const updateRow = (payload) => async (dispatch) => {
  dispatch(updateRowLocal(payload));
  await dispatch(persist(payload.key));
};
export const deleteRow = (payload) => async (dispatch) => {
  dispatch(deleteRowLocal(payload));
  await dispatch(persist(payload.key));
};
export const toggleNotifRule = (idx) => async (dispatch) => {
  dispatch(toggleNotifRuleLocal(idx));
  await dispatch(persist('settings-notifications'));
};
