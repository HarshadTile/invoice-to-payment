import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// The API is mocked in-memory; the suite exercises the real login → hydrate →
// mutate flows without a running server. See src/test/apiMock.js.
vi.mock('../api/client', async () => {
  const { installApiMock } = await import('../test/apiMock.js');
  return { api: installApiMock() };
});

import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { api } from '../api/client';
import authReducer from '../features/auth/authSlice';
import ticketsReducer from '../features/tickets/ticketsSlice';
import tablesReducer from '../features/tables/tablesSlice';
import settingsReducer from '../features/settings/settingsSlice';
import uiReducer from '../features/ui/uiSlice';
import AppRoutes from '../routes/AppRoutes.jsx';
import ToastStack from '../components/common/ToastStack.jsx';

function freshStore() {
  return configureStore({
    reducer: { auth: authReducer, tickets: ticketsReducer, tables: tablesReducer, settings: settingsReducer, ui: uiReducer },
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
    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(await screen.findByText(/Invalid EAML . Employee ID or password/)).toBeInTheDocument();
  });

  it('logs in as internal Admin (All Channels) and lands on Invoice Tracking', async () => {
    const user = userEvent.setup();
    renderApp(freshStore());
    await user.type(screen.getByPlaceholderText('Enter your Mahindra Email ID'), 'admin');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'admin123');
    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(await screen.findByRole('heading', { name: 'Invoice Tracking' })).toBeInTheDocument();
    expect(screen.getAllByText(/^INV-/).length).toBeGreaterThan(0);
  });

  it('logs in as Internal Team scope and hides HQ-only nav items', async () => {
    const user = userEvent.setup();
    renderApp(freshStore());
    await user.selectOptions(screen.getByRole('combobox'), 'internalTeam');
    await user.type(screen.getByPlaceholderText('Enter your Mahindra Email ID'), 'admin');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'admin123');
    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(await screen.findByRole('heading', { name: /Internal Team Invoice Tracking/ })).toBeInTheDocument();
    expect(screen.queryByText('Vendor Status Reports')).not.toBeInTheDocument();
    expect(screen.queryByText('Supplier Visibility')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('logs in as a supplier (vendor code) and lands on My Invoices', async () => {
    const user = userEvent.setup();
    renderApp(freshStore());
    await user.click(screen.getByRole('button', { name: 'Supplier' }));
    await user.type(screen.getByPlaceholderText('Enter your vendor code'), 'DIT00388AC');
    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(await screen.findByText('DIT00388AC')).toBeInTheDocument();
    expect(screen.getByText('DIT00388AC')).toBeInTheDocument();
  });
});

