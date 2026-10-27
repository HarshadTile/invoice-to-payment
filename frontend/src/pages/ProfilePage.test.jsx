import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { setAuthFromServer } from '../features/auth/authSlice';
import uiReducer from '../features/ui/uiSlice';
import ProfilePage from './ProfilePage.jsx';

function renderProfile(auth) {
  const store = configureStore({ reducer: { auth: authReducer, ui: uiReducer } });
  store.dispatch(setAuthFromServer(auth));
  return render(<Provider store={store}><ProfilePage /></Provider>);
}

describe('ProfilePage', () => {
  it('shows who you are, and has no Security / password reset section', () => {
    renderProfile({
      authType: 'internal', channelScope: 'all', role: 'Admin', ticketRole: 'ADMIN', id: 1,
      currentUser: { name: 'Administrator', fullName: 'Administrator', initials: 'A', email: 'admin@company.com', title: 'System Administrator', dept: 'IT' },
    });
    expect(screen.getByRole('heading', { name: 'Administrator' })).toBeInTheDocument();
    expect(screen.getByText('admin@company.com')).toBeInTheDocument();
    expect(screen.getByText('All channels (HQ / Admin)')).toBeInTheDocument();
    expect(screen.queryByText('Security')).toBeNull();
    expect(screen.queryByText('Password')).toBeNull();
    expect(screen.queryByRole('button', { name: /reset link/i })).toBeNull();
  });

  it('hides the Work card when the account has no job title or department', () => {
    renderProfile({
      authType: 'internal', channelScope: 'all', role: 'Admin', ticketRole: 'ADMIN', id: 2,
      currentUser: { name: 'gits', fullName: 'gits', initials: 'G', email: 'gits@example.com', title: '', dept: '' },
    });
    expect(screen.getByText('gits@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Work' })).toBeNull();
    expect(screen.queryByText('Not set')).toBeNull();
  });

  it('shows only the Work rows that have a value', () => {
    renderProfile({
      authType: 'internal', channelScope: 'all', role: 'Admin', ticketRole: 'ADMIN', id: 3,
      currentUser: { name: 'Sam', fullName: 'Sam', initials: 'S', email: 'sam@example.com', title: 'Lead', dept: '' },
    });
    expect(screen.getByRole('heading', { name: 'Work' })).toBeInTheDocument();
    const work = screen.getByRole('heading', { name: 'Work' }).closest('section');
    expect(within(work).getByText('Lead')).toBeInTheDocument();
    expect(within(work).queryByText('Department')).toBeNull();
  });
});
