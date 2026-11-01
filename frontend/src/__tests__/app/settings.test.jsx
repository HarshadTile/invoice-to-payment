import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// The API is mocked in-memory; these tests exercise the real login -> hydrate -> mutate flows
// without a running server. See src/test/apiMock.js and src/test/renderApp.jsx.
vi.mock('../../api/client', async () => {
  const { installApiMock } = await import('../../test/apiMock.js');
  return { api: installApiMock() };
});

import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import { setAuthFromServer } from '../../features/auth/authSlice';
import { hydrateSettings } from '../../features/settings/settingsSlice';
import { resetAppTestState, loginAdmin } from '../../test/renderApp.jsx';

beforeEach(resetAppTestState);

describe('Internal admin - Settings: roles, users and permissions', () => {
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

  it('Settings: creates, edits, renames and deletes a role', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Settings')[0]);
    await user.click(screen.getAllByText('Roles & Permissions')[0]);
    const table = await waitFor(() => { const t = document.querySelector('.roles-table'); expect(t).not.toBeNull(); return t; });
    const heading = (name) => within(table).queryByText(name, { selector: '.roles-col-name' });
    expect(heading('Invoice Team L1')).toBeInTheDocument();
    expect(heading('Viewer')).toBeNull();
    expect(screen.queryByRole('button', { name: /Rename/ })).toBeNull(); // the table itself has no edit icons

    // New role, copied from L2
    await user.click(screen.getByRole('button', { name: /new role/i }));
    await user.type(screen.getByLabelText('Role name'), 'Invoice Team L4');
    await user.selectOptions(screen.getByLabelText('Start from'), 'Invoice Team L2');
    await user.click(screen.getByRole('button', { name: 'Create role' }));
    const audit = await screen.findByRole('button', { name: 'Allow Invoice Team L4 to view audit logs' });
    expect(screen.getByRole('button', { name: 'Allow Invoice Team L4 to manage suppliers' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(audit);
    await waitFor(() => expect(audit).toHaveAttribute('aria-pressed', 'true'));

    // Rename it, then delete it (nobody has it, so no move is needed)
    await user.click(screen.getByRole('button', { name: 'Edit roles' }));
    await user.click(screen.getByRole('button', { name: 'Rename Invoice Team L4' }));
    const name = screen.getByLabelText('Role name');
    await user.clear(name);
    await user.type(name, 'Finance Review');
    await user.click(within(document.querySelector('.modal')).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(heading('Finance Review')).toBeInTheDocument());
    expect(heading('Invoice Team L4')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Edit roles' }));
    await user.click(screen.getByRole('button', { name: 'Delete Finance Review' }));
    await user.click(screen.getByRole('button', { name: 'Delete role' }));
    await waitFor(() => expect(heading('Finance Review')).toBeNull());

    // A role with users asks where they go
    await user.click(screen.getByRole('button', { name: 'Edit roles' }));
    await user.click(screen.getByRole('button', { name: 'Delete Invoice Team L2' }));
    expect(screen.getByRole('button', { name: 'Delete role' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Move users to'), 'Invoice Team L1');
    await user.click(screen.getByRole('button', { name: 'Delete role' }));
    await waitFor(() => expect(heading('Invoice Team L2')).toBeNull());
  });

  it('Settings: invites a user account', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Settings')[0]);
    await user.click(screen.getByRole('button', { name: 'User Management', exact: true }));
    await screen.findByText('admin@company.com');
    await user.click(screen.getByRole('button', { name: 'Add User' }));
    const inputs = document.querySelectorAll('.modal-body input');
    // Name and email only: the sign-in name comes from the email, and there's no title/department.
    fireEvent.change(inputs[0], { target: { value: 'Test User' } });
    fireEvent.change(inputs[1], { target: { value: 'test.user@example.com' } });
    // The setup link is emailed, never shown on screen.
    await user.click(screen.getByRole('button', { name: 'Create User & Generate Link' }));
    expect(await screen.findByText(/User created\. Invitation email sent\./)).toBeInTheDocument();
    expect(await screen.findByText('test.user@example.com')).toBeInTheDocument();
    expect(screen.queryByText(/reset-password\?token=/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Send access email to Test User' }));
    await user.click(screen.getByRole('button', { name: 'Send Email' }));
    expect(await screen.findByText('Access email sent to test.user@example.com.')).toBeInTheDocument();
  });

  it('Settings: a user is authorized for one channel at a time', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Settings')[0]);
    await user.click(screen.getByRole('button', { name: 'User Management', exact: true }));
    await screen.findByText('admin@company.com');
    await user.click(screen.getByRole('button', { name: 'Add User' }));
    fireEvent.change(document.querySelector('.modal-body select'), { target: { value: 'Invoice Team L1' } });
    const radios = () => [...document.querySelectorAll('.modal-body input[type="radio"]')];
    expect(radios().length).toBe(2);
    expect(document.querySelectorAll('.modal-body input[type="checkbox"]').length).toBe(0);
    await user.click(radios()[1]);
    await user.click(radios()[0]);
    expect(radios().map((r) => r.checked)).toEqual([true, false]);
  });

  it('each role sees only the pages and exports its permissions allow', async () => {
    const { store, user } = await loginAdmin();
    const nav = (label) => document.querySelector(`.nav-item[aria-label="${label}"]`);
    // Admin: everything
    for (const label of ['Search Invoice(s)', 'Supplier Visibility', 'Vendor Status Reports', 'Logs / History']) expect(nav(label)).not.toBeNull();

    // Invoice Team L1: search + export only
    store.dispatch(setAuthFromServer({ role: 'Invoice Team L1' }));
    await waitFor(() => expect(nav('Logs / History')).toBeNull());
    expect(nav('Supplier Visibility')).toBeNull();
    expect(nav('Vendor Status Reports')).toBeNull();
    expect(nav('Search Invoice(s)')).not.toBeNull();
    await user.click(nav('Search Invoice(s)'));
    expect(await screen.findByRole('button', { name: /Export to Excel/ })).toBeInTheDocument();

    // L2 adds reports and logs, not Supplier Visibility
    store.dispatch(setAuthFromServer({ role: 'Invoice Team L2' }));
    await waitFor(() => expect(nav('Logs / History')).not.toBeNull());
    expect(nav('Vendor Status Reports')).not.toBeNull();
    expect(nav('Supplier Visibility')).toBeNull();

    // A role without search or export: no Search page, no Export buttons, dashboard tiles don't open Search
    const matrix = store.getState().settings.roleMatrix;
    store.dispatch(hydrateSettings({ roleMatrix: { ...matrix, 'Invoice Team L2': { ...matrix['Invoice Team L2'], createTrace: false, importExport: false } } }));
    await waitFor(() => expect(nav('Search Invoice(s)')).toBeNull());
    await user.click(nav('Logs / History'));
    expect(await screen.findByLabelText('Search the log')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Export/ })).toBeNull();
    await user.click(nav('Invoice Tracking'));
    await screen.findByRole('heading', { name: 'Invoice Tracking' });
    expect(document.querySelector('.kpi-grid button.stat-card')).toBeNull();
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
});
