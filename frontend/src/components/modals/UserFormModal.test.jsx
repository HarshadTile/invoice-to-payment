import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import UserFormModal from './UserFormModal.jsx';

const ROLES = ['Invoice Team L1', 'Invoice Team L2', 'Admin'];

function renderForm({ user = null, channelAvailability = { msetuSrm: true, poPortal: true, mfoxPortal: false } } = {}) {
  const onSave = vi.fn(() => Promise.resolve());
  const store = configureStore({ reducer: { settings: () => ({ channelAvailability }) } });
  render(
    <Provider store={store}>
      <UserFormModal user={user} roles={ROLES} onClose={vi.fn()} onSave={onSave} />
    </Provider>,
  );
  return { onSave, user: userEvent.setup() };
}

const nameInput = () => screen.getByText('Full Name').parentElement.querySelector('input');
const emailInput = () => screen.getByText('Email').parentElement.querySelector('input');
const create = () => screen.getByRole('button', { name: 'Create User & Generate Link' });

describe('UserFormModal validation', () => {
  it('requires a name, a valid email and one channel for a non-Admin', async () => {
    const { onSave, user } = renderForm();
    await user.click(create());
    expect(screen.getByRole('alert')).toHaveTextContent('Full name is required.');
    await user.type(nameInput(), 'Priya Nair');
    await user.type(emailInput(), 'priya@');
    await user.click(create());
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    await user.type(emailInput(), 'example.com');
    await user.click(create());
    expect(screen.getByRole('alert')).toHaveTextContent('Select the channel this user can access.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves one channel and the chosen ticket role', async () => {
    const { onSave, user } = renderForm();
    await user.type(nameInput(), 'Priya Nair');
    await user.type(emailInput(), 'priya@example.com');
    await user.click(screen.getByLabelText('PO Portal'));
    await user.selectOptions(screen.getByText('Ticket Role').parentElement.querySelector('select'), 'ASSIGNEE');
    await user.click(create());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Priya Nair', email: 'priya@example.com', role: 'Invoice Team L1', channels: ['poPortal'], ticketRole: 'ASSIGNEE',
    }));
  });

  it('gives Admin all channels and the inherited ticket role', async () => {
    const { onSave, user } = renderForm();
    await user.selectOptions(screen.getByText('Application Role').parentElement.querySelector('select'), 'Admin');
    expect(screen.getByDisplayValue('Admin (inherited)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('All Channels — HQ / Admin')).toBeInTheDocument();
    await user.type(nameInput(), 'Second Admin');
    await user.type(emailInput(), 'admin2@example.com');
    await user.click(create());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ role: 'Admin', channels: [], ticketRole: undefined }));
  });

  it('offers only enabled portals as channels', () => {
    renderForm();
    expect(screen.getByLabelText('Msetu / SRM')).toBeInTheDocument();
    expect(screen.queryByLabelText('MFOX Portal')).not.toBeInTheDocument();
  });

  it('shows an invited user as waiting for a password instead of a status choice', () => {
    renderForm({ user: { name: 'New', email: 'new@example.com', role: 'Invoice Team L1', status: 'Invited', channels: ['msetuSrm'] } });
    expect(screen.getByDisplayValue("Invited — hasn't set a password yet")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
  });
});
