import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

const mockSuppliers = vi.hoisted(() => ({
  searchVendors: vi.fn(), listSuppliers: vi.fn(), addSupplier: vi.fn(), updateSupplierVendorCodes: vi.fn(),
  generateSetupLink: vi.fn(), resetSupplierPassword: vi.fn(), deactivateSupplier: vi.fn(),
  activateSupplier: vi.fn(), deleteSupplier: vi.fn(),
}));
vi.mock('../api/suppliersApi', () => ({ suppliersApi: mockSuppliers }));

import authReducer, { setAuthFromServer } from '../features/auth/authSlice';
import settingsReducer from '../features/settings/settingsSlice';
import uiReducer from '../features/ui/uiSlice';
import SuppliersPage from './SuppliersPage.jsx';

const ROW = { id: 7, pan: 'AAAPA1111A', name: 'Acme Tools', channel: 'msetuSrm', status: 'Invited', vendorCodes: ['V001', 'V002'], createdBy: 'Ravi', createdAt: '2026-10-16T10:00:00', locked: false };

function renderPage(role = 'Admin') {
  const store = configureStore({ reducer: { auth: authReducer, settings: settingsReducer, ui: uiReducer } });
  store.dispatch(setAuthFromServer({ authType: 'internal', role, channelScope: 'all', ticketRole: 'ADMIN', id: 1, allowedChannels: ['msetuSrm'], currentUser: { name: 'Ravi' } }));
  return render(<Provider store={store}><SuppliersPage /></Provider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSuppliers.listSuppliers.mockResolvedValue([ROW]);
});

describe('SuppliersPage', () => {
  it('lists suppliers and searches by typing', async () => {
    renderPage();
    expect(await screen.findByText('Acme Tools')).toBeInTheDocument();
    expect(screen.getByText('AAAPA1111A')).toBeInTheDocument();
    expect(screen.getByText('V001, V002')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search suppliers'), 'acme');
    await waitFor(() => expect(mockSuppliers.listSuppliers).toHaveBeenLastCalledWith({ search: 'acme' }));
  });

  it('add supplier: search the data, pick vendor codes, create, then show the link to copy', async () => {
    mockSuppliers.searchVendors.mockResolvedValue([{ pan: 'BBBPB2222B', name: 'Bolt Works', vendorCodes: ['B1', 'B2'], alreadyRegistered: false }]);
    mockSuppliers.addSupplier.mockResolvedValue({ ...ROW, id: 8, pan: 'BBBPB2222B', name: 'Bolt Works', vendorCodes: ['B1'], setupLink: 'http://x/supplier/setup?token=abc' });
    renderPage('Invoice Team'); // one channel, so the server picks it (an Admin would have to choose)
    await screen.findByText('Acme Tools');
    await userEvent.click(screen.getByRole('button', { name: /add supplier/i }));
    await userEvent.type(screen.getByLabelText(/search supplier name, pan or vendor code/i), 'bol');
    await userEvent.click(await screen.findByRole('button', { name: /bolt works/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'B2' })); // untick B2
    await userEvent.click(screen.getByRole('button', { name: /create supplier/i }));
    await waitFor(() => expect(mockSuppliers.addSupplier).toHaveBeenCalledWith({ pan: 'BBBPB2222B', vendorCodes: ['B1'], channel: undefined }));
    expect((await screen.findByLabelText('Ready-to-send supplier message')).value).toContain('http://x/supplier/setup?token=abc');
    expect(screen.getAllByText(/valid for 7 days/i).length).toBeGreaterThan(0);
  });

  it('an already registered PAN cannot be picked', async () => {
    mockSuppliers.searchVendors.mockResolvedValue([{ pan: 'AAAPA1111A', name: 'Acme Tools', vendorCodes: ['V001'], alreadyRegistered: true }]);
    renderPage();
    await screen.findByText('Acme Tools');
    await userEvent.click(screen.getByRole('button', { name: /add supplier/i }));
    await userEvent.type(screen.getByLabelText(/search supplier name, pan or vendor code/i), 'acme');
    expect(await screen.findByRole('button', { name: /acme tools ·/i })).toBeDisabled();
    expect(screen.getByText(/already registered/i)).toBeInTheDocument();
  });

  it('only an Admin sees Delete', async () => {
    renderPage('Admin');
    expect(await screen.findByRole('button', { name: 'Delete Acme Tools' })).toBeInTheDocument();
  });

  it('a team member does not see Delete', async () => {
    renderPage('Invoice Team');
    await screen.findByText('Acme Tools');
    expect(screen.queryByRole('button', { name: 'Delete Acme Tools' })).toBeNull();
  });
});
