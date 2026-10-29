import { describe, expect, it } from 'vitest';
import { matchesSrmWorkspace, srmColumns, srmHistoryRows, srmCell } from './srmWorkspace';
import { findInvoice } from './businessLogic';

const invoice = {
  no: 'INV/1', vcode: 'V1', vendor: 'Acme', pan: 'ABCDE1234F', po: 'PO1', poItem: 10,
  rawDate: '2026-10-01', rawUploadDate: '2026-10-02', status: 'Approved',
  workflow: { pending_with: 'Reviewer', approved_by: 'Manager', final_approval_date: '2026-10-03',
    approvers: { approver_1: 'First', approver_7: 'Last Approver' } },
  sap: { miro_status: 'PENDING FOR MIRO' },
};

describe('SRM workspace source behavior', () => {
  it('matches all approval levels and combines filters with dates and payment state', () => {
    expect(matchesSrmWorkspace(invoice, { approver: ' last ', pending_with: 'review', approved_by: 'MANAGER',
      miro_status: 'pending', payment_status: 'unpaid', date_from: '2026-10-02', date_to: '2026-10-02' }, 'upload')).toBe(true);
    for (const filters of [{ approver: 'Missing' }, { pending_with: 'Other' }, { approved_by: 'Other' },
      { miro_status: 'booked' }, { payment_status: 'paid' }, { date_from: '2026-10-03' }]) {
      expect(matchesSrmWorkspace(invoice, filters, 'upload')).toBe(false);
    }
    expect(matchesSrmWorkspace(invoice, { q: 'abcde1234f' })).toBe(true);
    expect(matchesSrmWorkspace(invoice, { q: 'INV/1,PO1,10' })).toBe(true);
  });
  it('does not invent pending MIRO, payment evidence or date milestones', () => {
    expect(matchesSrmWorkspace({ ...invoice, sap: {} }, { miro_status: 'pending' })).toBe(false);
    expect(matchesSrmWorkspace(invoice, { date_from: '2026-10-01' }, 'due')).toBe(false);
    expect(matchesSrmWorkspace({ ...invoice, utr: 'UTR1' }, { payment_status: 'paid' })).toBe(true);
    const history = srmHistoryRows([invoice]);
    expect(history.map((entry) => entry.event)).toEqual(['Invoice dated', 'Invoice uploaded', 'Invoice approved']);
    expect(history[2].performedBy).toBe('Manager');
    expect(history.some((entry) => /rejected|assigned|MIRO/i.test(entry.event))).toBe(false);
  });
  it('keeps pinned identity columns in every preset and displays missing source values as dashes', () => {
    for (const preset of ['standard', 'approvals', 'all', 'custom']) {
      const columns = srmColumns('Invoice Log', { preset, columns: ['approver7'] });
      expect(columns.slice(0, 2).map((entry) => entry.key)).toEqual(['invoice', 'vendor']);
    }
    expect(srmColumns('Approver Assignment').filter((entry) => /^approver\d$/.test(entry.key))).toHaveLength(7);
    const all = srmColumns('Invoice Log', { preset: 'all' });
    expect(srmCell(invoice, all.find((entry) => entry.key === 'miroDate'))).toBe('-');
    expect(srmCell(invoice, all.find((entry) => entry.key === 'approver7'))).toBe('Last Approver');
  });
  it('resolves repeated invoice numbers using vendor, PO and item', () => {
    const other = { ...invoice, vcode: 'V2', po: 'PO2' };
    expect(findInvoice('INV/1', 10, [other, invoice], { vcode: 'V1', po: 'PO1' })).toBe(invoice);
    expect(findInvoice('INV/1', 999, [other, invoice], { vcode: 'V1', po: 'PO1' })).toBeUndefined();
  });
});
