import { describe, expect, it } from 'vitest';
import { filterLogRows, invoiceLogRows, logRowsToCsv, queryLogRows, staffQueryLogRows } from './supplierLog';

const paid = {
  no: 'INV-1', po: '3400878804', poItem: 10, status: 'Paid', utr: 'UTR123', amount: '₹1,00,000.00',
  rawDate: '2026-07-10',
  workflow: { final_approval_date: '2026-07-15' },
  sap: { document_date: '2026-07-20', net_due_date: '2026-08-30', clearing_date: '2026-08-28' },
};
const rejected = { no: 'INV-2', po: '55', poItem: '', status: 'Rejected', utr: '-', rawDate: '2026-07-01', shortPayReason: 'PO mismatch', sap: {}, workflow: {} };

describe('supplier log', () => {
  it('builds dated milestones, a payment record and drops events without a real date', () => {
    const rows = invoiceLogRows([paid, rejected]);
    const forPaid = rows.filter((r) => r.invoiceNo === 'INV-1').map((r) => `${r.type}:${r.event}`);
    expect(forPaid).toEqual([
      'Invoice:Invoice uploaded', 'Invoice:Invoice approved', 'Invoice:Booked in SAP', 'Payment:Payment completed',
    ]);
    const booked = rows.find((r) => r.event === 'Booked in SAP');
    expect(booked.detail).toMatch(/^Payment due 30 Aug 2026$/);
    expect(rows.find((r) => r.event === 'Payment completed').detail).toBe('UTR UTR123 · ₹1,00,000.00');
    // The rejected invoice has no approval/booking dates, so those rows don't exist.
    expect(rows.filter((r) => r.invoiceNo === 'INV-2').map((r) => r.event)).toEqual(['Invoice uploaded', 'Invoice rejected']);
    expect(rows.find((r) => r.event === 'Invoice rejected').detail).toBe('PO mismatch');
  });

  it('adds query activity, only for invoices in scope when a scope is applied', () => {
    const entries = [
      { id: 1, ticket_id: 'T1', ticket_no: 'QRY-000001', invoice_no: 'INV-1', subject: 'Late payment', event: 'Query raised', created_at: '2026-10-06T10:52:50Z' },
      { id: 2, ticket_id: 'T2', ticket_no: 'QRY-000002', invoice_no: 'INV-OTHER-FY', subject: 'x', event: 'Query raised', created_at: '2026-10-06T11:00:00Z' },
    ];
    const scoped = queryLogRows(entries, [paid], true);
    expect(scoped).toHaveLength(1);
    expect(scoped[0]).toMatchObject({ type: 'Query', invoiceNo: 'INV-1', po: '3400878804', ticketId: 'T1', hasTime: true });
    expect(queryLogRows(entries, [paid], false)).toHaveLength(2);
  });

  it('builds the staff view with who did it, vendor code and channel', () => {
    const entries = [{
      id: 5, ticket_id: 'T1', ticket_no: 'QRY-000001', invoice_no: 'INV-1', vendor_code: 'DIT1', channel: 'msetuSrm',
      subject: 'Late payment', event: 'Assigned', detail: 'to Priya', performed_by: 'Ravi', created_at: '2026-10-06T10:52:50Z',
    }];
    const [row] = staffQueryLogRows(entries, [paid], false);
    expect(row).toMatchObject({ type: 'Query', performedBy: 'Ravi', vcode: 'DIT1', channel: 'msetuSrm', po: '3400878804' });
    expect(row.detail).toBe('QRY-000001 · Late payment · to Priya');
    // invoice milestones come from the system, not a person
    expect(invoiceLogRows([paid])[0].performedBy).toBe('System');
    expect(filterLogRows([row], { channel: 'poPortal' })).toHaveLength(0);
    expect(filterLogRows([row], { search: 'ravi' })).toHaveLength(1);
    const csv = logRowsToCsv([row], { staff: true });
    expect(csv.split('\r\n')[0]).toBe('"Date","Invoice No","Vendor Code","PO No","Type","Event","Performed By","Details"');
    expect(csv).toContain('"Ravi"');
  });

  it('filters by type, text and date range, newest first', () => {
    const rows = invoiceLogRows([paid]);
    expect(filterLogRows(rows, { type: 'Payment' })).toHaveLength(1);
    expect(filterLogRows(rows, { search: 'utr123' })).toHaveLength(1);
    expect(filterLogRows(rows, { from: '2026-07-16', to: '2026-07-31' }).map((r) => r.event)).toEqual(['Booked in SAP']);
    const all = filterLogRows(rows, {});
    expect(all[0].event).toBe('Payment completed');
    expect(all[all.length - 1].event).toBe('Invoice uploaded');
  });

  it('exports CSV with quoting', () => {
    const csv = logRowsToCsv(filterLogRows(invoiceLogRows([rejected]), {}));
    expect(csv.split('\r\n')[0]).toBe('"Date","Invoice No","PO No","Type","Event","Details"');
    expect(csv).toContain('"PO mismatch"');
  });
});
