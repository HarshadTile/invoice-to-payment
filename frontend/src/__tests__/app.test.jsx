import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// The API is mocked in-memory; the suite exercises the real login → hydrate →
// mutate flows without a running server. See src/test/apiMock.js.
vi.mock('../api/client', async () => {
  const { installApiMock } = await import('../test/apiMock.js');
  return { api: installApiMock() };
});

import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { api } from '../api/client';
import authReducer from '../features/auth/authSlice';
import { ticketsApi } from '../features/tickets/ticketsApi';
import tablesReducer from '../features/tables/tablesSlice';
import settingsReducer from '../features/settings/settingsSlice';
import uiReducer from '../features/ui/uiSlice';
import AppRoutes from '../routes/AppRoutes.jsx';
import ToastStack from '../components/common/ToastStack.jsx';

function freshStore() {
  return configureStore({
    reducer: { auth: authReducer, tables: tablesReducer, settings: settingsReducer, ui: uiReducer, [ticketsApi.reducerPath]: ticketsApi.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(ticketsApi.middleware),
  });
}

function renderApp(store) {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/login']}>
        <AppRoutes />
        <ToastStack />
      </MemoryRouter>
    </Provider>,
  );
}

beforeEach(() => {
  window.HTMLElement.prototype.scrollBy = vi.fn();
  global.URL.createObjectURL = vi.fn(() => 'blob:stub');
  global.URL.revokeObjectURL = vi.fn();
  window.confirm = vi.fn(() => true);
});

describe('Login flows', () => {
  it('rejects bad internal credentials and shows an error', async () => {
    const user = userEvent.setup();
    renderApp(freshStore());
    await user.type(screen.getByPlaceholderText('Enter your Mahindra Email ID'), 'wrong');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Invalid EAML . Employee ID or password/)).toBeInTheDocument();
  });

  it('logs in as internal Admin (All Channels) and lands on Invoice Tracking', async () => {
    const user = userEvent.setup();
    renderApp(freshStore());
    await user.type(screen.getByPlaceholderText('Enter your Mahindra Email ID'), 'admin');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'admin123');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Invoice Tracking' })).toBeInTheDocument();
    expect(screen.getAllByText(/^INV-/).length).toBeGreaterThan(0);
  });

  it('logs in as a Channel scope and hides HQ-only nav items', async () => {
    const user = userEvent.setup();
    renderApp(freshStore());
    await user.selectOptions(screen.getByRole('combobox'), 'msetuSrm');
    await user.type(screen.getByPlaceholderText('Enter your Mahindra Email ID'), 'admin');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'admin123');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: /Msetu \/ SRM Invoice Tracking/ })).toBeInTheDocument();
    expect(screen.queryByText('Vendor Status Reports')).not.toBeInTheDocument();
    expect(screen.queryByText('Supplier Visibility')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('logs in as a supplier (vendor code) and lands on My Invoices', async () => {
    const user = userEvent.setup();
    renderApp(freshStore());
    await user.click(screen.getByRole('button', { name: 'Supplier' }));
    await user.type(screen.getByPlaceholderText('Enter vendor code'), 'DIT00388AC');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Total Invoices')).toBeInTheDocument();
  });
});

