import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import uiReducer from '../../features/ui/uiSlice';
import ChannelPage from '../../pages/ChannelPage.jsx';
import { setRuntimeData } from '../../data/runtime';
import { downloadCSV } from '../../utils/businessLogic';
import { api } from '../../api/client';
import { selectFilteredInvoices } from '../../features/invoices/selectors';

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

function Location() { return <output data-testid="location">{useLocation().search}</output>; }
function show(invoices = [a, b, c], { saved = {}, url = '/app/channel/msetuSrm' } = {}) {
  setRuntimeData({ invoices, syncLog: [] });
  const store = configureStore({ reducer: { ui: uiReducer,
    auth: () => ({ authType: 'internal', role: 'Admin', channelScope: 'all' }),
    settings: () => ({ channelAvailability: { msetuSrm: true } }) },
  preloadedState: { ui: { ...uiReducer(undefined, { type: 'init' }), dataVersion: ++dataVersion, scope: { fy: 'all' }, pageFilters: { srmWorkspace: saved }, channelViewTab: {} } } });
  render(<Provider store={store}><MemoryRouter initialEntries={[url]}>
    <Location />
    <Routes><Route path="/app/channel/:key" element={<ChannelPage />} /></Routes>
  </MemoryRouter></Provider>);
  return store;
}

beforeEach(() => vi.clearAllMocks());