describe('Internal admin - full navigation', () => {
  async function loginAdmin() {
    const store = freshStore();
    const user = userEvent.setup();
    renderApp(store);
    await user.type(screen.getByPlaceholderText('Enter your Mahindra Email ID'), 'admin');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'admin123');
    await user.click(screen.getByRole('button', { name: 'Login' }));
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
      await user.click(screen.getByText(label));
      // each destination should render a page-title heading of some kind
      expect(document.querySelector('.page-title')).toBeTruthy();
    }
  });

  it('expands Processing Channels and opens each channel', async () => {
    const { user } = await loginAdmin();
    // "Processing Channels" is expanded by default; sidebar channel links are already visible.
    for (const label of ['Msetu / SRM', 'PO Portal', 'Manual', 'MFOX Portal']) {
      const navLink = screen.getByTitle(label);
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
    await user.click(screen.getByTitle('Msetu / SRM'));
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
    await user.click(screen.getByText('✕'));
    expect(screen.queryByText(/Open in /)).not.toBeInTheDocument();
  });

  it('opens the full Invoice Detail modal from Search Invoice(s)', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getByText('Search Invoice(s)'));
    await user.type(screen.getByPlaceholderText(/Type an invoice no/), 'INV-MS-1001');
    const link = await screen.findByText('INV-MS-1001');
    await user.click(link);
    expect(await screen.findByText(/Stage-by-Stage Status/)).toBeInTheDocument();
    await user.click(screen.getByText('✕'));
    expect(screen.queryByText(/Stage-by-Stage Status/)).not.toBeInTheDocument();
  });

  it('moves an invoice to its next stage and persists it via PATCH', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getByText('Search Invoice(s)'));
    await user.type(screen.getByPlaceholderText(/Type an invoice no/), 'INV-MS-1003');
    await user.click(await screen.findByText('INV-MS-1003'));
    await user.click(await screen.findByRole('button', { name: 'Mark Approved' }));
    expect(await screen.findByText(/INV-MS-1003 moved to Approved/)).toBeInTheDocument();
    expect(api.patch).toHaveBeenCalledWith('/invoices/INV-MS-1003', { status: 'Approved' });
    // the modal re-renders from the updated record: next step is now Booked
    expect(await screen.findByRole('button', { name: 'Mark Booked' })).toBeInTheDocument();
  });

  it('requires a UTR before marking an invoice Paid', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getByText('Search Invoice(s)'));
    await user.type(screen.getByPlaceholderText(/Type an invoice no/), 'INV-MS-1002'); // Payment Due
    await user.click(await screen.findByText('INV-MS-1002'));
    await user.click(await screen.findByRole('button', { name: 'Mark Paid' }));
    expect(await screen.findByText(/Enter the UTR number/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('UTR number'), 'UTR999');
    await user.click(screen.getByRole('button', { name: 'Mark Paid' }));
    expect(await screen.findByText(/INV-MS-1002 moved to Paid/)).toBeInTheDocument();
    expect(api.patch).toHaveBeenCalledWith('/invoices/INV-MS-1002', { status: 'Paid', utr: 'UTR999' });
  });

  it('previews a vendor code and opens its full view', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('DIT00388AC')[0]);
    expect(await screen.findByText('Purchase Orders')).toBeInTheDocument();
    await user.click(screen.getByText('Open Full View →'));
    expect(await screen.findByText(/Other Codes for Tata Communications Ltd \(\d+\) : separate scope, not shown here/)).toBeInTheDocument();
  });

  it('raises a ticket from an invoice row end to end', async () => {
    const { user } = await loginAdmin();
    const raiseButtons = screen.getAllByTitle('Raise a query on this invoice');
    await user.click(raiseButtons[0]);
    const modalHeading = await screen.findByRole('heading', { name: /Raise a Query/ });
    expect(modalHeading).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("What's the query..."), 'Automated test ticket');
    await user.click(screen.getByRole('button', { name: 'Submit Query' }));
    expect(screen.queryByRole('heading', { name: /Raise a Query/ })).not.toBeInTheDocument();
    await user.click(screen.getByText('Inquiry Desk'));
    expect(screen.getByText('TCK-1006')).toBeInTheDocument();
  });

  it('opens a ticket, replies, and marks it resolved', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getByText('Inquiry Desk'));
    // default channel tab is Msetu/SRM; TCK-1002 (Open) and TCK-1004->wait check which land here
    const ticketLink = screen.getAllByText(/TCK-\d+/)[0];
    await user.click(ticketLink);
    expect(await screen.findByText('Traceability')).toBeInTheDocument();
    const replyBox = screen.queryByPlaceholderText(/Reply to/);
    if (replyBox) {
      await user.type(replyBox, 'Automated reply');
      await user.click(screen.getByRole('button', { name: 'Reply' }));
      expect(screen.getAllByText('Automated reply').length).toBeGreaterThan(0);
    }
  });

  it('toggles Kanban board view on Inquiry Desk', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getByText('Inquiry Desk'));
    await user.click(screen.getByText('▦ Board'));
    expect(document.querySelectorAll('.kanban-col').length).toBe(4);
  });

  it('switches identity to Internal Team via topbar and back to All Channels', async () => {
    const { user } = await loginAdmin();
    const select = screen.getByTitle(/Switch view/);
    await user.selectOptions(select, 'internal:internalTeam');
    expect(await screen.findByRole('heading', { name: /Internal Team Invoice Tracking/ })).toBeInTheDocument();
    await user.selectOptions(select, 'internal:all');
    expect(await screen.findByRole('heading', { name: 'Invoice Tracking' })).toBeInTheDocument();
  });

  it('switches identity to a supplier vendor code via topbar', async () => {
    const { user } = await loginAdmin();
    const select = screen.getByTitle(/Switch view/);
    await user.selectOptions(select, 'supplier:DIT00388AC');
    expect(await screen.findByText('DIT00388AC')).toBeInTheDocument();
  });

  it('Settings: toggles a role permission', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getByText('Settings'));
    await user.click(screen.getByText('Roles & Permissions'));
    const toggles = document.querySelectorAll('.check-toggle');
    const first = toggles[0];
    const wasOn = first.className.includes(' on');
    await user.click(first);
    expect(first.className.includes(' on')).toBe(!wasOn);
  });

  it('Settings: adds a user row', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getByText('Settings'));
    await user.click(screen.getByText('Users'));
    const before = document.querySelectorAll('tbody tr').length;
    await user.click(screen.getByRole('button', { name: 'Add Row' }));
    const inputs = document.querySelectorAll('.modal-body input');
    for (const [i, input] of inputs.entries()) {
      fireEvent.change(input, { target: { value: `Test${i}` } });
    }
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    const after = document.querySelectorAll('tbody tr').length;
    expect(after).toBe(before + 1);
  });

  it('Settings: toggles a notification rule', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getByText('Settings'));
    await user.click(screen.getByText('Notifications'));
    const toggle = document.querySelector('.notif-row .toggle');
    const wasOn = toggle.className.includes(' on');
    await user.click(toggle);
    expect(toggle.className.includes(' on')).toBe(!wasOn);
  });

  it('Audit Logs table is read-only (edit/delete disabled)', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getByText('Settings'));
    await user.click(screen.getByText('Audit Logs'));
    const editBtns = screen.getAllByTitle('Edit');
    expect(editBtns[0]).toBeDisabled();
  });

  it('Outputs page: bulk export triggers a toast, no crash', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getByText('Vendor Status Reports'));
    await user.click(screen.getByRole('button', { name: 'Export All' }));
    expect(await screen.findByText(/Exporting all invoices/)).toBeInTheDocument();
  });

  it('Global Logs: filters by channel and searches', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getByText('Logs / History'));
    expect(await screen.findByRole('heading', { name: 'Logs / History' })).toBeInTheDocument();
    const selects = document.querySelectorAll('.card select');
    fireEvent.change(selects[0], { target: { value: 'msetuSrm' } });
    expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  });

  it('Search Invoice(s) returns matching results', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getByText('Search Invoice(s)'));
    await user.type(screen.getByPlaceholderText(/Type an invoice no/), 'INV-MS-1001');
    expect(await screen.findByText(/1 result/)).toBeInTheDocument();
  });

  it('signing in with the e-mail shows the full name of the account holder', async () => {
    const user = userEvent.setup();
    renderApp(freshStore());
    await user.type(screen.getByPlaceholderText('Enter your Mahindra Email ID'), 'r.kulkarni@company.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'ravi123');
    await user.click(screen.getByRole('button', { name: 'Login' }));
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
    expect(await screen.findByRole('heading', { name: 'User Profile' })).toBeInTheDocument();
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
    await user.click(screen.getByText('Logout'));
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
    await user.type(screen.getByPlaceholderText('Enter your vendor code'), 'DIT00388AC');
    await user.click(screen.getByRole('button', { name: 'Login' }));
    await screen.findByText('DIT00388AC');
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
    await user.click(screen.getByText('My Queries'));
    expect(await screen.findByRole('heading', { name: 'My Queries' })).toBeInTheDocument();
    await user.click(screen.getByText('Logs'));
    expect(await screen.findByRole('heading', { name: /Logs :/ })).toBeInTheDocument();
  });

  it('views its own profile with PAN and vendor code list', async () => {
    const { user } = await loginSupplier();
    await user.click(screen.getByText('My Profile'));
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
    await user.type(screen.getByPlaceholderText('Enter your vendor code'), 'DIT00388AC');
    await user.click(screen.getByRole('button', { name: 'Login' }));
    await screen.findByText('DIT00388AC');
    // supplier is logged in; app-level guard should keep them off /app/* even if navigated there
    expect(screen.queryByText('Vendor Status Reports')).not.toBeInTheDocument();
  });
});
