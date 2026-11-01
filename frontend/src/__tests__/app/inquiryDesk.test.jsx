import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';

// The API is mocked in-memory; these tests exercise the real login -> hydrate -> mutate flows
// without a running server. See src/test/apiMock.js and src/test/renderApp.jsx.
vi.mock('../../api/client', async () => {
  const { installApiMock } = await import('../../test/apiMock.js');
  return { api: installApiMock() };
});

import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import { setAuthFromServer } from '../../features/auth/authSlice';
import { api as mockApi } from '../../api/client';
import { resetAppTestState, loginAdmin } from '../../test/renderApp.jsx';

beforeEach(resetAppTestState);

describe('Internal admin - Inquiry Desk and notifications', () => {
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
      expect(screen.getByText('QRY-000003')).toBeInTheDocument();
      expect(screen.getByText('Third')).toBeInTheDocument();
    });

    it('a query opened from Notifications goes Back to Notifications, not the Inquiry Desk', async () => {
      seed();
      mockApi.notifications[0].ticket_id = 'TCK-1001';
      const { user } = await loginAdmin();
      await user.click(document.querySelector('.nav-item[aria-label="Notifications"]'));
      await user.click(await screen.findByText('Third'));
      await user.click(await screen.findByRole('button', { name: 'Back to Notifications' }));
      await waitFor(() => expect(document.querySelectorAll('.inbox-row').length).toBe(3));
    });

    it('shows an empty state when there is nothing', async () => {
      const { user } = await loginAdmin();
      await user.click(document.querySelector('.nav-item[aria-label="Notifications"]'));
      expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
    });
  });

  it('staff without a ticket role do not get the Inquiry Desk, Notifications or the bell', async () => {
    const { store, user } = await loginAdmin();
    expect(document.querySelector('.nav-item[aria-label="Inquiry Desk"]')).not.toBeNull();
    expect(document.querySelector('.notification-button')).not.toBeNull();

    // Still a supplier manager: no Inquiry Desk, but notifications stay for supplier access requests.
    store.dispatch(setAuthFromServer({ ticketRole: 'NO_ACCESS' }));
    await waitFor(() => expect(document.querySelector('.nav-item[aria-label="Inquiry Desk"]')).toBeNull());
    expect(document.querySelector('.nav-item[aria-label="Notifications"]')).not.toBeNull();
    expect(document.querySelector('.notification-button')).not.toBeNull();

    // Neither a ticket role nor supplier management: no notifications at all.
    store.dispatch(setAuthFromServer({ ticketRole: 'NO_ACCESS', role: 'Invoice Team L1' }));
    await waitFor(() => expect(document.querySelector('.nav-item[aria-label="Notifications"]')).toBeNull());
    expect(document.querySelector('.notification-button')).toBeNull();
    // the rest of the app is still there
    expect(document.querySelector('.nav-item[aria-label="Search Invoice(s)"]')).not.toBeNull();
    expect(user).toBeTruthy();
  });
});