describe('detailed SRM workspace', () => {
  it('filters by plant code, division and product type next to the master search', () => {
    const material = { ...a, no: 'INV-MATERIAL', productType: 'M', plant: 'AMKT', dvType: 'CORPORATE DV' };
    const otherPlant = { ...material, no: 'INV-OTHER', plant: 'H001' };
    const po = { ...a, no: 'INV-PO', channel: 'poPortal', plant: undefined, dvType: undefined };
    const store = show([a, material, otherPlant, po]);
    for (const label of ['Approver', 'Pending With', 'Approved By', 'MIRO Status', 'Payment Status']) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
    expect(screen.getByRole('button', { name: 'Filter by status' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Date type' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Filter by product type' }));
    fireEvent.click(screen.getByRole('option', { name: /^Material/ }));
    expect(screen.queryByRole('button', { name: 'INV-A' })).toBeNull();
    expect(screen.getByRole('button', { name: 'INV-OTHER' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Filter by plant code' }));
    fireEvent.click(screen.getByRole('option', { name: /^AMKT/ }));
    expect(screen.getByRole('button', { name: 'INV-MATERIAL' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'INV-OTHER' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Filter by division' }));
    fireEvent.click(screen.getByRole('option', { name: /^AUTO DV/ }));
    expect(screen.getByText('No invoices match these filters.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Filter by division' }));
    fireEvent.click(screen.getByRole('option', { name: /^CORPORATE DV/ }));
    expect(screen.getByRole('button', { name: 'INV-MATERIAL' })).toBeTruthy();
    expect(store.getState().ui.pageFilters.srmWorkspace).toEqual({ q: '', plant: 'AMKT', division: 'CORPORATE DV', productType: 'M', status: '', date_from: '', date_to: '' });
    expect(screen.getByTestId('location').textContent).toContain('plant=AMKT');
    // Other views use the common selector: SRM-only controls cannot hide PO rows.
    expect(selectFilteredInvoices(store.getState())).toHaveLength(4);
    expect(store.getState().ui.scope).toEqual({ fy: 'all' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('button', { name: 'INV-A' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'INV-OTHER' })).toBeTruthy();
  });

  it('keeps only the invoice register and history tabs', () => {
    show();
    expect(screen.getByRole('button', { name: 'Invoice Register' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'History' })).toBeTruthy();
    for (const tab of ['Invoice Log', 'Approver Assignment', 'SAP Booking (MIRO)', 'Payment & UTR (FBL1N)']) {
      expect(screen.queryByRole('button', { name: tab })).toBeNull();
    }
  });

  it('keeps approver master search active across both SRM tabs and scopes query history', async () => {
    api.get.mockResolvedValue([
      { id: 1, invoice_no: 'INV-A', vendor_code: 'V1', channel: 'msetuSrm', event: 'Query assigned', created_at: '2026-10-04T00:00:00Z' },
      { id: 2, invoice_no: 'INV-B', vendor_code: 'V2', event: 'Unrelated query', created_at: '2026-10-04T00:00:00Z' },
      { id: 3, invoice_no: null, event: 'Unlinked query', created_at: '2026-10-04T00:00:00Z' },
    ]);
    show();
    fireEvent.change(screen.getByLabelText('Search SRM invoices'), { target: { value: 'Alice' } });
    expect(screen.queryByRole('button', { name: 'INV-B' })).toBeNull();
    expect(screen.getByRole('button', { name: 'INV-A' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'INV-C' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Export to Excel (1)' })).toBeTruthy();
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
    fireEvent.change(screen.getByLabelText('Column preset'), { target: { value: 'approvals' } });
    expect(screen.getByRole('columnheader', { name: 'Approver 1' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Approver 7' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: /^Posting Date/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Column preset'), { target: { value: 'all' } });
    expect(screen.getByRole('columnheader', { name: /^Posting Date/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(screen.getByRole('button', { name: 'INV-24' }));
    expect(store.getState().ui.modal.ctx).toEqual({ no: 'INV-24', poItem: 25, vcode: 'V1', po: 'PO1', channel: 'msetuSrm', sourceId: undefined });
  });

  it('combines status, date and master search and clears them together', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Filter by status' }));
    fireEvent.click(screen.getByRole('option', { name: /^Approved/ }));
    expect(screen.getByRole('button', { name: 'INV-C' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'INV-B' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Search SRM invoices'), { target: { value: 'INV-C' } });
    fireEvent.change(screen.getByLabelText('Invoice Date From'), { target: { value: '2026-10-02' } });
    expect(screen.getByText('No invoices match these filters.')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Remove all filters'));
    expect(screen.getByRole('button', { name: 'INV-A' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'INV-B' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'INV-C' })).toBeTruthy();
  });

  it('removes obsolete URL filters so they cannot silently narrow results', () => {
    const store = show(undefined, { url: '/app/channel/msetuSrm?approver=Missing&pending_with=Missing&approved_by=Missing&miro_status=booked&payment_status=paid&dv_type=X&product_type=M' });
    for (const no of ['INV-A', 'INV-B', 'INV-C']) expect(screen.getByRole('button', { name: no })).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('');
    expect(store.getState().ui.pageFilters.srmWorkspace).toEqual({ q: '', plant: '', division: '', productType: '', status: '', date_from: '', date_to: '' });
  });

  it('restores plant, division and product type from a shared link', () => {
    show([a, { ...a, no: 'INV-AMKT', plant: 'AMKT' }], { url: '/app/channel/msetuSrm?plant=AMKT&division=AUTO+DV&productType=S' });
    expect(screen.getByRole('button', { name: 'INV-AMKT' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'INV-A' })).toBeNull();
  });

  it('discards obsolete saved filters while restoring the saved master query and plant', () => {
    const store = show(undefined, { saved: { q: 'INV-A', approver: 'Missing', plant: 'H001', payment_status: 'paid' } });
    expect(screen.getByRole('button', { name: 'INV-A' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'INV-B' })).toBeNull();
    expect(store.getState().ui.pageFilters.srmWorkspace).toEqual({ q: 'INV-A', plant: 'H001', division: '', productType: '', status: '', date_from: '', date_to: '' });
  });

  it('closes the Columns panel on an outside click or Escape, but not on a click inside it', () => {
    show([a]);
    const panel = () => document.querySelector('details.srm-columns');
    fireEvent.click(screen.getByText('Columns'));
    expect(panel().open).toBe(true);
    fireEvent.mouseDown(screen.getByRole('checkbox', { name: 'PAN' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'PAN' }));
    expect(panel().open).toBe(true);
    fireEvent.mouseDown(document.body);
    expect(panel().open).toBe(false);
    fireEvent.click(screen.getByText('Columns'));
    expect(panel().open).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(panel().open).toBe(false);
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
