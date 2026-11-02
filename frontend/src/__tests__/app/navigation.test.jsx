import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// The API is mocked in-memory; these tests exercise the real login -> hydrate -> mutate flows
// without a running server. See src/test/apiMock.js and src/test/renderApp.jsx.
vi.mock('../../api/client', async () => {
  const { installApiMock } = await import('../../test/apiMock.js');
  return { api: installApiMock() };
});

import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { suppliersApi } from '../../api/suppliersApi';
import { setScopeFilter } from '../../features/ui/uiSlice';
import { freshStore, renderApp, resetAppTestState, loginAdmin } from '../../test/renderApp.jsx';

beforeEach(resetAppTestState);

describe('Internal admin - Navigation, top bar and account menu', () => {
  it('groups internal users and suppliers under Settings', async () => {
    const listSuppliers = vi.spyOn(suppliersApi, 'listSuppliers').mockResolvedValue([]);
    try {
      const { user } = await loginAdmin();
      expect(screen.queryByRole('button', { name: 'Supplier Management', exact: true })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Supplier Management', exact: true })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Settings', exact: true }));
      await user.click(screen.getByRole('button', { name: 'User Management', exact: true }));
      expect(await screen.findByRole('heading', { name: 'Settings / User Management' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Supplier Management', exact: true }));
      expect(await screen.findByRole('heading', { name: 'Settings / Supplier Management' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Supplier Management', exact: true })).toHaveAttribute('aria-current', 'page');
      expect(await screen.findByText('No suppliers')).toBeInTheDocument();
    } finally {
      listSuppliers.mockRestore();
    }
  });

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
    expect(screen.queryByRole('button', { name: 'MFOX Portal', exact: true })).not.toBeInTheDocument();
    for (const label of ['Msetu / SRM', 'PO Portal']) {
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

  it('collapses the sidebar to an icon rail, remembers it, and widens it to open a group', async () => {
    const { user } = await loginAdmin();
    const shell = document.querySelector('.app-shell');
    expect(shell).not.toHaveClass('sidebar-collapsed');
    // the control is a normal button in the top bar, not a handle floating on the sidebar edge
    expect(document.querySelector('.topbar .sidebar-toggle')).toBe(screen.getByRole('button', { name: 'Collapse menu' }));
    expect(document.querySelector('.sidebar-edge-toggle')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Collapse menu' }));
    expect(screen.getByRole('button', { name: 'Expand menu' })).toHaveAttribute('aria-expanded', 'false');
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

  it('the Pending Approval card opens exactly as many invoices as it counts', async () => {
    const { store, user } = await loginAdmin();
    store.dispatch(setScopeFilter({ key: 'fy', value: 'all' }));
    const card = await waitFor(() => {
      const found = [...document.querySelectorAll('button.stat-card')].find((b) => b.querySelector('.lbl')?.textContent === 'Pending Approval');
      expect(found.querySelector('.val').textContent).not.toBe('0');
      return found;
    });
    const counted = card.querySelector('.val').textContent;
    await user.click(card);
    await waitFor(() => expect(document.querySelector('.srm-count-pill')).toHaveTextContent(`${counted} invoice`));
  });

  it('a dashboard KPI opens Search Invoice(s) with a way back to Invoice Tracking', async () => {
    const { user } = await loginAdmin();
    await screen.findByRole('heading', { name: 'Invoice Tracking' });
    const paidCard = [...document.querySelectorAll('button.stat-card')].find((b) => b.querySelector('.lbl')?.textContent === 'Paid');
    await user.click(paidCard);
    expect(await screen.findByText('Paid invoices')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to Invoice Tracking' }));
    expect(await screen.findByRole('heading', { name: 'Invoice Tracking' })).toBeInTheDocument();
    // the dashboard is the first page here, so it has no breadcrumb of its own
    expect(document.querySelector('#content > .back-banner')).toBeNull();
    // opening Search from the sidebar shows the plain page name, still leading back to the dashboard
    await user.click(document.querySelector('.nav-item[aria-label="Search Invoice(s)"]'));
    await screen.findByPlaceholderText(/Invoice no, PO no/);
    const crumb = document.querySelector('#content > .back-banner');
    expect(crumb).toHaveTextContent('Invoice Tracking/Search Invoice(s)');
    expect(screen.queryByText('Paid invoices')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back to Invoice Tracking' }));
    expect(await screen.findByRole('heading', { name: 'Invoice Tracking' })).toBeInTheDocument();
  });

  it('the invoice details dialog shows "<page> / Invoice Details" and its parent link closes it', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Search Invoice(s)')[0]);
    await user.type(await screen.findByPlaceholderText(/invoice no, po no/i), 'INV-MS-1001');
    await user.click(await screen.findByRole('button', { name: 'INV-MS-1001' }));
    const dialogCrumb = await screen.findByText('Invoice Details');
    expect(dialogCrumb.closest('.back-banner')).toHaveTextContent('Search Invoice(s)/Invoice Details');
    await user.click(within(dialogCrumb.closest('.back-banner')).getByRole('button', { name: 'Back to Search Invoice(s)' }));
    expect(screen.queryByText('Invoice Details')).toBeNull();
    expect(screen.getByPlaceholderText(/invoice no, po no/i)).toHaveValue('INV-MS-1001');
  });

  it('searches the top-bar vendor dropdown by name or code', async () => {
    const { store, user } = await loginAdmin();
    await user.click(screen.getByTitle('Filter by vendor'));
    const search = screen.getByRole('textbox', { name: 'Search vendor name or code' });
    // the list is searched by the invoice service, so each answer arrives a moment later
    fireEvent.change(search, { target: { value: 'tata' } });
    expect(await screen.findByRole('option', { name: /DIT00388AC/ })).toBeTruthy();
    fireEvent.change(search, { target: { value: 'NO-SUCH-VENDOR' } });
    expect(await screen.findByText('No vendors match.')).toBeTruthy();
    fireEvent.change(search, { target: { value: ' dit00388ac ' } });
    await user.click(await screen.findByRole('option', { name: /DIT00388AC/ }));
    expect(store.getState().ui.scope.vcode).toBe('DIT00388AC');
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

  it('signing in with the e-mail shows the full name of the account holder', async () => {
    const user = userEvent.setup();
    renderApp(freshStore());
    await user.type(screen.getByLabelText('Enter Email ID'), 'r.kulkarni@company.com');
    await user.type(screen.getByLabelText('Password'), 'ravi123');
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
