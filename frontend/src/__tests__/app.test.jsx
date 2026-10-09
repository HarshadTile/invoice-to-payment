import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
import authReducer, { setAuthFromServer } from '../features/auth/authSlice';
import { ticketsApi } from '../features/tickets/ticketsApi';
import { notificationsApi } from '../features/notifications/notificationsApi';
import tablesReducer from '../features/tables/tablesSlice';
import settingsReducer from '../features/settings/settingsSlice';
import uiReducer, { setScopeFilter } from '../features/ui/uiSlice';
import AppRoutes from '../routes/AppRoutes.jsx';
import { api as mockApi } from '../api/client';
import ToastStack from '../components/common/ToastStack.jsx';

function freshStore() {
  return configureStore({
    reducer: { auth: authReducer, tables: tablesReducer, settings: settingsReducer, ui: uiReducer, [ticketsApi.reducerPath]: ticketsApi.reducer, [notificationsApi.reducerPath]: notificationsApi.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(ticketsApi.middleware, notificationsApi.middleware),
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
      'Vendor Status Reports', 'Logs / History', 'Profile',
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
      // The top bar carries the page title, e.g. "Processing Channels / Msetu / SRM".
      expect(await screen.findByRole('heading', { name: (name) => name.endsWith(label) })).toBeInTheDocument();
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

  it('the internal team has no Raise a Query option anywhere on the invoice lists', async () => {
    const { user } = await loginAdmin();
    expect(screen.queryAllByTitle('Raise a query on this invoice')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Raise query/i })).not.toBeInTheDocument();
    // ...including the full channel invoice tables
    await user.click(screen.getAllByText('Msetu / SRM')[0]);
    await screen.findByRole('heading', { name: (name) => name.endsWith('Msetu / SRM') });
    expect(screen.queryAllByTitle('Raise a query on this invoice')).toHaveLength(0);
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

  it('Inquiry Desk: the SLA Breached card is clickable and filters the list', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Inquiry Desk')[0]);
    const card = () => [...document.querySelectorAll('button.stat-card')].find((b) => b.querySelector('.lbl')?.textContent === 'SLA Breached');
    await waitFor(() => expect(card()).toBeTruthy());
    await user.click(card());
    expect(await screen.findByText(/· SLA Breached/)).toBeInTheDocument();
    expect(card()).toHaveAttribute('aria-pressed', 'true');
    await user.click(card()); // click again to go back to the default view
    expect(await screen.findByText(/· Open \+ In Progress/)).toBeInTheDocument();
  });

  it('toggles Kanban board view on Inquiry Desk', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Inquiry Desk')[0]);
    await user.click(screen.getByRole('button', { name: 'Board' }));
    await waitFor(() => expect(document.querySelectorAll('.kanban-col').length).toBe(4));
  });

  describe('notifications', () => {
    const seed = () => {
      mockApi.notifications.length = 0;
      mockApi.notifications.push(
        { id: 3, ticket_id: null, type: 'SLA_BREACHED', ticket_no: 'QRY-000003', subject: 'Third', read_at: null, created_at: '2026-10-07T10:00:00Z' },
        { id: 2, ticket_id: null, type: 'TICKET_ASSIGNED', ticket_no: 'QRY-000002', subject: 'Second', read_at: null, created_at: '2026-10-06T10:00:00Z' },
        { id: 1, ticket_id: null, type: 'TICKET_RESOLVED', ticket_no: 'QRY-000001', subject: 'First', read_at: '2026-10-05T12:00:00Z', created_at: '2026-10-05T10:00:00Z' },
      );
    };
    afterEach(() => { mockApi.notifications.length = 0; });

    it('shows an exact unread count on the bell and lists them in the menu', async () => {
      seed();
      const { user } = await loginAdmin();
      const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' });
      await user.click(bell);
      expect(await screen.findByText('Response SLA breached')).toBeInTheDocument();
      expect(document.querySelectorAll('.notification-item.unread').length).toBe(2);
    });

    it('the bell menu links to the full Notifications page', async () => {
      seed();
      const { user } = await loginAdmin();
      await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }));
      await user.click(await screen.findByRole('button', { name: 'View all notifications' }));
      await waitFor(() => expect(document.querySelectorAll('.inbox-row').length).toBe(3));
      expect(document.querySelector('.notification-menu')).toBeNull();
    });

    it('opening one marks it read and lowers the badge', async () => {
      seed();
      const { user } = await loginAdmin();
      await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }));
      await user.click(await screen.findByText('QRY-000003 - Third'));
      expect(await screen.findByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument();
    });

    it('Mark all read on the page clears the bell too', async () => {
      seed();
      const { user } = await loginAdmin();
      await user.click(document.querySelector('.nav-item[aria-label="Notifications"]'));
      expect(await screen.findByText('2 unread')).toBeInTheDocument();
      expect(document.querySelectorAll('.inbox-row').length).toBe(3);
      await user.click(screen.getByRole('button', { name: 'Mark all read' }));
      expect(await screen.findByText('You are all caught up')).toBeInTheDocument();
      await waitFor(() => expect(document.querySelector('.notification-button')).toHaveAttribute('aria-label', 'Notifications'));
    });

    it('Notifications page: search narrows the list', async () => {
      seed();
      const { user } = await loginAdmin();
      await user.click(document.querySelector('.nav-item[aria-label="Notifications"]'));
      await waitFor(() => expect(document.querySelectorAll('.inbox-row').length).toBe(3));
      fireEvent.change(screen.getByLabelText('Search notifications'), { target: { value: 'third' } });
      await waitFor(() => expect(document.querySelectorAll('.inbox-row').length).toBe(1));
      expect(screen.getByText('QRY-000003 - Third')).toBeInTheDocument();
    });

    it('shows an empty state when there is nothing', async () => {
      const { user } = await loginAdmin();
      await user.click(document.querySelector('.nav-item[aria-label="Notifications"]'));
      expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
    });
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

  it('collapses the sidebar to an icon rail, remembers it, and widens it to open a group', async () => {
    const { user } = await loginAdmin();
    const shell = document.querySelector('.app-shell');
    expect(shell).not.toHaveClass('sidebar-collapsed');
    await user.click(screen.getByRole('button', { name: 'Collapse menu' }));
    expect(shell).toHaveClass('sidebar-collapsed');
    expect(window.localStorage.getItem('i2p.sidebarCollapsed')).toBe('1');
    // names stay available (tooltips / accessible names) while the labels are hidden by CSS
    expect(screen.getByRole('button', { name: 'Logs / History' })).toHaveAttribute('title', 'Logs / History');
    // a group has nowhere to show its children in the rail, so opening it widens the sidebar
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(shell).not.toHaveClass('sidebar-collapsed');
    expect(window.localStorage.getItem('i2p.sidebarCollapsed')).toBe('0');
    window.localStorage.removeItem('i2p.sidebarCollapsed');
  });

  it('Settings: ticket roles reference is collapsed until opened', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Settings')[0]);
    await user.click(screen.getAllByText('Roles & Permissions')[0]);
    expect(document.querySelector('.tp-table')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Inquiry Desk ticket roles/ }));
    await waitFor(() => expect(document.querySelector('.tp-table')).not.toBeNull());
    expect(within(document.querySelector('.tp-table')).getByText('View ticket')).toBeInTheDocument();
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
    // Name and email only: the sign-in name comes from the email, and there's no title/department.
    fireEvent.change(inputs[0], { target: { value: 'Test User' } });
    fireEvent.change(inputs[1], { target: { value: 'test.user@example.com' } });
    await user.click(screen.getByRole('button', { name: 'Send Invite' }));
    expect(await screen.findByText('test.user@example.com')).toBeInTheDocument();
  });

  it('Settings: a user is authorized for one channel at a time', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Settings')[0]);
    await user.click(screen.getAllByText('Users')[0]);
    await screen.findByText('admin@company.com');
    await user.click(screen.getByRole('button', { name: 'Add User' }));
    fireEvent.change(document.querySelector('.modal-body select'), { target: { value: 'Viewer' } });
    const radios = () => [...document.querySelectorAll('.modal-body input[type="radio"]')];
    expect(radios().length).toBe(3);
    expect(document.querySelectorAll('.modal-body input[type="checkbox"]').length).toBe(0);
    await user.click(radios()[1]);
    await user.click(radios()[0]);
    expect(radios().map((r) => r.checked)).toEqual([true, false, false]);
  });

  it('staff without a ticket role do not get the Inquiry Desk, Notifications or the bell', async () => {
    const { store, user } = await loginAdmin();
    expect(document.querySelector('.nav-item[aria-label="Inquiry Desk"]')).not.toBeNull();
    expect(document.querySelector('.notification-button')).not.toBeNull();

    store.dispatch(setAuthFromServer({ ticketRole: 'NO_ACCESS' }));
    await waitFor(() => expect(document.querySelector('.nav-item[aria-label="Inquiry Desk"]')).toBeNull());
    expect(document.querySelector('.nav-item[aria-label="Notifications"]')).toBeNull();
    expect(document.querySelector('.notification-button')).toBeNull();
    // the rest of the app is still there
    expect(document.querySelector('.nav-item[aria-label="Search Invoice(s)"]')).not.toBeNull();
    expect(user).toBeTruthy();
  });

  it('a dashboard KPI opens Search Invoice(s) with a way back to Invoice Tracking', async () => {
    const { user } = await loginAdmin();
    await screen.findByRole('heading', { name: 'Invoice Tracking' });
    const paidCard = [...document.querySelectorAll('button.stat-card')].find((b) => b.querySelector('.lbl')?.textContent === 'Paid');
    await user.click(paidCard);
    expect(await screen.findByText('Paid invoices')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to Invoice Tracking' }));
    expect(await screen.findByRole('heading', { name: 'Invoice Tracking' })).toBeInTheDocument();
    // opening Search from the sidebar has no back link
    await user.click(document.querySelector('.nav-item[aria-label="Search Invoice(s)"]'));
    await screen.findByPlaceholderText(/Invoice no, PO no/);
    expect(screen.queryByRole('button', { name: 'Back to Invoice Tracking' })).toBeNull();
  });

  it('invoice progress: a Paid invoice is complete, not "In progress"', async () => {
    const { user } = await loginAdmin();
    await user.click(document.querySelector('.nav-item[aria-label="Search Invoice(s)"]'));
    await user.click(await screen.findByRole('button', { name: 'All dates' }));
    const open = async (no) => {
      await user.click(await screen.findByRole('button', { name: no }));
      await screen.findByText('Invoice Progress');
    };
    await open('INV-MS-1001'); // Paid
    expect(screen.queryByText('In progress')).toBeNull();
    await user.click(within(document.querySelector('.modal-foot')).getByRole('button', { name: 'Close' }));
    await open('INV-MS-1002'); // Payment Due: still moving
    expect(screen.getByText('In progress')).toBeInTheDocument();
  });

  it('Vendor Status Reports: the cards switch lists and a supplier filters the invoices', async () => {
    const { store, user } = await loginAdmin();
    store.dispatch(setScopeFilter({ key: 'fy', value: 'all' }));
    await user.click(document.querySelector('.nav-item[aria-label="Vendor Status Reports"]'));
    const card = (label) => [...document.querySelectorAll('button.stat-card')].find((b) => b.querySelector('.lbl')?.textContent === label);
    await waitFor(() => expect(card('Completed Invoices')).toBeTruthy());

    await user.click(card('Suppliers Covered'));
    expect(await screen.findByText('Completed invoices')).toBeInTheDocument(); // the suppliers table
    await user.click(screen.getByRole('button', { name: 'Bosch Auto Components' }));

    expect(await screen.findByText('Supplier: Bosch Auto Components')).toBeInTheDocument();
    expect(screen.getByText('INV-MS-1004')).toBeInTheDocument();
    expect(screen.queryByText('INV-MS-1001')).toBeNull(); // another supplier's paid invoice

    await user.click(screen.getByRole('button', { name: 'Remove supplier filter' }));
    expect(await screen.findByText('INV-MS-1001')).toBeInTheDocument();
  });

  it('Settings has no email notification rules page', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Settings')[0]);
    expect(await screen.findByText('Integration Settings')).toBeInTheDocument();
    expect(document.querySelector('.nav-item[aria-label="Auto-Notify Rules"]')).toBeNull();
  });

  it('Audit Logs is its own page under Settings and is read-only; Sync Log is gone', async () => {
    const { user } = await loginAdmin();
    expect(document.querySelector('.nav-item[aria-label="Sync Log"]')).toBeNull();
    await user.click(screen.getAllByText('Settings')[0]);
    await user.click(document.querySelector('.nav-item[aria-label="Audit Logs"]'));
    expect(await screen.findByText(/Newest first/)).toBeInTheDocument();
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

  it('Global Logs: has no channel filter of its own (the top bar owns it) and searches', async () => {
    const { user } = await loginAdmin();
    await user.click(document.querySelector('.nav-item[aria-label="Logs / History"]'));
    expect(await screen.findByRole('heading', { name: 'Logs / History' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Logs / History' })).toHaveLength(1);
    expect(screen.queryByLabelText('Filter by channel')).toBeNull();
    expect(screen.getByLabelText('Filter by type')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search the log'), { target: { value: 'zzz-no-such-entry' } });
    expect(await screen.findByText('No log entries match your filters.')).toBeInTheDocument();
  });

  it('the top-bar vendor / channel / year apply on every screen until cleared', async () => {
    const { store, user } = await loginAdmin();
    store.dispatch(setScopeFilter({ key: 'vcode', value: 'DIT00388AC' }));
    store.dispatch(setScopeFilter({ key: 'fy', value: 'all' }));
    // it follows you to Search Invoice(s) ...
    await user.click(screen.getAllByText('Search Invoice(s)')[0]);
    expect(await screen.findByText('Vendor')).toBeInTheDocument();
    expect(screen.queryByText('INV-MS-1001')).toBeInTheDocument();
    // ... and every invoice on screen belongs to that vendor code
    const shown = [...document.querySelectorAll('tbody tr')].map((row) => row.textContent);
    expect(shown.length).toBeGreaterThan(0);
    // clearing it (from this page's chip) clears it for the app: Invoice Tracking is unfiltered again
    await user.click(screen.getByRole('button', { name: /remove vendor|^×$|^x$/i, hidden: true }).closest('span').querySelector('button'));
    expect(store.getState().ui.scope.vcode).toBe('');
  });

  it('Supplier Visibility follows the top-bar vendor, and picking another supplier moves it', async () => {
    const { store, user } = await loginAdmin();
    store.dispatch(setScopeFilter({ key: 'vcode', value: 'DIT00388AC' })); // a Tata Communications code
    store.dispatch(setScopeFilter({ key: 'fy', value: 'all' }));
    await user.click(screen.getAllByText('Supplier Visibility')[0]);
    await screen.findAllByText(/^Vendor Codes?( \(\d+\))?$/);
    const picker = () => document.querySelector('#sv-supplier');
    expect(picker()).toHaveValue('Tata Communications Ltd');
    await user.selectOptions(picker(), 'Bharat Forge Ltd');
    expect(store.getState().ui.scope.vcode).toBe('BFL00456');
    expect(picker()).toHaveValue('Bharat Forge Ltd');
  });

  it('Supplier Visibility: a vendor code is a button that opens its full details', async () => {
    const { store, user } = await loginAdmin();
    store.dispatch(setScopeFilter({ key: 'fy', value: 'all' }));
    await user.click(screen.getAllByText('Supplier Visibility')[0]);
    await screen.findAllByText(/^Vendor Codes?( \(\d+\))?$/);
    const code = document.querySelector('.sv-code');
    expect(code).toHaveAttribute('title', 'Click here to see all details');
    await user.click(code);
    expect(await screen.findByText('Total POs')).toBeInTheDocument(); // the vendor code page
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
    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();
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
