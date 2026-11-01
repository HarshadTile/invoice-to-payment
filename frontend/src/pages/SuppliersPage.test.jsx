import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';

const mockSuppliers = vi.hoisted(() => ({
  searchVendors: vi.fn(), listSuppliers: vi.fn(), addSupplier: vi.fn(), updateSupplierVendorCodes: vi.fn(),
  updateSupplierEmail: vi.fn(), generateSetupLink: vi.fn(), resetSupplierPassword: vi.fn(), deactivateSupplier: vi.fn(),
  activateSupplier: vi.fn(), deleteSupplier: vi.fn(),
  listRequests: vi.fn(), getRequest: vi.fn(), approveRequest: vi.fn(), rejectRequest: vi.fn(),
}));
vi.mock('../api/suppliersApi', () => ({ suppliersApi: mockSuppliers }));
vi.mock('../components/settings/PasswordLinkExpirySettings.jsx', () => ({ default: () => null }));

import authReducer, { setAuthFromServer } from '../features/auth/authSlice';
import settingsReducer from '../features/settings/settingsSlice';
import uiReducer from '../features/ui/uiSlice';
import SuppliersPage from './SuppliersPage.jsx';

const ROW = { id: 7, pan: 'AAAPA1111A', name: 'Acme Tools', email: 'acme@example.com', channel: 'msetuSrm', status: 'Invited', vendorCodes: ['V001', 'V002'], createdBy: 'Ravi', createdAt: '2026-10-16T10:00:00', locked: false };
const REQUEST = {
  id: 41, kind: 'NEW_ACCOUNT', supplierId: null, name: 'Bolt Works Chennai', email: 'chennai@bolt.example', pan: 'BBBPB2222B',
  vendorCodes: ['B1', 'NOPE'], addCodes: [], removeCodes: [], note: 'Chennai plant', status: 'Pending', channel: 'msetuSrm',
  createdAt: '2026-10-31T09:00:00',
};
const DETAILS = {
  request: REQUEST,
  codeChecks: [
    { code: 'B1', found: true, name: 'Bolt Works', pan: 'BBBPB2222B', panMatches: true },
    { code: 'NOPE', found: false, name: '', pan: '', panMatches: false },
  ],
  panInData: true, suggestedPan: 'BBBPB2222B', dataName: 'Bolt Works', panCodes: ['B1', 'B2', 'B3'],
  existingAccounts: [{ ...ROW, id: 9, email: 'pune@bolt.example', vendorCodes: ['B1', 'B2'] }], supplier: null,
};

function renderPage(role = 'Admin', url = '/app/settings/suppliers') {
  const store = configureStore({ reducer: { auth: authReducer, settings: settingsReducer, ui: uiReducer } });
  store.dispatch(setAuthFromServer({ authType: 'internal', role, channelScope: 'all', ticketRole: 'ADMIN', id: 1, allowedChannels: ['msetuSrm'], currentUser: { name: 'Ravi' } }));
  return render(<Provider store={store}><MemoryRouter initialEntries={[url]}><SuppliersPage /></MemoryRouter></Provider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSuppliers.listSuppliers.mockResolvedValue([ROW]);
  mockSuppliers.listRequests.mockResolvedValue({ items: [REQUEST], pendingCount: 1 });
  mockSuppliers.getRequest.mockResolvedValue(DETAILS);
});

