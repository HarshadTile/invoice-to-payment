import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import uiReducer from '../../features/ui/uiSlice';
import { setRuntimeData } from '../../data/runtime';
import { downloadCSV } from '../../utils/businessLogic';
import InvoiceTable from './InvoiceTable.jsx';
import InvoiceProgressCard from './InvoiceProgressCard.jsx';
import SupplierInvoiceDetailModal from '../modals/SupplierInvoiceDetailModal.jsx';

vi.mock('../../utils/businessLogic', async (importOriginal) => ({
  ...await importOriginal(), downloadCSV: vi.fn(),
}));

const invoice = {
  no: 'INV/1', po: '650001', poItem: 10, channel: 'msetuSrm', vcode: 'V1', vendor: 'Supplier',
  productType: 'M', status: 'Paid', amount: 'INR 100.00', utr: 'UTR123', date: '06 Oct 2026',
  rawDate: '2026-10-01', rawUploadDate: '2026-10-02',
  workflow: { final_approval_date: '2026-10-03', approved_by: 'Internal Approver', approver_remarks: 'Private remark' },
  sap: { document_date: '2026-10-04', net_due_date: '2026-10-05', clearing_date: '2026-10-06' },
};

function show(component) {
  const store = configureStore({ reducer: { ui: uiReducer, auth: () => ({ authType: 'supplier', channelScope: 'all' }) } });
  return render(<Provider store={store}><MemoryRouter>{component}</MemoryRouter></Provider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  setRuntimeData({ invoices: [invoice], syncLog: [] });
});

describe('supplier invoice fields', () => {
  it('shows product type and due date in the table and exported rows', () => {
    show(<InvoiceTable invoices={[invoice]} tableKey="supplier-fields" mode="supplierSafe" />);
    expect(screen.getByRole('columnheader', { name: /Product Type/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Payment Due Date/ })).toBeTruthy();
    expect(screen.getByText('Material')).toBeTruthy();
    expect(screen.getByText('05 Oct 2026')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Owner' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Export to Excel (1)' }));
    const [, columns, rows] = downloadCSV.mock.lastCall;
    expect(rows[0][columns.indexOf('Product Type')]).toBe('Material');
    expect(rows[0][columns.indexOf('Payment Due Date')]).toBe('05 Oct 2026');
  });

  it('shows the source dates and payment UTR in details without internal information', () => {
    show(<SupplierInvoiceDetailModal ctx={{ no: 'INV/1', poItem: 10 }} />);
    for (const [label, value] of [
      ['PO Item', '10'], ['Product Type', 'Material'], ['Invoice Date', '01 Oct 2026'], ['Upload Date', '02 Oct 2026'],
      ['Approval Date', '03 Oct 2026'], ['MIRO Booked Date', '04 Oct 2026'],
      ['Payment Due Date', '05 Oct 2026'], ['Payment Date', '06 Oct 2026'], ['UTR No.', 'UTR123'],
    ]) expect(screen.getByText(label).parentElement.textContent).toContain(value);
    expect(screen.queryByText('Internal Approver')).toBeNull();
    expect(screen.queryByText('Private remark')).toBeNull();
  });

  it('sorts by due date and leaves invoices without a due date last', () => {
    const early = { ...invoice, no: 'EARLY', productType: 'S' };
    const late = { ...invoice, no: 'LATE', sap: { net_due_date: '2026-11-01' } };
    const missing = { ...invoice, no: 'MISSING', sap: {} };
    show(<InvoiceTable invoices={[early, late, missing]} tableKey="supplier-sort" mode="supplierSafe" />);
    expect(screen.getByText('Service')).toBeTruthy();
    const order = () => screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent);
    fireEvent.click(screen.getByRole('button', { name: /Payment Due Date/ }));
    expect(order()).toEqual(['LATE', 'EARLY', 'MISSING']);
    fireEvent.click(screen.getByRole('button', { name: /Payment Due Date/ }));
    expect(order()).toEqual(['EARLY', 'LATE', 'MISSING']);
  });

  it('keeps each date under its timeline step and shows due date separately', () => {
    show(<InvoiceProgressCard inv={invoice} />);
    for (const [step, date] of [['Initial', '01 Oct 2026'], ['Invoice Uploaded', '02 Oct 2026'],
      ['Approved', '03 Oct 2026'], ['Miro Booked', '04 Oct 2026'], ['Paid', '06 Oct 2026 (UTR123)']]) {
      expect(within(screen.getByText(step).parentElement).getByText(date)).toBeTruthy();
    }
    expect(screen.getByText('Payment Due Date').parentElement.textContent).toContain('05 Oct 2026');
    expect(screen.queryByText('Level Approved')).toBeNull();
  });

  it('shows rejection reason clearly and never calls it a short payment', () => {
    const rejected = { ...invoice, status: 'Rejected', rejectionReason: 'PO amount mismatch', shortPayReason: 'PO amount mismatch' };
    setRuntimeData({ invoices: [rejected], syncLog: [] });
    const view = show(<InvoiceProgressCard inv={rejected} />);
    expect(screen.getByRole('alert').textContent).toContain('Rejection reason');
    expect(screen.getByRole('alert').textContent).toContain('PO amount mismatch');
    expect(screen.queryByText('Reason for Less Paid')).toBeNull();
    view.unmount();
    const details = show(<SupplierInvoiceDetailModal ctx={{ no: rejected.no, poItem: 10 }} />);
    expect(screen.getByRole('alert').textContent).toContain('PO amount mismatch');
    details.unmount();
    show(<InvoiceTable invoices={[rejected]} tableKey="supplier-rejected" mode="supplierSafe" />);
    expect(screen.getByText('Rejection reason:').parentElement.textContent).toContain('PO amount mismatch');
  });

  it('leaves missing dates empty instead of substituting an invoice date', () => {
    const missing = { ...invoice, rawUploadDate: null, workflow: {}, sap: {} };
    setRuntimeData({ invoices: [missing], syncLog: [] });
    show(<SupplierInvoiceDetailModal ctx={{ no: missing.no, poItem: 10 }} />);
    for (const label of ['Upload Date', 'Approval Date', 'MIRO Booked Date', 'Payment Due Date', 'Payment Date']) {
      expect(screen.getByText(label).parentElement.textContent).toBe(`${label}-`);
    }
  });
});
