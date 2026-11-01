import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// The API is mocked in-memory; these tests exercise the real login -> hydrate -> mutate flows
// without a running server. See src/test/apiMock.js and src/test/renderApp.jsx.
vi.mock('../../api/client', async () => {
  const { installApiMock } = await import('../../test/apiMock.js');
  return { api: installApiMock() };
});

import { act, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { setScopeFilter } from '../../features/ui/uiSlice';
import { api as mockApi } from '../../api/client';
import { runtime } from '../../data/runtime';
import { resetAppTestState, loginAdmin } from '../../test/renderApp.jsx';

beforeEach(resetAppTestState);

describe('Internal admin - Supplier Visibility, Vendor Status Reports and Logs', () => {
  it('Vendor Status Reports: the cards switch lists and a supplier filters the invoices', async () => {
    const { store, user } = await loginAdmin();
    store.dispatch(setScopeFilter({ key: 'fy', value: 'all' }));
    await user.click(document.querySelector('.nav-item[aria-label="Vendor Status Reports"]'));
    const card = (label) => [...document.querySelectorAll('button.stat-card')].find((b) => b.querySelector('.lbl')?.textContent === label);
    await waitFor(() => expect(card('Completed Invoices')).toBeTruthy());

    await user.click(card('Suppliers Covered'));
    expect(await screen.findByText('Completed invoices')).toBeInTheDocument(); // the suppliers table
    await user.click(screen.getByRole('button', { name: 'Bosch Auto Components' }));

    expect(await screen.findByText('Supplier: Bosch Auto Components')).toBeInTheDocument();
    expect(screen.getByText('INV-MS-1004')).toBeInTheDocument();
    expect(screen.queryByText('INV-MS-1001')).toBeNull(); // another supplier's paid invoice

    await user.click(screen.getByRole('button', { name: 'Remove supplier filter' }));
    expect(await screen.findByText('INV-MS-1001')).toBeInTheDocument();
  });

  it('Vendor Status Reports: bulk export triggers a toast, no crash', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Vendor Status Reports')[0]);
    const exportButton = await screen.findByRole('button', { name: /Export to Excel/ });
    await user.click(exportButton);
    expect(exportButton).toBeInTheDocument();
  });

  it('Global Logs: has no channel filter of its own (the top bar owns it) and searches', async () => {
    const { user } = await loginAdmin();
    await user.click(document.querySelector('.nav-item[aria-label="Logs / History"]'));
    expect(await screen.findByRole('heading', { name: 'Logs / History' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Logs / History' })).toHaveLength(1);
    expect(screen.queryByLabelText('Filter by channel')).toBeNull();
    expect(screen.getByLabelText('Filter by type')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search the log'), { target: { value: 'zzz-no-such-entry' } });
    expect(await screen.findByText('No log entries match your filters.')).toBeInTheDocument();
  });

  it('Supplier Visibility updates its detailed view when the navbar vendor changes', async () => {
    const { store, user } = await loginAdmin();
    store.dispatch(setScopeFilter({ key: 'vcode', value: 'DIT00388AC' })); // a Tata Communications code
    store.dispatch(setScopeFilter({ key: 'fy', value: 'all' }));
    await user.click(screen.getAllByText('Supplier Visibility')[0]);
    expect(await screen.findByLabelText('Supplier Name')).toHaveValue('Tata Communications Ltd');
    expect(screen.getByLabelText('Vendor Code')).toHaveValue('DIT00388AC');
    act(() => store.dispatch(setScopeFilter({ key: 'vcode', value: 'BFL00456' })));
    expect(screen.getByLabelText('Supplier Name')).toHaveValue('Bharat Forge Ltd');
    expect(screen.getByLabelText('Vendor Code')).toHaveValue('BFL00456');
    expect(screen.getByRole('heading', { name: 'Invoice Status : Bharat Forge Ltd' })).toBeInTheDocument();
    const rows = document.querySelectorAll('.table-scroll tbody tr');
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => expect(row).toHaveTextContent('BFL00456'));
  });

  it('Supplier Visibility picks a PAN, lists its vendor codes, and the KPIs follow the choice', async () => {
    const { store, user } = await loginAdmin();
    const original = [...runtime.invoices];
    try {
      act(() => {
        const base = runtime.invoices.find((invoice) => invoice.channel === 'msetuSrm') || runtime.invoices[0];
        runtime.invoices.splice(0, runtime.invoices.length,
          { ...base, no: 'P1-A', vcode: 'V1AA', vendor: 'Alpha Works', pan: 'AAAAA1111A', status: 'Paid', filterFiscalYear: undefined },
          { ...base, no: 'P1-B', vcode: 'V1AB', vendor: 'Alpha Works', pan: 'AAAAA1111A', status: 'Approved', filterFiscalYear: undefined },
          { ...base, no: 'P2-A', vcode: 'V2AA', vendor: 'Beta Traders', pan: 'BBBBB2222B', status: 'Paid', filterFiscalYear: undefined });
        store.dispatch({ type: 'ui/bumpData' });
        store.dispatch(setScopeFilter({ key: 'fy', value: 'all' }));
        store.dispatch(setScopeFilter({ key: 'vcode', value: '' }));
      });
      await user.click(screen.getAllByText('Supplier Visibility')[0]);
      const kpis = document.querySelector('.supplier-visibility-kpis');
      const total = () => within(kpis).getByRole('button', { name: /^Total Invoices/ });
      expect(total()).toHaveTextContent('3');

      // search by supplier name, pick the PAN
      await user.click(screen.getByRole('combobox', { name: 'PAN' }));
      await user.keyboard('alpha');
      await user.click(screen.getByRole('option', { name: /^AAAAA1111A/ }));
      expect(total()).toHaveTextContent('2');
      expect(screen.getByLabelText('Supplier Name')).toHaveValue('Alpha Works');
      expect(screen.getByRole('combobox', { name: 'Vendor Code' })).toHaveValue('All codes under this PAN (2)');

      // only that PAN's vendor codes are offered
      await user.click(screen.getByRole('combobox', { name: 'Vendor Code' }));
      expect(screen.getByRole('option', { name: /^V1AA/ })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /^V1AB/ })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /^V2AA/ })).toBeNull();
      await user.click(screen.getByRole('option', { name: /^V1AB/ }));
      expect(total()).toHaveTextContent('1');
      expect(store.getState().ui.scope.vcode).toBe('V1AB');
      expect(screen.getByRole('combobox', { name: 'PAN' })).toHaveValue('AAAAA1111A');
      expect(screen.getByRole('button', { name: 'P1-B' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'P1-A' })).toBeNull();

      // back to every supplier
      await user.click(screen.getByRole('combobox', { name: 'PAN' }));
      await user.click(screen.getByRole('option', { name: /^All PANs/ }));
      expect(total()).toHaveTextContent('3');
      expect(store.getState().ui.scope.vcode).toBe('');
    } finally {
      runtime.invoices.splice(0, runtime.invoices.length, ...original);
    }
  });

  it('Supplier Visibility opens the detailed view directly without duplicate navigation', async () => {
    const { store, user } = await loginAdmin();
    store.dispatch(setScopeFilter({ key: 'fy', value: 'all' }));
    await user.click(screen.getAllByText('Supplier Visibility')[0]);
    expect(await screen.findByText('Total Invoice Amount')).toBeInTheDocument();
    expect(screen.getByLabelText('Vendor Code').value).toContain('All Vendors');
    expect(screen.getByRole('heading', { name: 'Invoice Status : All Suppliers' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invoice Log' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open full Supplier Visibility/ })).not.toBeInTheDocument();
  });

  it('Supplier Visibility KPI cards filter invoices and follow invoice dates', async () => {
    const { store, user } = await loginAdmin();
    act(() => {
      store.dispatch(setScopeFilter({ key: 'fy', value: 'all' }));
      store.dispatch(setScopeFilter({ key: 'vcode', value: '' }));
    });
    await user.click(screen.getAllByText('Supplier Visibility')[0]);
    await user.click(screen.getByRole('button', { name: 'All dates' }));
    const kpis = document.querySelector('.supplier-visibility-kpis');
    expect(kpis.querySelectorAll('.stat-card')).toHaveLength(4);
    expect(within(kpis).queryByText('Total POs')).not.toBeInTheDocument();
    const paid = within(kpis).getByRole('button', { name: /^Paid/ });
    await user.click(paid);
    expect(paid).toHaveAttribute('aria-pressed', 'true');
    const paidRows = document.querySelectorAll('.data-table tbody tr');
    expect(paidRows.length).toBeGreaterThan(0);
    paidRows.forEach((row) => expect(row.querySelector('.chip')).toHaveTextContent(/^Paid$/));
    const summary = screen.getByRole('status', { name: 'Filtered invoice amount' });
    expect(summary).toHaveTextContent('across all pages');
    const search = screen.getByPlaceholderText(/^Search all fields/);
    await user.type(search, 'INV-MS-1001');
    expect(summary).toHaveTextContent('1 matching invoice across all pages');
    expect(summary).toHaveTextContent('₹1,24,500.00');
    await user.clear(search);
    await user.click(within(kpis).getByRole('button', { name: /^Total Invoices/ }));
    expect(paid).toHaveAttribute('aria-pressed', 'false');
    const queries = await within(kpis).findByRole('button', { name: /^Open Queries/ });
    await user.click(queries);
    expect(queries).toHaveAttribute('aria-pressed', 'true');
    const { items } = await mockApi.get('/v1/tickets/list-tickets?include_closed=true');
    const queriedInvoices = items.filter((ticket) => ['OPEN', 'IN_PROGRESS'].includes(ticket.status)).map((ticket) => ticket.invoice_no);
    document.querySelectorAll('.data-table tbody tr').forEach((row) => {
      const invoice = row.querySelector('td button');
      if (invoice) expect(queriedInvoices).toContain(invoice.textContent);
    });
    await user.click(within(kpis).getByRole('button', { name: /^Total Invoices/ }));
    fireEvent.change(screen.getByLabelText('Invoice Date From'), { target: { value: '2099-01-01' } });
    expect(within(kpis).getByRole('button', { name: /^Total Invoices/ })).toHaveTextContent('0');
    expect(within(kpis).getByRole('button', { name: /^Paid/ })).toHaveTextContent('0');
    expect(within(kpis).getByText('Total Invoice Amount').parentElement).toHaveTextContent('-');
    expect(screen.getByText('No invoices match')).toBeInTheDocument();
    expect(summary).toHaveTextContent('0 matching invoices');
    expect(summary).toHaveTextContent('—');
  });
});
