import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';

const mockAuth = vi.hoisted(() => ({ checkSetupLink: vi.fn(), completeSupplierSetup: vi.fn() }));
const mockThunks = vi.hoisted(() => ({ loginThunk: vi.fn(() => () => Promise.resolve()), logoutThunk: vi.fn(() => () => Promise.resolve()) }));
const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('../api/authApi', () => ({ authApi: mockAuth }));
vi.mock('../api/client', () => ({ api: { hasToken: () => false } }));
vi.mock('../features/bootstrap/hydrateThunks', () => mockThunks);
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => mockNavigate }));

import authReducer from '../features/auth/authSlice';
import uiReducer from '../features/ui/uiSlice';
import SupplierSetupPage from './SupplierSetupPage.jsx';

function renderPage(url = '/supplier/setup?token=abc') {
  const store = configureStore({ reducer: { auth: authReducer, ui: uiReducer } });
  return render(<Provider store={store}><MemoryRouter initialEntries={[url]}><SupplierSetupPage /></MemoryRouter></Provider>);
}

beforeEach(() => vi.clearAllMocks());

describe('SupplierSetupPage', () => {
  it('shows the server message for a bad or expired link', async () => {
    mockAuth.checkSetupLink.mockRejectedValue(new Error('This link is invalid or has expired. Ask the team for a new one.'));
    renderPage();
    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^pan/i)).toBeNull();
  });

  it('says so when the link has no token', () => {
    renderPage('/supplier/setup');
    expect(screen.getByText(/missing its token/i)).toBeInTheDocument();
    expect(mockAuth.checkSetupLink).not.toHaveBeenCalled();
  });

  it('validates the form, sets the password, then opens supplier sign-in', async () => {
    mockAuth.checkSetupLink.mockResolvedValue({ valid: true, name: 'Acme Tools' });
    mockAuth.completeSupplierSetup.mockResolvedValue({ msg: 'ok' });
    renderPage();
    expect(await screen.findByText(/acme tools/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^pan/i), 'aaapa1111a');
    await userEvent.type(screen.getByLabelText(/^new password/i), 'short');
    await userEvent.type(screen.getByLabelText(/^confirm/i), 'short');
    await userEvent.click(screen.getByRole('button', { name: /set password/i }));
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(mockAuth.completeSupplierSetup).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText(/^new password/i));
    await userEvent.clear(screen.getByLabelText(/^confirm/i));
    await userEvent.type(screen.getByLabelText(/^new password/i), 'Chosen-pass1');
    await userEvent.type(screen.getByLabelText(/^confirm/i), 'Chosen-pass1');
    await userEvent.click(screen.getByRole('button', { name: /set password/i }));

    await waitFor(() => expect(mockAuth.completeSupplierSetup).toHaveBeenCalledWith({ token: 'abc', pan: 'AAAPA1111A', password: 'Chosen-pass1' }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login?mode=pan&pan=AAAPA1111A&setup=complete&account=supplier', { replace: true }));
    expect(mockThunks.loginThunk).not.toHaveBeenCalled();
  });
});
