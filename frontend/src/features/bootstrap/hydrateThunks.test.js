import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

const mockApi = vi.hoisted(() => ({
  post: vi.fn(), get: vi.fn(), setToken: vi.fn(), clearToken: vi.fn(), hasToken: vi.fn(() => false),
}));
vi.mock('../../api/client', () => ({ api: mockApi }));

import authReducer from '../auth/authSlice';
import { ticketsApi } from '../tickets/ticketsApi';
import tablesReducer from '../tables/tablesSlice';
import settingsReducer from '../settings/settingsSlice';
import uiReducer from '../ui/uiSlice';
import { selectScopedInvoices } from '../invoices/selectors';
import { runtime, setRuntimeData } from '../../data/runtime';
import { loginThunk } from './hydrateThunks';

const makeStore = () => configureStore({
  reducer: { auth: authReducer, tables: tablesReducer, settings: settingsReducer, ui: uiReducer, [ticketsApi.reducerPath]: ticketsApi.reducer },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(ticketsApi.middleware),
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
  it('waits for supplier OTP without saving a token or loading protected data', async () => {
    const challenge = { otp_required: true, challenge_id: 'challenge', phone_last4: '0123' };
    mockApi.post.mockResolvedValue(challenge);
    const store = makeStore();
    expect(await store.dispatch(loginThunk({ mode: 'supplier', vcode: 'V1' }))).toEqual(challenge);
    expect(mockApi.setToken).not.toHaveBeenCalled();
    expect(mockApi.get).not.toHaveBeenCalled();
    expect(store.getState().auth.loggedIn).toBe(false);
  });

  it('verifies supplier OTP before saving the token and loading data', async () => {
    mockApi.post.mockResolvedValue({ token: 'verified', auth: { authType: 'supplier', vcode: 'V1' } });
    mockApi.get.mockResolvedValue(BOOTSTRAP);
    const store = makeStore();
    await store.dispatch(loginThunk({ mode: 'supplier', challenge_id: 'challenge', code: '123456' }, { remember: false }));
    expect(mockApi.post).toHaveBeenCalledWith('/v1/auth/supplier/otp/verify', { challenge_id: 'challenge', code: '123456' });
    expect(mockApi.setToken).toHaveBeenCalledWith('verified', { persist: false });
    expect(store.getState().auth.loggedIn).toBe(true);
  });

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
