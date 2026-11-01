import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// The API is mocked in-memory; these tests exercise the real login -> hydrate -> mutate flows
// without a running server. See src/test/apiMock.js and src/test/renderApp.jsx.
vi.mock('../../api/client', async () => {
  const { installApiMock } = await import('../../test/apiMock.js');
  return { api: installApiMock() };
});

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../../api/client';
import { freshStore, renderApp, resetAppTestState } from '../../test/renderApp.jsx';

beforeEach(resetAppTestState);

describe('Login flows', () => {
  it('offers only enabled portals at login, including MFOX after it is enabled', async () => {
    api.get.mockResolvedValueOnce({ channelAvailability: { msetuSrm: true, poPortal: false, mfoxPortal: true } });
    renderApp(freshStore());
    await userEvent.click(screen.getByRole('button', { name: 'Internal Team' }));
    expect(await screen.findByRole('option', { name: 'MFOX Portal' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'PO Portal' })).not.toBeInTheDocument();
  });

  it('defaults to supplier sign-in and switches forms without retaining a password', async () => {
    const user = userEvent.setup();
    renderApp(freshStore(), '/login');
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Password'), 'unsent-password');
    await user.click(screen.getByRole('button', { name: 'Internal Team' }));
    expect(screen.getByLabelText('Enter Email ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Supplier', exact: true }));
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('a new supplier requests an account from the sign-in page', async () => {
    const user = userEvent.setup();
    renderApp(freshStore(), '/login');
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Request an account' }));
    await user.click(await screen.findByRole('button', { name: 'Submit request' }));
    expect(screen.getByText('Enter at least one vendor code.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Company'), 'Acme Tools, Pune');
    await user.type(screen.getByLabelText('Email'), 'pune@acme.example');
    await user.click(screen.getByRole('button', { name: 'Submit request' }));
    expect(screen.getByText('Enter your 10-character PAN, like ABCDE1234F.')).toBeInTheDocument(); // PAN is compulsory
    await user.type(screen.getByLabelText('PAN'), 'abcde1234f');
    await user.type(screen.getByLabelText('Vendor codes'), 'DIE00131AA, dim00505aa');
    expect(within(screen.getByLabelText('Vendor codes entered')).getAllByText(/^DI/i)).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Submit request' }));
    const dialog = await screen.findByRole('dialog', { name: 'Request submitted' });
    expect(within(dialog).getByText('pune@acme.example')).toBeInTheDocument();
  });

  it('rejects bad internal credentials and shows an error', async () => {
    const user = userEvent.setup();
    renderApp(freshStore());
    await user.type(screen.getByLabelText('Enter Email ID'), 'wrong');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Invalid email or password/)).toBeInTheDocument();
  });

  it('logs in as internal Admin (All Channels) and lands on Invoice Tracking', async () => {
    const user = userEvent.setup();
    renderApp(freshStore());
    await user.type(screen.getByLabelText('Enter Email ID'), 'admin');
    await user.type(screen.getByLabelText('Password'), 'admin123');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Invoice Tracking' })).toBeInTheDocument();
    expect(screen.getAllByText(/^INV-/).length).toBeGreaterThan(0);
  });

  it('logs in as a Channel scope and hides HQ-only nav items', async () => {
    const user = userEvent.setup();
    renderApp(freshStore());
    await user.selectOptions(screen.getByRole('combobox'), 'msetuSrm');
    await user.type(screen.getByLabelText('Enter Email ID'), 'admin');
    await user.type(screen.getByLabelText('Password'), 'admin123');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: /Msetu \/ SRM Invoice Tracking/ })).toBeInTheDocument();
    expect(screen.queryByText('Vendor Status Reports')).not.toBeInTheDocument();
    expect(screen.queryByText('Supplier Visibility')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('button', { name: 'Supplier Management', exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'User Management', exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Integration Settings', exact: true })).not.toBeInTheDocument();
  });

  it('logs in as a supplier with email and password and lands on the Dashboard', async () => {
    const user = userEvent.setup();
    renderApp(freshStore(), '/supplier/login');
    await user.type(screen.getByLabelText('Email'), 'supplier@example.com');
    await user.type(screen.getByLabelText('Password'), 'supplier123');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Total Invoices')).toBeInTheDocument();
  });
});
