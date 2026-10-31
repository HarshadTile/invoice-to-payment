import { describe, expect, it } from 'vitest';
import { matchesInvoiceQuery, searchInvoiceRows } from './invoiceQuery';

const invoice = {
  no: 'INV/MASTER', po: '650001', poItem: 10, vcode: 'V1', vendor: 'Supplier One',
  productType: 'M', plant: 'H001', dvType: 'AUTO DV', channel: 'msetuSrm', pan: 'ABCDE1234F',
  amount: '₹1,250.50', rawDate: '2026-09-04', rawUploadDate: '2026-09-05', filterFiscalYear: 2027,
  invoiceUploaded: true, status: 'Approved', statusLabel: 'Approved', statusFlag: 'A', utr: 'UTR001',
  workflow: { pending_with: 'Finance Reviewer', approved_by: 'Account Manager',
    approvers: { approver_7: 'Final Reviewer' }, final_approval_date: '2026-09-06',
    document_sent_to_accounts_date: '2026-09-07', approver_remarks: 'Invoice verified',
    rejection_reason: 'Resubmit tax details' },
  sap: { currency: 'INR', payable_amount: 1250.5, miro_status: 'PENDING FOR MIRO', miro_document: 'MIRO1234',
    document_date: '2026-09-08', posting_date: '2026-09-09', net_due_date: '2026-10-01',
    clearing_date: '2026-10-02', utr_clearing_date_paid: '2026-10-03', account_type: 'K' },
};

describe('master invoice search', () => {
  it.each(['Material', 'H001', 'AUTO DV', 'Msetu / SRM', 'ABCDE1234F', '1250.50', 'INR',
    'Approved', 'Finance Reviewer', 'Account Manager', 'Final Reviewer', 'Invoice verified',
    'Resubmit tax details', 'PENDING FOR MIRO', 'MIRO1234', '2026-27', 'Yes',
    '2026-09-04', '04 Sep 2026', '04 Sept 2026', '04/09/2026', '04-09-2026',
    '05 Sep 2026', '06 Sep 2026', '07 Sep 2026', '08 Sep 2026', '09 Sep 2026',
    '01 Oct 2026', '02 Oct 2026', '03 Oct 2026'])('finds the table value %s', (query) => {
    expect(matchesInvoiceQuery(invoice, query)).toBe(true);
  });

  it('distinguishes Service and Material and preserves status counts and comma search', () => {
    const service = { ...invoice, no: 'INV/SERVICE', productType: 'S', status: 'Paid', workflow: {}, sap: {} };
    const results = searchInvoiceRows([invoice, service], 'material');
    expect(results.rows).toEqual([invoice]);
    expect(results.counts.get('Approved')).toBe(1);
    expect(results.counts.has('Paid')).toBe(false);
    expect(matchesInvoiceQuery(service, 'service')).toBe(true);
    expect(matchesInvoiceQuery(invoice, 'INV/MASTER, 650001, 10, UTR001')).toBe(true);
    expect(matchesInvoiceQuery(invoice, 'Material, 650001')).toBe(false);
  });

  it.each(['S050022', 'SES9988', 'CC9001', 'First Supervisor', 'REJECTED', 'Check service attachment', 'SAP_OPERATOR', 'CLAIM777'])('finds PO Portal fields: %s', (query) => {
    expect(matchesInvoiceQuery({ ...invoice, channel: 'poPortal', productType: 'S', poPortal: {
      service: 'S050022', entry_sheet: 'SES9988', cost_center: 'CC9001', hod1: 'First Supervisor',
      hod2_status: 'REJECTED', comments: 'Check service attachment', miro_created_by: 'SAP_OPERATOR', claim_number: 'CLAIM777',
    } }, query)).toBe(true);
  });

  it('refreshes cached text after nested edits, additions, replacement and removal', () => {
    const row = { no: '1', workflow: { pending_with: 'Old Reviewer', approvers: {} } };
    expect(matchesInvoiceQuery(row, 'Old Reviewer')).toBe(true);
    row.workflow.pending_with = 'New Reviewer';
    row.workflow.approvers.approver_7 = 'Final Supervisor';
    expect(matchesInvoiceQuery(row, 'Old Reviewer')).toBe(false);
    expect(matchesInvoiceQuery(row, 'Final Supervisor')).toBe(true);
    row.workflow = { pending_with: 'Replacement Reviewer' };
    expect(matchesInvoiceQuery(row, 'Final Supervisor')).toBe(false);
    expect(matchesInvoiceQuery(row, 'Replacement Reviewer')).toBe(true);
    delete row.workflow.pending_with;
    expect(matchesInvoiceQuery(row, 'Replacement Reviewer')).toBe(false);
  });

  it('does not match redacted names, metadata, object keys or missing-value placeholders', () => {
    const internal = { no: '1', workflow: { approved_by: 'Restricted Approver' } };
    expect(matchesInvoiceQuery(internal, 'Restricted Approver')).toBe(true);
    const supplier = { no: '1', vendor: '-', po: '-', workflow: { approved_by: null }, sourceId: 'PrivateIdentifier',
      credentials: 'HiddenPassword', sap: { currency: 'INR', unknown_token: 'HiddenToken' }, utr: '-' };
    for (const query of ['Restricted Approver', 'PrivateIdentifier', 'HiddenPassword', 'HiddenToken', 'currency', '-']) {
      expect(matchesInvoiceQuery(supplier, query)).toBe(false);
    }
    expect(matchesInvoiceQuery({ no: '1', invoiceUploaded: false }, 'No')).toBe(true);
  });
});
