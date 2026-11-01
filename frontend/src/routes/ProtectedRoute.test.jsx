import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import uiReducer from '../features/ui/uiSlice';
import {
  RequireCapability, RequireHQ, RequireInternal, RequireOwnChannel, RequireSupplier, RequireTicketAccess,
  SettingsIndexRedirect,
} from './ProtectedRoute.jsx';

const ADMIN_PERMS = { manageConfig: true, manageUsers: true, manageRoles: true, viewAuditLog: true, createTrace: true };

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderAt(path, auth, routes, roleMatrix = {}) {
  const store = configureStore({
    reducer: {
      auth: () => ({ loggedIn: true, authType: 'internal', channelScope: 'all', role: 'Tester', ticketRole: 'ADMIN', ...auth }),
      settings: () => ({ roleMatrix }),
      ui: uiReducer,
    },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          {routes}
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return { store, where: () => screen.getByTestId('where').textContent };
}

const page = (text) => <p>{text}</p>;

describe('RequireInternal / RequireSupplier', () => {
  const routes = [
    <Route key="i" element={<RequireInternal />}><Route path="/app/invoices" element={page('internal page')} /></Route>,
    <Route key="s" element={<RequireSupplier />}><Route path="/supplier/dashboard" element={page('supplier page')} /></Route>,
  ];

  it('sends a signed-out visitor to the right sign-in tab', () => {
    const { where } = renderAt('/app/invoices', { loggedIn: false }, routes);
    expect(where()).toBe('/login?account=internal');
  });

  it('redirects a supplier away from internal pages with a toast', () => {
    const { store } = renderAt('/app/invoices', { authType: 'supplier' }, routes);
    expect(screen.getByText('supplier page')).toBeInTheDocument();
    expect(store.getState().ui.toasts[0].msg).toMatch(/signed in as a supplier/);
  });

  it('redirects internal staff away from supplier pages', () => {
    renderAt('/supplier/dashboard', {}, routes);
    expect(screen.getByText('internal page')).toBeInTheDocument();
  });
});

describe('RequireOwnChannel', () => {
  const routes = [
    <Route key="c" element={<RequireOwnChannel />}><Route path="/app/channel/:key" element={<Where />} /></Route>,
  ];

  it('keeps a channel user on their own channel page', () => {
    const { where } = renderAt('/app/channel/msetuSrm', { channelScope: 'poPortal' }, routes);
    expect(where()).toBe('/app/channel/poPortal');
  });

  it('lets HQ open any channel page', () => {
    const { where } = renderAt('/app/channel/msetuSrm', { channelScope: 'all' }, routes);
    expect(where()).toBe('/app/channel/msetuSrm');
  });
});

describe('RequireHQ, RequireCapability, RequireTicketAccess', () => {
  it('hides HQ-only pages from a channel login', () => {
    const routes = [<Route key="h" element={<RequireHQ />}><Route path="/app/logs" element={page('logs')} /></Route>];
    const { where } = renderAt('/app/logs', { channelScope: 'msetuSrm' }, routes);
    expect(where()).toBe('/app/invoices');
  });

  it('opens a page only when the role has the capability', () => {
    const routes = [<Route key="c" element={<RequireCapability cap="viewReports" />}><Route path="/app/outputs" element={page('reports')} /></Route>];
    renderAt('/app/outputs', {}, routes, { Tester: { viewReports: true } });
    expect(screen.getByText('reports')).toBeInTheDocument();
  });

  it('redirects when the capability is missing', () => {
    const routes = [<Route key="c" element={<RequireCapability cap="viewReports" />}><Route path="/app/outputs" element={page('reports')} /></Route>];
    const { where } = renderAt('/app/outputs', {}, routes, { Tester: { viewReports: false } });
    expect(where()).toBe('/app/invoices');
  });

  it('keeps staff without a ticket role out of the Inquiry Desk', () => {
    const routes = [<Route key="t" element={<RequireTicketAccess />}><Route path="/app/inquiry-desk" element={page('desk')} /></Route>];
    const { where } = renderAt('/app/inquiry-desk', { ticketRole: 'NO_ACCESS' }, routes);
    expect(where()).toBe('/app/invoices');
  });
});

describe('SettingsIndexRedirect', () => {
  const routes = [<Route key="s" path="/app/settings" element={<SettingsIndexRedirect />} />];

  it.each([
    [ADMIN_PERMS, '/app/settings/integrations'],
    [{ manageUsers: true }, '/app/settings/users'],
    [{ manageRoles: true }, '/app/settings/roles'],
    [{ viewAuditLog: true }, '/app/settings/auditLogs'],
    [{}, '/app/invoices'],
  ])('opens the first settings page the role may use (%j)', (perms, target) => {
    const { where } = renderAt('/app/settings', {}, routes, { Tester: perms });
    expect(where()).toBe(target);
  });
});
