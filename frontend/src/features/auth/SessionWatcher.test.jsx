import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import authReducer, { setAuthFromServer } from './authSlice';
import { ticketsApi } from '../../api/ticketsApi';
import { SESSION_ENDED_EVENT, SESSION_MESSAGE_KEY } from '../../api/client';
import SessionWatcher from './SessionWatcher.jsx';

vi.mock('../../api/client', async (actual) => ({
  ...(await actual()),
  api: { hasToken: () => false, get: vi.fn(() => Promise.resolve({})) },
}));

function setup(authType) {
  const store = configureStore({
    reducer: { auth: authReducer, [ticketsApi.reducerPath]: ticketsApi.reducer },
    middleware: (getDefault) => getDefault().concat(ticketsApi.middleware),
  });
  store.dispatch(setAuthFromServer({ authType, channelScope: 'all', role: 'Admin', currentUser: {} }));
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/app/invoices']}>
        <SessionWatcher />
        <Routes>
          <Route path="/app/invoices" element={<p>Dashboard</p>} />
          <Route path="/login" element={<p>Sign in page</p>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

describe('session ended by the server', () => {
  it('signs out locally and opens sign-in with the reason', () => {
    const store = setup('internal');
    act(() => { window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail: { message: 'Your session has ended. Please sign in again.' } })); });
    expect(screen.getByText('Sign in page')).toBeInTheDocument();
    expect(store.getState().auth.loggedIn).toBe(false);
    expect(sessionStorage.getItem(SESSION_MESSAGE_KEY)).toBe('Your session has ended. Please sign in again.');
    sessionStorage.removeItem(SESSION_MESSAGE_KEY);
  });
});
