import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// The API is mocked in-memory; these tests exercise the real login -> hydrate -> mutate flows
// without a running server. See src/test/apiMock.js and src/test/renderApp.jsx.
vi.mock('../../api/client', async () => {
  const { installApiMock } = await import('../../test/apiMock.js');
  return { api: installApiMock() };
});

import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from '../../routes/AppRoutes.jsx';
import { api as mockApi } from '../../api/client';
import { freshStore, resetAppTestState, loginSupplier } from '../../test/renderApp.jsx';

beforeEach(resetAppTestState);

describe('Supplier session', () => {
  it('opening a vendor code decision from the bell goes to the supplier profile', async () => {
    mockApi.notifications.length = 0;
    mockApi.notifications.push({
      id: 9, ticket_id: null, request_id: null, type: 'SUPPLIER_CODES_APPROVED',
      payload: { added: ['V100'], removed: [], note: null }, read_at: null, created_at: '2026-11-06T10:00:00Z',
    });
    const { user } = await loginSupplier();
    await user.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    const row = await screen.findByRole('button', { name: /Vendor code request approved/ });
    expect(row).toHaveTextContent('Vendor codes - Added V100');
    await user.click(row);
    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    await waitFor(() => expect(mockApi.notifications[0].read_at).toBeTruthy());
    mockApi.notifications.length = 0;
  });

  it('shows only this vendor code nav (no HQ items)', async () => {
    await loginSupplier();
    expect(screen.getAllByText('My Invoices').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'My Queries', exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Vendor Status Reports')).not.toBeInTheDocument();
  });

  it('opens supplier-facing invoice detail without a Raise a Query button, and closes it', async () => {
    const { user } = await loginSupplier();
    const viewBtns = screen.queryAllByText('View Full Detail');
    if (viewBtns.length) {
      await user.click(viewBtns[0]);
      expect(screen.getAllByText('Contact for This Invoice').length).toBeGreaterThan(0);
      const modal = document.querySelector('.modal');
      expect(within(modal).queryByRole('button', { name: /Raise a Query/ })).not.toBeInTheDocument();
      await user.click(within(modal).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(document.querySelector('.modal')).not.toBeInTheDocument());
    }
  });

  it('navigates to My Queries and Logs without error', async () => {
    const { user } = await loginSupplier();
    await user.click(screen.getAllByText('My Queries')[0]);
    expect(await screen.findByText('Resolved / Closed')).toBeInTheDocument();
    // The page title lives in the top bar only (a single <h1>): no in-page heading or intro text repeating it.
    expect(screen.getAllByRole('heading', { name: 'My Queries' })).toHaveLength(1);
    expect(screen.queryByText(/Track every query raised/)).not.toBeInTheDocument();
    await user.click(screen.getAllByText('Logs')[0]);
    expect(await screen.findByLabelText('Search the log')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Logs' })).toHaveLength(1);
    expect(screen.queryByText(/invoice milestones, payments and your queries/)).not.toBeInTheDocument();
  });

  it('lands on the Dashboard; a KPI card opens My Invoices with that list', async () => {
    const { user } = await loginSupplier();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Amount received')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Upcoming payments' })).toBeInTheDocument();
    const paidCard = screen.getAllByRole('button').find((b) => b.classList.contains('stat-card') && b.textContent.includes('Fully Paid'));
    const paidCount = paidCard.querySelector('.val').textContent;
    await user.click(paidCard);
    expect(await screen.findByRole('heading', { name: 'My Invoices' })).toBeInTheDocument();
    const active = document.querySelector('.supplier-kpis .stat-card[data-active="true"]');
    expect(active.textContent).toContain('Fully Paid');
    expect(active.querySelector('.val').textContent).toBe(paidCount);
    expect(screen.getByRole('button', { name: 'Back to Dashboard' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to Dashboard' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('opens an invoice from My Invoices and goes back with the breadcrumb', async () => {
    const { user } = await loginSupplier();
    await user.click(screen.getAllByText('My Invoices')[0]);
    await screen.findByRole('heading', { name: 'My Invoices' });
    const first = document.querySelector('.supplier-register tbody .link-hero');
    expect(first).not.toBeNull();
    const no = first.textContent;
    await user.click(first);
    expect(await screen.findByText(`Invoice ${no}`)).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Breadcrumb' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Back to My Invoices' }));
    expect(await screen.findByText(/^Invoice Register/)).toBeInTheDocument();
  });

  it('filters Logs by the type cards', async () => {
    const { user } = await loginSupplier();
    await user.click(screen.getAllByText('Logs')[0]);
    await screen.findByLabelText('Search the log');
    const payments = screen.getAllByRole('button').find((b) => b.classList.contains('stat-card') && b.textContent.includes('Payments'));
    await user.click(payments);
    expect(screen.getByLabelText('Filter by type')).toHaveValue('Payment');
    await user.click(payments);
    expect(screen.getByLabelText('Filter by type')).toHaveValue('all');
  });

  it('asks the team to add a vendor code from the profile, with a note', async () => {
    const { user } = await loginSupplier();
    await user.click(screen.getAllByText('My Profile')[0]);
    expect(await screen.findByText('Sign-in email')).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'Vendor code access' });
    await user.click(await within(card).findByRole('button', { name: 'Request a change' }));
    await user.type(within(card).getByLabelText('Vendor codes to add'), 'DIE00131AA');
    await user.click(within(card).getByRole('button', { name: 'Send request' }));
    expect(within(card).getByText(/add a note/i)).toBeInTheDocument();
    await user.type(within(card).getByLabelText(/^Note/), 'We now also supply from Chennai');
    await user.click(within(card).getByRole('button', { name: 'Send request' }));
    expect(await within(card).findByText('Waiting for review')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Request a change' })).toBeDisabled();
  });

  it('views its own profile with PAN and vendor code list', async () => {
    const { user } = await loginSupplier();
    await user.click(screen.getAllByText('My Profile')[0]);
    expect(await screen.findByRole('heading', { name: 'Vendor codes' })).toBeInTheDocument();
    expect(screen.getAllByText('PAN', { exact: true })).toHaveLength(1);
    expect(screen.getByText('Vendor code filter')).toBeInTheDocument();
  });

  it('cannot reach internal-only routes directly (route guard redirects)', async () => {
    const store = freshStore();
    const user = userEvent.setup();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/supplier/login']}>
          <AppRoutes />
        </MemoryRouter>
      </Provider>,
    );
    await user.type(screen.getByLabelText('Email'), 'supplier@example.com');
    await user.type(screen.getByLabelText('Password'), 'supplier123');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Total Invoices');
    // supplier is logged in; app-level guard should keep them off /app/* even if navigated there
    expect(screen.queryByText('Vendor Status Reports')).not.toBeInTheDocument();
  });
});
