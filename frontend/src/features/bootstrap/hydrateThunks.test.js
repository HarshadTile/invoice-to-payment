import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

const mockApi = vi.hoisted(() => ({
  post: vi.fn(), get: vi.fn(), setToken: vi.fn(), clearToken: vi.fn(), hasToken: vi.fn(() => false),
}));
vi.mock('../../api/client', () => ({ api: mockApi }));

import authReducer from '../auth/authSlice';
import ticketsReducer from '../tickets/ticketsSlice';
import tablesReducer from '../tables/tablesSlice';
import settingsReducer from '../settings/settingsSlice';
import uiReducer from '../ui/uiSlice';
import { selectScopedInvoices } from '../invoices/selectors';
import { runtime, setRuntimeData } from '../../data/runtime';
import { loginThunk } from './hydrateThunks';

const makeStore = () => configureStore({
  reducer: { auth: authReducer, tickets: ticketsReducer, tables: tablesReducer, settings: settingsReducer, ui: uiReducer },
});

const BOOTSTRAP = {
  invoices: [{ no: 'INV-MS-1125', channel: 'msetuSrm', vcode: 'X', vendor: 'V', status: 'Paid' }],
  syncLog: [], tickets: [], ticketSeq: 1005, tables: {}, settings: {},
};
const AUTH = { authType: 'internal', channelScope: 'all', role: 'Admin', currentUser: {} };

beforeEach(() => {
  vi.clearAllMocks();
  setRuntimeData({ invoices: [], syncLog: [] });
});

describe('loginThunk', () => {
  it('has the data loaded before the app counts as logged in', async () => {
    let releaseBootstrap;
    mockApi.post.mockResolvedValue({ token: 't', auth: AUTH });
    mockApi.get.mockImplementation(() => new Promise((res) => { releaseBootstrap = () => res(BOOTSTRAP); }));

    const store = makeStore();
    const seenAtLogin = [];
    store.subscribe(() => {
      if (store.getState().auth.loggedIn && !seenAtLogin.length) seenAtLogin.push(runtime.invoices.length);
    });

    const pending = store.dispatch(loginThunk({ mode: 'internal' }));
    await vi.waitFor(() => expect(releaseBootstrap).toBeTypeOf('function'));
    expect(store.getState().auth.loggedIn).toBe(false); // still waiting on /bootstrap
    releaseBootstrap();
    await pending;

    expect(store.getState().auth.loggedIn).toBe(true);
    expect(seenAtLogin).toEqual([1]); // invoices were already there when auth flipped
    expect(selectScopedInvoices(store.getState()).map((i) => i.no)).toEqual(['INV-MS-1125']);
  });

  it('does not log in (and drops the token) when the data load fails', async () => {
    mockApi.post.mockResolvedValue({ token: 't', auth: AUTH });
    mockApi.get.mockRejectedValue(new Error('boom'));
    const store = makeStore();
    await expect(store.dispatch(loginThunk({ mode: 'internal' }))).rejects.toThrow('boom');
    expect(store.getState().auth.loggedIn).toBe(false);
    expect(mockApi.clearToken).toHaveBeenCalled();
  });

  it('memoised invoice selector picks up data hydrated after it was first read', async () => {
    const store = makeStore();
    expect(selectScopedInvoices(store.getState())).toEqual([]); // read while empty (cached)
    mockApi.post.mockResolvedValue({ token: 't', auth: AUTH });
    mockApi.get.mockResolvedValue(BOOTSTRAP);
    await store.dispatch(loginThunk({ mode: 'internal' }));
    expect(selectScopedInvoices(store.getState())).toHaveLength(1);
  });
});
