import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import uiReducer from '../../features/ui/uiSlice';
import ChannelPage from '../../pages/ChannelPage.jsx';
import { setRuntimeData } from '../../data/runtime';
import { downloadCSV } from '../../utils/businessLogic';
import { api } from '../../api/client';

vi.mock('../../api/client', () => ({ api: { get: vi.fn(async () => []) } }));
vi.mock('../../utils/businessLogic', async (importOriginal) => ({ ...await importOriginal(), downloadCSV: vi.fn() }));

const a = { no: 'INV-A', vendor: 'Vendor A', vcode: 'V1', pan: 'ABCDE1234F', po: 'PO1', poItem: 10,
  channel: 'msetuSrm', productType: 'S', plant: 'H001', dvType: 'AUTO DV', status: 'Approved', statusFlag: 'A',
  statusLabel: 'Approved', invoiceUploaded: true, rawDate: '2026-10-01', rawUploadDate: '2026-10-02', amount: '-', utr: '-',
  workflow: { pending_with: 'Reviewer A', approved_by: 'Manager A', final_approval_date: '2026-10-03', approvers: { approver_7: 'Alice' }, approver_remarks: 'Checked source' },
  sap: { miro_status: 'PENDING FOR MIRO', currency: 'INR', net_due_date: '2026-11-01' } };
const b = { ...a, no: 'INV-B', vcode: 'V2', vendor: 'Vendor B', status: 'Paid', utr: 'UTR-B',
  workflow: { approvers: { approver_1: 'Bob' } }, sap: { miro_status: 'MIRO BOOKED', clearing_date: '2026-10-10' } };
const c = { ...a, no: 'INV-C', workflow: { approvers: { approver_1: 'Bob' } }, sap: { miro_status: 'MIRO BOOKED' } };
let dataVersion = 0;

function show(invoices = [a, b, c]) {
  setRuntimeData({ invoices, syncLog: [] });
  const store = configureStore({ reducer: { ui: uiReducer,
    auth: () => ({ authType: 'internal', role: 'Admin', channelScope: 'all' }),
    settings: () => ({ channelAvailability: { msetuSrm: true } }) },
  preloadedState: { ui: { ...uiReducer(undefined, { type: 'init' }), dataVersion: ++dataVersion, scope: { fy: 'all' }, pageFilters: {}, channelViewTab: {} } } });
  render(<Provider store={store}><MemoryRouter initialEntries={['/app/channel/msetuSrm']}>
    <Routes><Route path="/app/channel/:key" element={<ChannelPage />} /></Routes>
  </MemoryRouter></Provider>);
  return store;
}

beforeEach(() => vi.clearAllMocks());

describe('detailed SRM workspace', () => {
  it('keeps approval filters active across every SRM tab and scopes query history', async () => {
    api.get.mockResolvedValue([
      { id: 1, invoice_no: 'INV-A', vendor_code: 'V1', channel: 'msetuSrm', event: 'Query assigned', created_at: '2026-10-04T00:00:00Z' },
      { id: 2, invoice_no: 'INV-B', vendor_code: 'V2', event: 'Unrelated query', created_at: '2026-10-04T00:00:00Z' },
      { id: 3, invoice_no: null, event: 'Unlinked query', created_at: '2026-10-04T00:00:00Z' },
    ]);
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Approver' }));
    fireEvent.click(screen.getByRole('option', { name: 'Alice' }));
    expect(screen.queryByRole('button', { name: 'INV-B' })).toBeNull();
    for (const tab of ['Approver Assignment', 'SAP Booking (MIRO)', 'Payment & UTR (FBL1N)']) {
      fireEvent.click(screen.getByRole('button', { name: tab }));
      expect(screen.getByRole('button', { name: 'INV-A' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'INV-B' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'INV-C' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Export to Excel (1)' })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    await waitFor(() => expect(screen.getByText('Query assigned')).toBeTruthy());
    expect(screen.queryByText('Unrelated query')).toBeNull();
    expect(screen.queryByText('Unlinked query')).toBeNull();
    expect(screen.getByText('Invoice dated')).toBeTruthy();
  });

  it('shows all seven approvers, preserves per-tab columns, and exports beyond the visible page', () => {
    const store = show(Array.from({ length: 25 }, (_, index) => ({ ...a, no: `INV-${index}`, poItem: index + 1 })));
    expect(screen.getByRole('columnheader', { name: 'PAN' })).toBeTruthy();
    fireEvent.click(screen.getByText('Columns'));
    fireEvent.change(screen.getByLabelText('Column preset'), { target: { value: 'all' } });
    expect(screen.getByRole('columnheader', { name: 'Approver 7' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Export to Excel (25)' }));
    const [, columns, rows] = downloadCSV.mock.lastCall;
    expect(rows).toHaveLength(25);
    expect(rows[0][columns.indexOf('Approver 7')]).toBe('Alice');
    expect(columns).toContain('Sent to Accounts Date');
    fireEvent.click(screen.getByRole('button', { name: 'Approver Assignment' }));
    expect(screen.getByRole('columnheader', { name: 'Approver 1' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Approver 7' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: /^Posting Date/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Invoice Log' }));
    expect(screen.getByRole('columnheader', { name: /^Posting Date/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(screen.getByRole('button', { name: 'INV-24' }));
    expect(store.getState().ui.modal.ctx).toEqual({ no: 'INV-24', poItem: 25, vcode: 'V1', po: 'PO1', channel: 'msetuSrm', sourceId: undefined });
  });

  it('combines payment, MIRO, date, search and approver filters and clears them together', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Payment Status' }));
    fireEvent.click(screen.getByRole('option', { name: 'Unpaid' }));
    fireEvent.click(screen.getByRole('button', { name: 'MIRO Status' }));
    fireEvent.click(screen.getByRole('option', { name: 'Booked' }));
    expect(screen.getByRole('button', { name: 'INV-C' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'INV-A' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Search SRM invoices'), { target: { value: 'INV-C' } });
    fireEvent.change(screen.getByLabelText('Invoice Date From'), { target: { value: '2026-10-02' } });
    expect(screen.getByText('No invoices match these filters.')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Remove all filters'));
    expect(screen.getByRole('button', { name: 'INV-A' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'INV-B' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'INV-C' })).toBeTruthy();
  });

  it('allows column selection while keeping invoice and vendor pinned', () => {
    show([a]);
    fireEvent.click(screen.getByText('Columns'));
    expect(screen.getByRole('checkbox', { name: 'Invoice No' }).disabled).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'Vendor', exact: true }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'PAN' }));
    expect(screen.queryByRole('columnheader', { name: 'PAN' })).toBeNull();
    expect(screen.getByLabelText('Column preset').value).toBe('custom');
    const headers = within(screen.getAllByRole('row')[0]).getAllByRole('columnheader');
    expect(headers[0].textContent).toBe('Invoice No');
    expect(headers[1].textContent).toBe('Vendor');
  });
});
