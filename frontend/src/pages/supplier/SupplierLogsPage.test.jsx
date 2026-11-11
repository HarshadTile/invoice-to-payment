import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import uiReducer from '../../features/ui/uiSlice';
import { setRuntimeData } from '../../data/runtime';
import SupplierLogsPage from './SupplierLogsPage.jsx';

vi.mock('../../api/workspaceApi', () => ({ workspaceApi: { supplierActivityLog: vi.fn(async () => []) } }));

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const invoice = (no, vcode, status, { uploaded, booked, paid }) => ({
  no, poItem: 10, po: '4500001234', vcode, vendor: 'Demo Supplier', channel: 'msetuSrm', status,
  rawDate: uploaded, rawUploadDate: uploaded, date: uploaded, utr: paid ? 'DEMOUTR1' : '-', amount: '-',
  sap: { document_date: booked, clearing_date: paid || null }, workflow: {},
});

function show() {
  const store = configureStore({
    reducer: {
      ui: uiReducer,
      // a supplier account with two vendor codes; the old page only ever showed the first one
      auth: () => ({ authType: 'supplier', supplierLoginVcode: 'DEMO0001AA', supplierVendorCodes: ['DEMO0001AA', 'DEMO0002AA'] }),
    },
  });
  render(<Provider store={store}><MemoryRouter><SupplierLogsPage /></MemoryRouter></Provider>);
}
const tableRows = () => [...document.querySelectorAll('.log-table tbody tr')].map((tr) => tr.textContent);

beforeEach(() => {
  setRuntimeData({
    invoices: [
      invoice('DEMO/INV/0101', 'DEMO0001AA', 'Paid', { uploaded: daysAgo(12), booked: daysAgo(8), paid: daysAgo(3) }),
      invoice('DEMO/INV/0202', 'DEMO0002AA', 'Pending for Approval', { uploaded: daysAgo(5) }),
      invoice('DEMO/INV/0303', 'DEMO0002AA', 'Pending for Approval', { uploaded: daysAgo(200) }),
    ],
  });
});

describe('Supplier Logs', () => {
  it('covers every vendor code on the account, one row per invoice with its trail', async () => {
    show();
    const rows = tableRows();
    expect(rows.filter((r) => r.includes('DEMO/INV/0101'))).toHaveLength(1); // three milestones, one row
    expect(rows.some((r) => r.includes('DEMO/INV/0202'))).toBe(true);         // the second vendor code
    expect(document.querySelector('.log-trail').textContent).toMatch(/^Uploaded .* → Booked .* → Paid /);
    expect(screen.getByText(/2 invoices and queries · 30 days/)).toBeInTheDocument();
  });

  it('opens on the last 30 days; older invoices appear with a wider range', async () => {
    show();
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(tableRows().some((r) => r.includes('DEMO/INV/0303'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'All dates' }));
    expect(tableRows().some((r) => r.includes('DEMO/INV/0303'))).toBe(true);
    expect(document.querySelector('.log-actions').textContent).toMatch(/Clear/); // wider than the default
  });
});
