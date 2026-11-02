/* Shared setup for the full-app tests in src/__tests__/app/. Each test file mocks the API itself
 * (vi.mock is hoisted per file):
 *
 *   vi.mock('../../api/client', async () => {
 *     const { installApiMock } = await import('../../test/apiMock.js');
 *     return { api: installApiMock() };
 *   });
 */
import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import { ticketsApi } from '../api/ticketsApi';
import { notificationsApi } from '../api/notificationsApi';
import { invoicesQueryApi } from '../api/invoicesQueryApi';
import tablesReducer from '../features/tables/tablesSlice';
import settingsReducer from '../features/settings/settingsSlice';
import uiReducer from '../features/ui/uiSlice';
import AppRoutes from '../routes/AppRoutes.jsx';
import ToastStack from '../components/common/ToastStack.jsx';
import { selectScopedInvoices, selectFilteredInvoices, selectFilteredInvoicesAnyChannel, selectFilteredInvoicesAnyVendor } from '../features/invoices/selectors';

export function freshStore() {
  return configureStore({
    reducer: { auth: authReducer, tables: tablesReducer, settings: settingsReducer, ui: uiReducer, [ticketsApi.reducerPath]: ticketsApi.reducer, [notificationsApi.reducerPath]: notificationsApi.reducer, [invoicesQueryApi.reducerPath]: invoicesQueryApi.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(ticketsApi.middleware, notificationsApi.middleware, invoicesQueryApi.middleware),
  });
}

export function renderApp(store, path = '/login?account=internal') {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <ToastStack />
      </MemoryRouter>
    </Provider>,
  );
}

/** Run in beforeEach: browser stubs jsdom lacks, and a clean selector cache. */
export function resetAppTestState() {
  // Invoice selectors are memoised module-wide on (auth, dataVersion); each test's fresh store
  // starts at the same dataVersion, so drop the cache or a test can see the previous test's rows.
  for (const selector of [selectScopedInvoices, selectFilteredInvoices, selectFilteredInvoicesAnyChannel, selectFilteredInvoicesAnyVendor]) {
    selector.clearCache();
    selector.memoizedResultFunc.clearCache();
  }
  window.HTMLElement.prototype.scrollBy = vi.fn();
  global.URL.createObjectURL = vi.fn(() => 'blob:stub');
  global.URL.revokeObjectURL = vi.fn();
  window.confirm = vi.fn(() => true);
}

/** Signs in as the mock Admin (All channels) and waits for the dashboard. */
export async function loginAdmin() {
  const store = freshStore();
  const user = userEvent.setup();
  renderApp(store);
  await user.type(screen.getByLabelText('Enter Email ID'), 'admin');
  await user.type(screen.getByLabelText('Password'), 'admin123');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('heading', { name: 'Invoice Tracking' });
  return { store, user };
}

/** Signs in as the mock supplier and waits for its dashboard. */
export async function loginSupplier() {
  const store = freshStore();
  const user = userEvent.setup();
  renderApp(store, '/supplier/login');
  await user.type(screen.getByLabelText('Email'), 'supplier@example.com');
  await user.type(screen.getByLabelText('Password'), 'supplier123');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText('Total Invoices');
  return { store, user };
}
