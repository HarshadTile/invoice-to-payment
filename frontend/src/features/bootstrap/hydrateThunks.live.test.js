import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

// The live invoice API: internal screens page invoices on the server, so none are downloaded at login.
const mocks = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), setToken: vi.fn(), clearToken: vi.fn(), hasToken: vi.fn() }, listAll: vi.fn() }));
vi.mock('../../api/client', () => ({ api: mocks.api }));
vi.mock('../../api/invoiceApi', async (original) => {
  const actual = await original();
  return { ...actual, USE_FASTAPI_INVOICES: true, invoiceApi: { ...actual.invoiceApi, listAll: mocks.listAll } };
});
vi.stubEnv('MODE', 'development'); // loadInvoices skips the API under MODE === 'test'

const { loadBootstrap } = await import('./hydrateThunks');
const { runtime } = await import('../../data/runtime');
const uiReducer = (await import('../ui/uiSlice')).default;
const tablesReducer = (await import('../tables/tablesSlice')).default;
const settingsReducer = (await import('../settings/settingsSlice')).default;

const makeStore = () => configureStore({ reducer: { ui: uiReducer, tables: tablesReducer, settings: settingsReducer } });
const WORKSPACE = { invoices: [], syncLog: [], tickets: [], ticketSeq: 1, tables: {}, settings: {} };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.get.mockResolvedValue(WORKSPACE);
});

describe('login data on the live invoice API', () => {
  it('downloads no invoices for internal users', async () => {
    await makeStore().dispatch(loadBootstrap({ authType: 'internal', channelScope: 'all' }));
    expect(mocks.listAll).not.toHaveBeenCalled();
    expect(runtime.invoices).toEqual([]);
  });

  it('still loads a supplier\'s own invoices, which their screens work from', async () => {
    mocks.listAll.mockResolvedValue([{ no: 'INV-1', vcode: 'V1' }]);
    await makeStore().dispatch(loadBootstrap({ authType: 'supplier', vcode: 'V1' }));
    expect(mocks.listAll).toHaveBeenCalledWith({ vendor_code: 'V1' });
    expect(runtime.invoices.map((i) => i.no)).toEqual(['INV-1']);
  });
});
