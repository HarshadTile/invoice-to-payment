import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BreadcrumbProvider, PageBreadcrumb } from './Breadcrumb.jsx';

let go;
function Page() {
  const location = useLocation();
  go = useNavigate();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

function show(entries, { authType = 'internal' } = {}) {
  const store = configureStore({ reducer: { auth: () => ({ authType, channelScope: 'all' }) } });
  render(<Provider store={store}><MemoryRouter initialEntries={entries}>
    <BreadcrumbProvider><PageBreadcrumb /><Routes><Route path="*" element={<Page />} /></Routes></BreadcrumbProvider>
  </MemoryRouter></Provider>);
}
const crumb = () => document.querySelector('.back-banner');
const where = () => screen.getByTestId('where').textContent;

describe('page breadcrumb', () => {
  it('shows nothing on the home page you started on', () => {
    show(['/app/invoices']);
    expect(crumb()).toBeNull();
  });

  it('leads a page opened directly to its natural parent', () => {
    show(['/app/inquiry-desk/TCK-1']);
    expect(crumb()).toHaveTextContent('Inquiry Desk/Inquiry Desk');
    show(['/app/settings/users']);
    expect(document.querySelectorAll('.back-banner')[1]).toHaveTextContent('Invoice Tracking/User Management');
  });

  it('names the page you came from and returns to it with its filters', () => {
    show(['/app/invoices']);
    act(() => go('/app/search?status=Paid&date_from=2026-03-01&date_to=2026-03-31'));
    act(() => go('/app/channel/poPortal'));
    expect(crumb()).toHaveTextContent('Search Invoice(s)/PO Portal');
    fireEvent.click(screen.getByRole('button', { name: 'Back to Search Invoice(s)' }));
    expect(where()).toBe('/app/search?status=Paid&date_from=2026-03-01&date_to=2026-03-31');
    expect(crumb()).toHaveTextContent('Invoice Tracking/Search Invoice(s)');
  });

  it('keeps the same parent while a page only rewrites its own filters', () => {
    show(['/app/invoices']);
    act(() => go('/app/search'));
    act(() => go('/app/search?q=krios', { replace: true }));
    expect(crumb()).toHaveTextContent('Invoice Tracking/Search Invoice(s)');
    fireEvent.click(screen.getByRole('button', { name: 'Back to Invoice Tracking' }));
    expect(where()).toBe('/app/invoices');
  });

  it('uses the supplier dashboard for suppliers', () => {
    show(['/supplier/logs'], { authType: 'supplier' });
    fireEvent.click(screen.getByRole('button', { name: 'Back to Dashboard' }));
    expect(where()).toBe('/supplier/dashboard');
  });

  it('leaves an open supplier invoice to its own breadcrumb', () => {
    show(['/supplier/home?open=INV-1'], { authType: 'supplier' });
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
  });
});
