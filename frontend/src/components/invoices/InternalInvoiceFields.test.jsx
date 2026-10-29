import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import uiReducer from '../../features/ui/uiSlice';
import { downloadCSV } from '../../utils/businessLogic';
import InvoiceTable from './InvoiceTable.jsx';

vi.mock('../../utils/businessLogic', async (importOriginal) => ({
  ...await importOriginal(), downloadCSV: vi.fn(),
}));

const invoice = {
  no: 'INV/INTERNAL', po: '650001', poItem: 20, productType: 'S', plant: 'H001', dvType: 'AUTO DV',
  channel: 'msetuSrm', vcode: 'V1', vendor: 'Supplier', status: 'Rejected',
  rawDate: '2026-10-01', rawUploadDate: '2026-10-02', date: '03 Oct 2026', amount: '-', utr: '-',
  workflow: { pending_with: 'Pending Reviewer', approved_by: 'Previous Approver', rejection_reason: 'PO mismatch' },
  sap: { net_due_date: '2026-11-01' },
};

function show(invoices = [invoice], props = {}) {
  const store = configureStore({ reducer: { ui: uiReducer, auth: () => ({ authType: 'internal', channelScope: 'all' }) } });
  render(<Provider store={store}><MemoryRouter><InvoiceTable invoices={invoices} tableKey="internal-fields" {...props} /></MemoryRouter></Provider>);
  return store;
}

beforeEach(() => vi.clearAllMocks());

describe('internal invoice fields', () => {
  it('shows source fields and pending reviewer, without duplicate stage or placeholder owner', () => {
    const store = show();
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent.replace(/[⇅▲▼]/g, ''));
    const cells = within(screen.getAllByRole('row')[1]).getAllByRole('cell');
    const read = (label) => cells[headers.indexOf(label)].textContent;
    expect(read('PO Item')).toBe('20');
    expect(read('Product Type')).toBe('Service');
    expect(read('Plant Code')).toBe('H001');
    expect(read('Division')).toBe('AUTO DV');
    expect(read('Upload Date')).toBe('02 Oct 2026');
    expect(read('Payment Due Date')).toBe('01 Nov 2026');
    expect(read('Pending With')).toBe('Pending Reviewer');
    expect(read('Rejection Reason')).toBe('PO mismatch');
    expect(headers).not.toContain('Owner');
    expect(headers).not.toContain('Current Stage');
    expect(cells).toHaveLength(headers.length);
    expect(screen.queryByText('Previous Approver')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: invoice.no }));
    expect(store.getState().ui.modal.ctx).toEqual({ no: invoice.no, poItem: 20, vcode: invoice.vcode, po: invoice.po, channel: invoice.channel, sourceId: undefined });
  });

  it('exports the same columns and source values shown in the table', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Export to Excel (1)' }));
    const [, columns, rows] = downloadCSV.mock.lastCall;
    expect(rows[0]).toHaveLength(columns.length);
    expect(rows[0][columns.indexOf('PO Item')]).toBe(20);
    expect(rows[0][columns.indexOf('Product Type')]).toBe('Service');
    expect(rows[0][columns.indexOf('Plant Code')]).toBe('H001');
    expect(rows[0][columns.indexOf('Division')]).toBe('AUTO DV');
    expect(rows[0][columns.indexOf('Upload Date')]).toBe('02 Oct 2026');
    expect(rows[0][columns.indexOf('Payment Due Date')]).toBe('01 Nov 2026');
    expect(rows[0][columns.indexOf('Pending With')]).toBe('Pending Reviewer');
    expect(rows[0][columns.indexOf('Rejection Reason')]).toBe('PO mismatch');
    expect(columns).not.toContain('Owner');
    expect(columns).not.toContain('Current Stage');
  });

  it('sorts by upload date without replacing missing dates', () => {
    show([invoice, { ...invoice, no: 'LATER', rawUploadDate: '2026-10-20' },
      { ...invoice, no: 'MISSING', rawUploadDate: null }]);
    fireEvent.click(screen.getByRole('button', { name: /Upload Date/ }));
    const order = screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent);
    expect(order).toEqual(['LATER', invoice.no, 'MISSING']);
  });

  it('keeps missing values empty and does not substitute approved-by for pending-with', () => {
    show([{ ...invoice, poItem: null, productType: null, plant: null, dvType: null,
      rawUploadDate: null, workflow: { approved_by: 'Past Approver' }, sap: {} }]);
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent.replace(/[⇅▲▼]/g, ''));
    const cells = within(screen.getAllByRole('row')[1]).getAllByRole('cell');
    for (const label of ['PO Item', 'Product Type', 'Plant Code', 'Division', 'Upload Date', 'Payment Due Date', 'Pending With']) {
      expect(cells[headers.indexOf(label)].textContent).toBe('-');
    }
    expect(cells[headers.indexOf('Rejection Reason')].textContent).toBe('Not provided');
    expect(screen.queryByText('Past Approver')).toBeNull();
  });

  it('spans every internal column when there are no results', () => {
    show([], { bulk: true });
    expect(screen.getByText('No invoices match').closest('td').colSpan).toBe(screen.getAllByRole('columnheader').length);
  });
});
