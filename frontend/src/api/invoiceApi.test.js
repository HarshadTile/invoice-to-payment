import { describe, expect, it } from 'vitest';
import { toWorkspaceInvoice } from './invoiceApi';
import { invoiceFiscalYear, matchesSrmFilters } from '../features/invoices/selectors';
import { invoiceYMD } from '../components/invoices/InvoiceFilterBar.jsx';
import { channelViewRows } from '../utils/businessLogic';

const source = {
  invoice_number: 'INV/1', invoice_date: '2025-12-31', invoice_upload_date: '2026-10-01',
  product_type: 'M', invoice_type: 'Material', plant: 'H001', filter_fiscal_year: 2027,
  overall_status: 'Miro Booked', status_label: 'Approved',
  status_flag: 'A', invoice_uploaded: true,
  purchase_order: { po_number: '650001', po_item: 10 },
  supplier: { vendor_code: 'V1', supplier_name: 'Supplier', pan: 'ABCDE1234F' },
  workflow: { final_approval_date: '2026-10-02' },
  sap: { payable_amount: '0', amount: '500', cash_discount_base: '999', currency: 'INR',
    document_date: '2026-10-03', clearing_date: '2026-10-10', net_due_date: '2026-11-01', utr_number: 'UTR1' },
};

describe('SRM invoice adapter', () => {
  it('uses payable amount, including zero, and retains filter fields', () => {
    const inv = toWorkspaceInvoice(source);
    expect(inv.amount).toContain('0.00');
    expect(inv.amount).not.toContain('999');
    expect(inv.productType).toBe('M');
    expect(inv.invoiceType).toBe('Material');
    expect(inv.plant).toBe('H001');
    expect(inv.statusFlag).toBe('A');
    expect(inv.invoiceUploaded).toBe(true);
    expect(inv.utr).toBe('UTR1');
    expect(invoiceFiscalYear(inv)).toBe('2026-27');
    expect(invoiceYMD(inv)).toBe('2025-12-31');
    expect(invoiceYMD(inv, 'upload')).toBe('2026-10-01');
    expect(matchesSrmFilters(inv, { productType: 'M', plant: 'H001' })).toBe(true);
    expect(matchesSrmFilters(inv, { productType: 'S' })).toBe(false);
  });

  it.each([
    ['Invoice Uploaded', '01 Oct 2026'], ['Approved', '02 Oct 2026'],
    ['Miro Booked', '03 Oct 2026'], ['Paid', '10 Oct 2026'],
  ])('uses the source date for %s', (status, date) => {
    expect(toWorkspaceInvoice({ ...source, overall_status: status }).date).toBe(date);
  });

  it('leaves unavailable payable amounts and milestone dates empty', () => {
    const inv = toWorkspaceInvoice({ ...source, overall_status: 'Paid', invoice_upload_date: null,
      sap: { cash_discount_base: 999 } });
    expect(inv.amount).toBe('-');
    expect(inv.date).toBe('-');
    expect(invoiceYMD(inv, 'upload')).toBe('');
  });

  it('shows real MIRO/due/payment dates without manufacturing document numbers', () => {
    const inv = toWorkspaceInvoice(source);
    const booked = channelViewRows('msetuSrm', 'SAP Booking (MIRO)', [inv])[0];
    expect(booked).toEqual(['INV/1', '-', '-', '03 Oct 2026', '01 Nov 2026']);
    const payment = channelViewRows('msetuSrm', 'Payment & UTR (FBL1N)', [{ ...inv, status: 'Paid' }])[0];
    expect(payment[2]).toBe('10 Oct 2026');
    expect(payment[3]).toBe('UTR1');
  });
});
