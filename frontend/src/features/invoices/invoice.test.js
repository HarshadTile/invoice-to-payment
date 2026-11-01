import { describe, it, expect } from 'vitest';
import { combinedStatusFor, currentStageName, findInvoice, handlerFor, invoiceProductType } from './invoice';

const rows = [
  { no: 'INV-1', poItem: 10, vcode: 'V1', po: 'P1', channel: 'msetuSrm', status: 'Paid' },
  { no: 'INV-1', poItem: 20, vcode: 'V1', po: 'P1', channel: 'msetuSrm', status: 'Approved' },
  { no: 'INV-2', poItem: 10, vcode: 'V2', po: 'P2', channel: 'poPortal', sourceId: 'S2', status: 'Rejected' },
];

describe('findInvoice', () => {
  it('uses the PO item to pick the right line of a repeated invoice number', () => {
    expect(findInvoice('INV-1', 20, rows).status).toBe('Approved');
    expect(findInvoice('INV-1', '10', rows).status).toBe('Paid');
  });

  it('falls back to the first match without a PO item, and returns undefined when missing', () => {
    expect(findInvoice('INV-1', undefined, rows).poItem).toBe(10);
    expect(findInvoice('NOPE', undefined, rows)).toBeUndefined();
  });

  it('narrows by identity (channel, source id, vendor code)', () => {
    expect(findInvoice('INV-2', null, rows, { channel: 'msetuSrm' })).toBeUndefined();
    expect(findInvoice('INV-2', null, rows, { sourceId: 'S2' }).vcode).toBe('V2');
    expect(findInvoice('INV-1', 99, rows, { vcode: 'V1' })).toBeUndefined();
  });
});

describe('invoice labels', () => {
  it('shows who handles the invoice, or "-"', () => {
    expect(handlerFor({ workflow: { pending_with: 'HOD1', accountant: 'Asha' } })).toMatchObject({ approver: 'HOD1', accounts: 'Asha' });
    expect(handlerFor({})).toMatchObject({ approver: '-', accounts: '-' });
  });

  it('names the current stage from the real status', () => {
    expect(currentStageName({ status: 'Entry Deleted' })).toBe('Entry Deleted');
    expect(currentStageName({})).toBe('Invoice Uploaded');
  });

  it('maps product codes', () => {
    expect(invoiceProductType({ productType: 'S' })).toBe('Service');
    expect(invoiceProductType({ productType: 'M' })).toBe('Material');
    expect(invoiceProductType({})).toBe('-');
  });

  it.each([
    ['Paid', 'Fully Paid', 'green'],
    ['Miro Booked', 'Unpaid', 'blue'],
    ['Rejected', 'Rejected', 'red'],
    ['Action Required', 'Action Required', 'amber'],
    ['Push to PO Portal', 'Push to PO Portal', 'gray'],
    ['Pending for Approval', 'In Approval', 'amber'],
  ])('combined status for %s is %s', (status, label, tone) => {
    expect(combinedStatusFor({ status })).toMatchObject({ label, tone });
  });
});