describe('SuppliersPage', () => {
  it('lists suppliers and searches by typing', async () => {
    renderPage();
    expect(await screen.findByText('Acme Tools')).toBeInTheDocument();
    expect(screen.getByText('acme@example.com')).toBeInTheDocument();
    expect(screen.getByText('V001')).toBeInTheDocument();
    expect(screen.getByText('V002')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search suppliers'), 'acme');
    await waitFor(() => expect(mockSuppliers.listSuppliers).toHaveBeenLastCalledWith({ search: 'acme' }));
  });

  it('add supplier: search the data, pick vendor codes and an email, create', async () => {
    mockSuppliers.searchVendors.mockResolvedValue([{ pan: 'BBBPB2222B', name: 'Bolt Works', vendorCodes: ['B1', 'B2'], accounts: 0 }]);
    mockSuppliers.addSupplier.mockResolvedValue({ ...ROW, id: 8, pan: 'BBBPB2222B', name: 'Bolt Works', vendorCodes: ['B1'], emailSent: true });
    renderPage('Invoice Team L2');
    await screen.findByText('Acme Tools');
    await userEvent.click(screen.getByRole('button', { name: /add supplier/i }));
    await userEvent.type(screen.getByLabelText(/search supplier name, pan or vendor code/i), 'bol');
    await userEvent.click(await screen.findByRole('button', { name: /bolt works/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'B2' })); // untick B2
    await userEvent.type(screen.getByLabelText(/contact email/i), 'pune@bolt.example');
    await userEvent.click(screen.getByRole('button', { name: /create supplier/i }));
    await waitFor(() => expect(mockSuppliers.addSupplier).toHaveBeenCalledWith({ pan: 'BBBPB2222B', email: 'pune@bolt.example', vendorCodes: ['B1'] }));
  });

  it("a channel team can't tick another channel's codes; they show who manages them", async () => {
    mockSuppliers.searchVendors.mockResolvedValue([{
      pan: 'BBBPB2222B', name: 'Bolt Works', vendorCodes: ['B1', 'B2'], accounts: 0,
      codeChannels: { B1: ['msetuSrm'], B2: ['poPortal'] },
    }]);
    mockSuppliers.addSupplier.mockResolvedValue({ ...ROW, id: 8, pan: 'BBBPB2222B', name: 'Bolt Works', vendorCodes: ['B1'], emailSent: true });
    renderPage('Invoice Team L2'); // works in Msetu / SRM only
    await screen.findByText('Acme Tools');
    await userEvent.click(screen.getByRole('button', { name: /add supplier/i }));
    await userEvent.type(screen.getByLabelText(/search supplier name, pan or vendor code/i), 'bol');
    await userEvent.click(await screen.findByRole('button', { name: /bolt works/i }));
    expect(screen.getByRole('checkbox', { name: 'B1' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'B2' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'B2' })).not.toBeChecked();
    expect(screen.getByText('Managed by the PO Portal team')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/contact email/i), 'pune@bolt.example');
    await userEvent.click(screen.getByRole('button', { name: /create supplier/i }));
    await waitFor(() => expect(mockSuppliers.addSupplier).toHaveBeenCalledWith({ pan: 'BBBPB2222B', email: 'pune@bolt.example', vendorCodes: ['B1'] }));
  });

  it('a PAN that already has an account can get another one (another location)', async () => {
    mockSuppliers.searchVendors.mockResolvedValue([{ pan: 'AAAPA1111A', name: 'Acme Tools', vendorCodes: ['V001'], accounts: 1 }]);
    renderPage();
    await screen.findByText('Acme Tools');
    await userEvent.click(screen.getByRole('button', { name: /add supplier/i }));
    await userEvent.type(screen.getByLabelText(/search supplier name, pan or vendor code/i), 'acme');
    expect(await screen.findByRole('button', { name: /acme tools ·/i })).toBeEnabled();
    expect(screen.getByText(/already has 1 account/i)).toBeInTheDocument();
  });

  it('only an Admin sees Delete', async () => {
    renderPage('Admin');
    expect(await screen.findByRole('button', { name: 'Delete Acme Tools' })).toBeInTheDocument();
  });

  it('a team member does not see Delete', async () => {
    renderPage('Invoice Team L2');
    await screen.findByText('Acme Tools');
    expect(screen.queryByRole('button', { name: 'Delete Acme Tools' })).toBeNull();
  });

  it('shows pending access requests on their own tab', async () => {
    renderPage();
    const tab = await screen.findByRole('tab', { name: /access requests/i });
    await waitFor(() => expect(within(tab).getByLabelText('1 pending')).toBeInTheDocument());
    await userEvent.click(tab);
    expect(await screen.findByText('Bolt Works Chennai')).toBeInTheDocument();
    expect(screen.getByText('Chennai plant')).toBeInTheDocument();
    expect(mockSuppliers.listRequests).toHaveBeenCalledWith('Pending');
  });

  it('reviews a request: match check, requested codes ticked, extra code given, approved', async () => {
    mockSuppliers.approveRequest.mockResolvedValue({
      request: { ...REQUEST, status: 'Approved' }, emailSent: true,
      supplier: { ...ROW, id: 10, name: 'Bolt Works', email: 'chennai@bolt.example', vendorCodes: ['B1', 'B3'] },
    });
    renderPage('Admin', '/app/settings/suppliers?tab=requests&request=41');
    const dialog = await screen.findByRole('heading', { name: 'Supplier account request' }).then((h) => h.closest('.modal'));
    expect(await within(dialog).findByText('Note from the supplier')).toBeInTheDocument();
    expect(within(dialog).getByText('Not found')).toBeInTheDocument(); // NOPE is not in the data
    expect(within(dialog).getByText(/pune@bolt.example/)).toBeInTheDocument(); // the PAN's other account
    expect(within(dialog).getByRole('checkbox', { name: 'B1' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'B2' })).not.toBeChecked();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'B3' })); // extra access
    // The code that wasn't found is explained in the email, ready to edit.
    expect(within(dialog).getByLabelText(/message to the supplier/i).value).toMatch(/couldn't find this vendor code in our system: NOPE\./);
    await userEvent.click(within(dialog).getByRole('button', { name: /approve & send setup email/i }));
    await waitFor(() => expect(mockSuppliers.approveRequest).toHaveBeenCalledWith(41, {
      vendorCodes: ['B1', 'B3'], email: 'chennai@bolt.example', pan: 'BBBPB2222B',
      note: expect.stringContaining("We couldn't find this vendor code in our system: NOPE."),
    }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Supplier account request' })).toBeNull());
  });

  it('rejects a request with a reason that is emailed to the supplier', async () => {
    mockSuppliers.rejectRequest.mockResolvedValue({ request: { ...REQUEST, status: 'Rejected' }, emailSent: true });
    renderPage('Admin', '/app/settings/suppliers?tab=requests&request=41');
    const heading = await screen.findByRole('heading', { name: 'Supplier account request' });
    const dialog = heading.closest('.modal');
    await within(dialog).findByText('Note from the supplier');
    await userEvent.click(within(dialog).getByRole('button', { name: /reject/i }));
    await userEvent.click(within(dialog).getByRole('radio', { name: /vendor not in our system yet/i }));
    await userEvent.type(within(dialog).getByLabelText(/message to the supplier/i), 'Register with procurement first.');
    await userEvent.click(within(dialog).getByRole('button', { name: /reject and email supplier/i }));
    await waitFor(() => expect(mockSuppliers.rejectRequest).toHaveBeenCalledWith(41, { reason: 'not_in_system', message: 'Register with procurement first.' }));
  });
});
