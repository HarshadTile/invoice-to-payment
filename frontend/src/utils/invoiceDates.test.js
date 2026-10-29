import { describe, expect, it } from 'vitest';
import { INVOICE_DATE_FIELDS, invoiceFilterDate } from './invoiceDates';

describe('date type selection', () => {
  const inv = { rawDate: '2026-01-01', rawUploadDate: '2026-02-02',
    workflow: { final_approval_date: '2026-03-03', document_sent_to_accounts_date: '2026-04-04' },
    sap: { document_date: '2026-05-05', net_due_date: '2026-06-06', clearing_date: '2026-07-07',
      posting_date: '2026-08-08', utr_clearing_date_paid: '2026-09-09' } };
  it.each([
    ['invoice', '2026-01-01'], ['upload', '2026-02-02'], ['approval', '2026-03-03'],
    ['miro', '2026-05-05'],
    ['due', '2026-06-06'], ['utr_clearing', '2026-09-09'],
  ])('uses the actual %s date', (type, expected) => {
    expect(invoiceFilterDate(inv, type)).toBe(expected);
  });
  it('does not substitute invoice date for missing milestone dates', () => {
    for (const field of INVOICE_DATE_FIELDS.filter((entry) => entry.value !== 'invoice')) {
      expect(invoiceFilterDate({ rawDate: '2026-01-01', date: '01 Jan 2026' }, field.value)).toBe('');
    }
    expect(invoiceFilterDate({ rawDate: null, date: '01 Jan 2026' })).toBe('');
  });
});
