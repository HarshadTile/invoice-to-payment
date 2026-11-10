import { describe, expect, it } from 'vitest';
import { notificationLabel, notificationRef, notificationSubject } from './notifications';

describe('supplier account notifications', () => {
  it('welcomes a new account and shortens a long code list', () => {
    const item = { type: 'SUPPLIER_ACCOUNT_CREATED', payload: { vendor_codes: ['A1', 'A2', 'A3', 'A4', 'A5'] } };
    expect(notificationLabel(item)).toBe('Welcome to the supplier portal');
    expect(notificationRef(item)).toBe('Your account');
    expect(notificationSubject(item)).toBe('Vendor codes: A1, A2, A3 +2 more');
  });

  it('says what an approval added and removed, with the team note', () => {
    const item = { type: 'SUPPLIER_CODES_APPROVED', payload: { added: ['A1'], removed: ['B1'], note: 'Done' } };
    expect(notificationRef(item)).toBe('Vendor codes');
    expect(notificationSubject(item)).toBe('Added A1 · Removed B1 · Done');
  });

  it('says so when an approval changed nothing', () => {
    const item = { type: 'SUPPLIER_CODES_APPROVED', payload: { added: [], removed: [], note: null } };
    expect(notificationSubject(item)).toBe('No change to your vendor codes');
  });

  it('shows the rejection reason and note, or just the note', () => {
    const type = 'SUPPLIER_CODES_REJECTED';
    expect(notificationSubject({ type, payload: { reason: 'the details do not match', note: 'Check the PAN.' } }))
      .toBe('Reason: the details do not match · Check the PAN.');
    expect(notificationSubject({ type, payload: { reason: null, note: 'Call us.' } })).toBe('Call us.');
  });

  it('leaves query notifications as they were', () => {
    expect(notificationRef({ type: 'TICKET_CREATED' })).toBe('Query');
    expect(notificationSubject({ type: 'TICKET_CREATED' })).toBe('');
  });
});
