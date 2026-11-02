import { describe, expect, it } from 'vitest';
import { currencyPrefix, facetsOfList, filterLocalInvoices, invoiceQueryString } from './invoicesQueryApi';

const inv = (no, changes = {}) => ({
  no, vcode: 'V1', vendor: 'Supplier One', pan: 'ABCDE1234F', channel: 'msetuSrm', po: '650001', poItem: 10,
  status: 'Approved', productType: 'S', plant: 'H001', dvType: 'AUTO', filterFiscalYear: 2027, amount: '₹1,000.00', utr: '-',
  rawDate: '2026-05-10', rawUploadDate: '2026-05-12', date: '10 May 2026', workflow: { approvers: {} }, sap: {}, ...changes,
});
const numbers = (rows) => rows.map((row) => row.no);

describe('invoice query parameters', () => {
  it('repeats list values, leaves out empty ones and never sends the local cache key', () => {
    expect(invoiceQueryString({ statuses: ['Paid', 'Approved'], q: '', vendor_code: undefined, fy_strict: false, v: 3, page: 2 }))
      .toBe('?statuses=Paid&statuses=Approved&page=2');
    expect(invoiceQueryString({})).toBe('');
  });

  it('turns currency codes into the prefix the screens print', () => {
    expect(currencyPrefix('INR')).toBe('₹');
    expect(currencyPrefix('USD')).toBe('$');
    expect(currencyPrefix('AED')).toBe('AED');
    expect(currencyPrefix('NOT-A-CODE')).toBe('NOT-A-CODE');
    expect(currencyPrefix(null)).toBe('');
  });
});

describe('local invoice rules (the same as the server)', () => {
  const list = [
    inv('A'),
    inv('B', { status: 'Paid', vcode: 'V2', vendor: 'Tata Steel', pan: 'ZZZZZ9999Z', rawDate: '2026-06-02' }),
    // No year can be worked out. (The browser's last resort, the status-date text, is left out too: the
    // server never uses it, and every live invoice has a recorded year anyway.)
    inv('C', { filterFiscalYear: null, rawDate: null, date: null }),
    inv('D', { channel: 'poPortal', poPortal: { hod1: 'Hod One', hod2: 'Hod Two', source_approval_stage: 'HOD1', po_type: 'JB' } }),
  ];

  it('keeps invoices with no year for internal users, unless strict, and never for suppliers', () => {
    expect(numbers(filterLocalInvoices(list, { fy: '2026-27' }, true))).toEqual(['A', 'B', 'C', 'D']);
    expect(numbers(filterLocalInvoices(list, { fy: '2026-27', fy_strict: true }, true))).toEqual(['A', 'B', 'D']);
    expect(numbers(filterLocalInvoices(list, { fy: '2026-27' }, false))).toEqual(['A', 'B', 'D']);
    expect(numbers(filterLocalInvoices(list, { fy: '2025-26' }, true))).toEqual(['C']);
  });

  it('filters by channel, statuses, PAN and supplier name', () => {
    expect(numbers(filterLocalInvoices(list, { channel: 'poPortal' }))).toEqual(['D']);
    expect(numbers(filterLocalInvoices(list, { channel: 'all', statuses: ['Paid'] }))).toEqual(['B']);
    expect(numbers(filterLocalInvoices(list, { pan: 'zzzzz9999z' }))).toEqual(['B']);
    expect(numbers(filterLocalInvoices(list, { vendor_name: 'Tata Steel' }))).toEqual(['B']);
  });

  it('uses only the chosen date type for a date range', () => {
    expect(numbers(filterLocalInvoices(list, { date_type: 'invoice', date_from: '2026-06-01', date_to: '2026-06-30' }))).toEqual(['B']);
    expect(numbers(filterLocalInvoices(list, { date_type: 'utr_clearing', date_from: '2026-01-01' }))).toEqual([]);
  });

  it('matches PO Portal approvers across HOD1, HOD2 and accounts', () => {
    expect(numbers(filterLocalInvoices(list, { approver: 'hod two' }))).toEqual(['D']);
    expect(numbers(filterLocalInvoices(list, { po_stage: 'HOD1', po_type: 'JB' }))).toEqual(['D']);
  });

  it('sorts by a date with undated invoices last, in either direction', () => {
    expect(numbers(filterLocalInvoices(list, { sort: 'invoice:desc' }))).toEqual(['B', 'A', 'D', 'C']);
    expect(numbers(filterLocalInvoices(list, { sort: 'invoice:asc' }))).toEqual(['A', 'D', 'B', 'C']);
  });

  it('counts each dropdown without its own selection, and an approver once per invoice', () => {
    const counts = facetsOfList(list, { fields: ['status', 'po_approver'], statuses: ['Paid'] });
    expect(counts.status).toEqual({ Approved: 3, Paid: 1 });
    expect(counts.po_approver).toEqual({}); // the status filter still applies, and D is not paid
    expect(facetsOfList(list, { fields: ['po_approver'] }).po_approver).toEqual({ 'Hod One': 1, 'Hod Two': 1 });
  });
});
