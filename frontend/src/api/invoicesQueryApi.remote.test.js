import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

// The live-API paths: normally off in tests, switched on here with the API client mocked.
vi.mock('./invoiceApi', async (original) => ({ ...await original(), USE_FASTAPI_INVOICES: true }));
vi.mock('./client', () => ({ api: { get: vi.fn(), getBlob: vi.fn() } }));

const { api } = await import('./client');
const { invoicesQueryApi, fetchAllMatching } = await import('./invoicesQueryApi');

const makeStore = () => configureStore({
  reducer: { auth: () => ({ authType: 'internal' }), ui: () => ({ dataVersion: 0 }), [invoicesQueryApi.reducerPath]: invoicesQueryApi.reducer },
  middleware: (getDefault) => getDefault().concat(invoicesQueryApi.middleware),
});
const ask = (store, endpoint, args) => store.dispatch(invoicesQueryApi.endpoints[endpoint].initiate(args));
const apiInvoice = (no) => ({ invoice_number: no, channel: 'msetuSrm', overall_status: 'Paid', purchase_order: { po_number: 'PO1', po_item: 10 },
  supplier: { vendor_code: 'V1', supplier_name: 'Supplier One' }, sap: { payable_amount: 100, currency: 'INR' }, workflow: {} });

beforeEach(() => vi.clearAllMocks());

describe('invoice queries on the live API', () => {
  it('asks for one page with the filters and maps the rows for the screens', async () => {
    api.get.mockResolvedValue({ items: [apiInvoice('INV-1')], total: 41 });
    const { data } = await ask(makeStore(), 'getInvoicePage', { channel: 'all', statuses: ['Paid'], page: 2, page_size: 20 });
    expect(api.get).toHaveBeenCalledWith('/v1/invoices/list-invoices?channel=all&statuses=Paid&page=2&page_size=20');
    expect(data.total).toBe(41);
    expect(data.items[0]).toMatchObject({ no: 'INV-1', vcode: 'V1', status: 'Paid', poItem: 10 });
  });

  it('shows dashboard currencies the way amounts are printed', async () => {
    api.get.mockResolvedValue({ currency: 'INR', otherCurrencies: { USD: 40 }, totalsByCurrency: { INR: 100, USD: 40 }, total: { count: 2 } });
    const { data } = await ask(makeStore(), 'getInvoiceDashboard', { channel: 'all' });
    expect(data.currency).toBe('₹');
    expect(data.otherCurrencies).toEqual({ $: 40 });
    expect(data.totalsByCurrency).toEqual({ '₹': 100, $: 40 });
  });

  it('treats an invoice the server does not have as "no invoice", not an error', async () => {
    api.get.mockRejectedValue(Object.assign(new Error('Invoice not found'), { status: 404 }));
    const result = await ask(makeStore(), 'getInvoice', { no: 'INV/9', poItem: 10, channel: 'msetuSrm', po: '-' });
    expect(result.data).toBeNull();
    expect(api.get).toHaveBeenCalledWith('/v1/invoices/invoice-details/INV%2F9?po_item=10&channel=msetuSrm');
  });

  it('reports other failures as errors the screen can show and retry', async () => {
    api.get.mockRejectedValue(Object.assign(new Error('Invoice data source is unavailable.'), { status: 503 }));
    const result = await ask(makeStore(), 'getInvoiceDashboard', { channel: 'all' });
    expect(result.error).toEqual({ status: 503, message: 'Invoice data source is unavailable.' });
  });

  it('gives log rows real dates', async () => {
    api.get.mockResolvedValue({ items: [{ key: 'k', when: '2026-06-05T15:00:00', hasTime: true }], total: 1, queryError: false });
    const { data } = await ask(makeStore(), 'getInvoiceEvents', { kind: 'global', page: 1 });
    expect(data.items[0].when).toBeInstanceOf(Date);
    expect(data.items[0].when.getHours()).toBe(15);
  });

  it('fetches every matching page for a browser-built export', async () => {
    api.get
      .mockResolvedValueOnce({ items: [apiInvoice('A')], total: 1001 })
      .mockResolvedValueOnce({ items: [apiInvoice('B')], total: 1001 });
    const rows = await fetchAllMatching({ channel: 'msetuSrm' });
    expect(rows.map((row) => row.no)).toEqual(['A', 'B']);
    expect(api.get).toHaveBeenLastCalledWith('/v1/invoices/list-invoices?channel=msetuSrm&page=2&page_size=1000');
  });
});