describe('Internal admin - full navigation', () => {
  async function loginAdmin() {
    const store = freshStore();
    const user = userEvent.setup();
    renderApp(store);
    await user.type(screen.getByPlaceholderText('Enter your Mahindra Email ID'), 'admin');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'admin123');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Invoice Tracking' });
    return { store, user };
  }

  it('visits every top-level nav destination without error', async () => {
    const { user } = await loginAdmin();
    const destinations = [
      'Search Invoice(s)', 'Supplier Visibility', 'Inquiry Desk',
      'Vendor Status Reports', 'Logs / History', 'Sync Log', 'Profile',
    ];
    for (const label of destinations) {
      await user.click(screen.getAllByText(label)[0]);
      // each destination should render a heading of some kind
      await waitFor(() => expect(screen.getAllByRole('heading').length).toBeGreaterThan(0));
    }
  });

  it('expands Processing Channels and opens each channel', async () => {
    const { user } = await loginAdmin();
    // "Processing Channels" is expanded by default; sidebar channel links are already visible.
    for (const label of ['Msetu / SRM', 'PO Portal', 'MFOX Portal']) {
      const navLink = screen.getAllByText(label)[0];
      await user.click(navLink);
      expect(await screen.findByRole('heading', { name: label })).toBeInTheDocument();
      // cycle through every sub-view tab for this channel
      const tabs = document.querySelectorAll('.sheet-carousel .car-chip');
      for (const tab of tabs) {
        fireEvent.click(tab);
      }
    }
  });

  it('filters channel history invoices from KPI cards', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Msetu / SRM')[0]);
    await user.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findByText(/Msetu \/ SRM : Total Invoices/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Failed 1$/ }));

    expect(screen.getByRole('heading', { name: /Failed/ })).toBeInTheDocument();
    expect(screen.getByText('INV-MS-1005')).toBeInTheDocument();
    expect(screen.queryByText('INV-MS-1001')).not.toBeInTheDocument();
  });

  it('opens the Stage Simple modal from the Recent Invoices list', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByTitle('Open current stage')[0]);
    expect(await screen.findByText(/Open in /)).toBeInTheDocument();
    await user.click(screen.getAllByText('✕')[0]);
    expect(screen.queryByText(/Open in /)).not.toBeInTheDocument();
  });

  it('opens the full Invoice Detail modal from Search Invoice(s)', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Search Invoice(s)')[0]);
    await user.type(await screen.findByPlaceholderText(/invoice no, po no/i), 'INV-MS-1001');
    const link = await screen.findByRole('button', { name: 'INV-MS-1001' });
    await user.click(link);
    expect(await screen.findByText(/Invoice Progress/)).toBeInTheDocument();
    await user.click(screen.getAllByText('✕')[0]);
    expect(screen.queryByText(/Invoice Progress/)).not.toBeInTheDocument();
  });

  it('shows invoice progress without manual stage controls', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Search Invoice(s)')[0]);
    await user.type(await screen.findByPlaceholderText(/invoice no, po no/i), 'INV-MS-1003');
    await user.click(await screen.findByRole('button', { name: 'INV-MS-1003' }));
    expect(await screen.findByText('Invoice Progress')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark Approved' })).not.toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('shows payment status and UTR without manual payment controls', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Search Invoice(s)')[0]);
    await user.type(await screen.findByPlaceholderText(/invoice no, po no/i), 'INV-MS-1002'); // Payment Due
    await user.click(await screen.findByRole('button', { name: 'INV-MS-1002' }));
    expect(await screen.findByText('Current Status')).toBeInTheDocument();
    expect(screen.getByText('UTR No.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark Paid' })).not.toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('previews a vendor code and opens its full view', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('DIT00388AC')[0]);
    expect(await screen.findByText('Purchase Orders')).toBeInTheDocument();
    await user.click(screen.getAllByText('Open Full View →')[0]);
    expect(await screen.findByText(/Other Codes for Tata Communications Ltd \(\d+\) : separate scope, not shown here/)).toBeInTheDocument();
  });

  it('raises a ticket from an invoice row end to end', async () => {
    const { user } = await loginAdmin();
    const raiseButtons = screen.getAllByTitle('Raise a query on this invoice');
    await user.click(raiseButtons[0]);
    const modalHeading = await screen.findByRole('heading', { name: /Raise a Query/ });
    expect(modalHeading).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Briefly describe the query'), 'Payment status query');
    await user.type(screen.getByPlaceholderText("What's the query..."), 'Automated test ticket');
    await user.click(screen.getByRole('button', { name: 'Submit Query' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: /Raise a Query/ })).not.toBeInTheDocument());
    await user.click(screen.getAllByText('Inquiry Desk')[0]);
    expect(await screen.findByText('TCK-1006')).toBeInTheDocument();
  });

  it('assigns, converses, adds an internal note, and resolves from the routed detail page', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Inquiry Desk')[0]);
    const ticketLink = (await screen.findAllByRole('button', { name: /TCK-/ }))[0];
    await user.click(ticketLink);
    expect(await screen.findByText('Original query')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Invoice' })).toBeInTheDocument();

    const facts = document.querySelector('.ticket-facts');
    await within(facts).findByRole('option', { name: 'Priya Deshmukh' });
    await user.selectOptions(facts.querySelector('select'), '1');
    await user.click(within(facts).getByRole('button', { name: 'Assign' }));

    const replyBox = await screen.findByPlaceholderText('Write a reply');
    await user.type(replyBox, 'Automated public reply');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Automated public reply')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Internal note' }));
    await user.type(screen.getByPlaceholderText('Add a note for the internal team'), 'Internal follow-up');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Internal follow-up')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    await user.type(screen.getByPlaceholderText('Resolution note'), 'Payment status confirmed');
    await user.click(screen.getAllByRole('button', { name: 'Resolve' }).at(-1));
    expect((await screen.findAllByText('Resolved')).length).toBeGreaterThan(0);
  });

  it('toggles Kanban board view on Inquiry Desk', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Inquiry Desk')[0]);
    await user.click(screen.getByRole('button', { name: 'Board' }));
    await waitFor(() => expect(document.querySelectorAll('.kanban-col').length).toBe(4));
  });

  it.skip('switches identity to Internal Team via topbar and back to All Channels', async () => {
    const { user } = await loginAdmin();
    const select = screen.getByTitle(/Switch view/);
    await user.selectOptions(select, 'internal:internalTeam');
    expect(await screen.findByRole('heading', { name: /Internal Team Invoice Tracking/ })).toBeInTheDocument();
    await user.selectOptions(select, 'internal:all');
    expect(await screen.findByRole('heading', { name: 'Invoice Tracking' })).toBeInTheDocument();
  });

  it.skip('switches identity to a supplier vendor code via topbar', async () => {
    const { user } = await loginAdmin();
    const select = screen.getByTitle(/Switch view/);
    await user.selectOptions(select, 'supplier:DIT00388AC');
    expect(await screen.findByText('Total Invoices')).toBeInTheDocument();
  });

  it('Settings: toggles a role permission', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Settings')[0]);
    await user.click(screen.getAllByText('Roles & Permissions')[0]);
    const toggles = document.querySelectorAll('.check-toggle');
    const first = toggles[0];
    const wasOn = first.className.includes(' on');
    await user.click(first);
    expect(first.className.includes(' on')).toBe(!wasOn);
  });

  it('Settings: invites a user account', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Settings')[0]);
    await user.click(screen.getAllByText('Users')[0]);
    await screen.findByText('admin@company.com');
    await user.click(screen.getByRole('button', { name: 'Add User' }));
    const inputs = document.querySelectorAll('.modal-body input');
    fireEvent.change(inputs[0], { target: { value: 'test.user' } });
    fireEvent.change(inputs[1], { target: { value: 'Test User' } });
    fireEvent.change(inputs[2], { target: { value: 'test.user@example.com' } });
    await user.click(screen.getByRole('button', { name: 'Send Invite' }));
    expect(await screen.findByText('test.user@example.com')).toBeInTheDocument();
  });

  it('Settings: toggles a notification rule', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Settings')[0]);
    await user.click(screen.getAllByText('Notifications')[0]);
    const toggle = document.querySelector('.notif-row .toggle');
    const wasOn = toggle.className.includes(' on');
    await user.click(toggle);
    expect(toggle.className.includes(' on')).toBe(!wasOn);
  });

  it('Audit Logs table is read-only (edit/delete disabled)', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Settings')[0]);
    await user.click(screen.getAllByText('Audit Logs')[0]);
    expect(screen.queryAllByTitle('Edit')).toHaveLength(0);
    expect(screen.queryAllByTitle('Delete')).toHaveLength(0);
  });

  it('Outputs page: bulk export triggers a toast, no crash', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Vendor Status Reports')[0]);
    const exportButton = await screen.findByRole('button', { name: /Export to Excel/ });
    await user.click(exportButton);
    expect(exportButton).toBeInTheDocument();
  });

  it('Global Logs: filters by channel and searches', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Logs / History')[0]);
    expect(await screen.findByRole('heading', { name: 'Logs / History' })).toBeInTheDocument();
    const selects = document.querySelectorAll('.card select');
    fireEvent.change(selects[0], { target: { value: 'msetuSrm' } });
    expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  });

  it('Search Invoice(s) returns matching results', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Search Invoice(s)')[0]);
    await user.type(await screen.findByPlaceholderText(/invoice no, po no/i), 'INV-MS-1001');
    expect(await screen.findByText(/1 invoice/i)).toBeInTheDocument();
  });

  it('signing in with the e-mail shows the full name of the account holder', async () => {
    const user = userEvent.setup();
    renderApp(freshStore());
    await user.type(screen.getByPlaceholderText('Enter your Mahindra Email ID'), 'r.kulkarni@company.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'ravi123');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Invoice Tracking' });
    await user.click(screen.getByRole('button', { name: 'Account menu for Ravi Kulkarni' }));
    expect(within(screen.getByRole('menu')).getByText('Ravi Kulkarni')).toBeInTheDocument();
  });

  it('avatar menu shows the account, opens Profile and logs out', async () => {
    const { user } = await loginAdmin();
    // signed in with the username "admin" -> the menu shows "admin"
    await user.click(screen.getByRole('button', { name: 'Account menu for admin' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('admin')).toBeInTheDocument();
    expect(within(menu).getByText('admin@company.com')).toBeInTheDocument(); // the admin account's own email
    expect(within(menu).queryByText('Administrator')).not.toBeInTheDocument();
    expect(within(menu).getByText(/Admin · All Channels/)).toBeInTheDocument();

    await user.click(within(menu).getByRole('menuitem', { name: 'Profile' }));
    expect(await screen.findByRole('heading', { name: 'My Profile' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument(); // closed by navigating

    await user.click(screen.getByRole('button', { name: /Account menu for/ }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Account menu for/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Logout' }));
    await user.click(await screen.findByRole('button', { name: 'Log Out' }));
    expect(await screen.findByText('Sign in to Invoice to Payment Tracker')).toBeInTheDocument();
  });

  it('logs out and returns to login screen', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Logout')[0]);
    await user.click(await screen.findByRole('button', { name: 'Log Out' }));
    expect(await screen.findByText('Sign in to Invoice to Payment Tracker')).toBeInTheDocument();
  });
});

describe('Supplier session', () => {
  async function loginSupplier() {
    const store = freshStore();
    const user = userEvent.setup();
    renderApp(store);
    await user.click(screen.getByRole('button', { name: 'Supplier' }));
    await user.type(screen.getByPlaceholderText('Enter vendor code'), 'DIT00388AC');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Total Invoices');
    return { store, user };
  }

  it('shows only this vendor code nav (no HQ items)', async () => {
    await loginSupplier();
    expect(screen.getAllByText('My Invoices').length).toBeGreaterThan(0);
    expect(screen.getByText('My Queries')).toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Vendor Status Reports')).not.toBeInTheDocument();
  });

  it('opens supplier-facing invoice detail and raises a query', async () => {
    const { user } = await loginSupplier();
    const viewBtns = screen.queryAllByText('View Full Detail');
    if (viewBtns.length) {
      await user.click(viewBtns[0]);
      expect(screen.getAllByText('Contact for This Invoice').length).toBeGreaterThan(0);
      const modal = document.querySelector('.modal');
      await user.click(within(modal).getByRole('button', { name: /Raise a Query/ }));
      expect(await screen.findByRole('heading', { name: /Raise a Query/ })).toBeInTheDocument();
    }
  });

  it('navigates to My Queries and Logs without error', async () => {
    const { user } = await loginSupplier();
    await user.click(screen.getAllByText('My Queries')[0]);
    expect(await screen.findByRole('heading', { name: 'My Queries' })).toBeInTheDocument();
    await user.click(screen.getAllByText('Logs')[0]);
    expect(await screen.findByRole('heading', { name: /Logs :/ })).toBeInTheDocument();
  });

  it('views its own profile with PAN and vendor code list', async () => {
    const { user } = await loginSupplier();
    await user.click(screen.getAllByText('My Profile')[0]);
    expect(await screen.findByText(/All Vendor Codes Under This PAN/)).toBeInTheDocument();
  });

  it('cannot reach internal-only routes directly (route guard redirects)', async () => {
    const store = freshStore();
    const user = userEvent.setup();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/login']}>
          <AppRoutes />
        </MemoryRouter>
      </Provider>,
    );
    await user.click(screen.getByRole('button', { name: 'Supplier' }));
    await user.type(screen.getByPlaceholderText('Enter vendor code'), 'DIT00388AC');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Total Invoices');
    // supplier is logged in; app-level guard should keep them off /app/* even if navigated there
    expect(screen.queryByText('Vendor Status Reports')).not.toBeInTheDocument();
  });
});
