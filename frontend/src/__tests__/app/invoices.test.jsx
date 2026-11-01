import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// The API is mocked in-memory; these tests exercise the real login -> hydrate -> mutate flows
// without a running server. See src/test/apiMock.js and src/test/renderApp.jsx.
vi.mock('../../api/client', async () => {
  const { installApiMock } = await import('../../test/apiMock.js');
  return { api: installApiMock() };
});

import { act, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { api } from '../../api/client';
import { setScopeFilter } from '../../features/ui/uiSlice';
import { runtime } from '../../data/runtime';
import { resetAppTestState, loginAdmin } from '../../test/renderApp.jsx';

beforeEach(resetAppTestState);

describe('Internal admin - Invoice tracking, search and invoice details', () => {
  it('keeps SRM invoice filters when switching to dated history', async () => {
    const { store, user } = await loginAdmin();
    act(() => {
      runtime.invoices.forEach((invoice) => { invoice.rawUploadDate = '2026-10-01'; });
      store.dispatch({ type: 'ui/bumpData' });
      store.dispatch(setScopeFilter({ key: 'fy', value: 'all' }));
    });
    await user.click(screen.getAllByText('Msetu / SRM')[0]);
    await user.click(screen.getByRole('button', { name: 'Filter by status' }));
    await user.click(screen.getByRole('option', { name: /^Paid/ }));
    await user.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findAllByText('Invoice uploaded')).not.toHaveLength(0);
    expect(screen.getByText('INV-MS-1001')).toBeInTheDocument();
    expect(screen.queryByText('INV-MS-1005')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Invoice Register' }));
    expect(screen.getByRole('button', { name: 'INV-MS-1001' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'INV-MS-1005' })).toBeNull();
  });

  it('opens the invoice stage popup from the Recent Invoices list', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByTitle('Open current stage')[0]);
    expect(await screen.findByText(/Open in /)).toBeInTheDocument();
    await user.click(screen.getAllByText('✕')[0]);
    expect(screen.queryByText(/Open in /)).not.toBeInTheDocument();
  });

  it('opens the full Invoice Detail modal from Search Invoice(s)', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Search Invoice(s)')[0]);
    await user.type(await screen.findByPlaceholderText(/invoice no, po no/i), 'INV-MS-1001');
    const link = await screen.findByRole('button', { name: 'INV-MS-1001' });
    await user.click(link);
    expect(await screen.findByText(/Invoice Progress/)).toBeInTheDocument();
    await user.click(screen.getAllByText('✕')[0]);
    expect(screen.queryByText(/Invoice Progress/)).not.toBeInTheDocument();
  });

  it('shows invoice progress without manual stage controls', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Search Invoice(s)')[0]);
    await user.type(await screen.findByPlaceholderText(/invoice no, po no/i), 'INV-MS-1003');
    await user.click(await screen.findByRole('button', { name: 'INV-MS-1003' }));
    expect(await screen.findByText('Invoice Progress')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark Approved' })).not.toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('shows payment status and UTR without manual payment controls', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Search Invoice(s)')[0]);
    await user.type(await screen.findByPlaceholderText(/invoice no, po no/i), 'INV-MS-1002'); // Payment Due
    await user.click(await screen.findByRole('button', { name: 'INV-MS-1002' }));
    expect(await screen.findByText('Current Status')).toBeInTheDocument();
    expect(screen.getByText('UTR No.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark Paid' })).not.toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('previews a vendor code and opens its full view', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('DIT00388AC')[0]);
    expect(await screen.findByText('Purchase Orders')).toBeInTheDocument();
    await user.click(screen.getAllByText('Open Full View →')[0]);
    expect(await screen.findByLabelText('Vendor Code')).toHaveValue('DIT00388AC');
    expect(screen.getByRole('heading', { name: 'Invoice Status : Tata Communications Ltd' })).toBeInTheDocument();
  });

  it('the internal team has no Raise a Query option anywhere on the invoice lists', async () => {
    const { user } = await loginAdmin();
    expect(screen.queryAllByTitle('Raise a query on this invoice')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Raise query/i })).not.toBeInTheDocument();
    // ...including the full channel invoice tables
    await user.click(screen.getAllByText('Msetu / SRM')[0]);
    await screen.findByRole('heading', { name: (name) => name.endsWith('Msetu / SRM') });
    expect(screen.queryAllByTitle('Raise a query on this invoice')).toHaveLength(0);
  });

  it('clicking a month on the dashboard opens Search for that month and keeps the saved status', async () => {
    const { store, user } = await loginAdmin();
    const original = [...runtime.invoices];
    try {
      act(() => {
        const base = runtime.invoices.find((invoice) => invoice.channel === 'msetuSrm') || runtime.invoices[0];
        runtime.invoices.splice(0, runtime.invoices.length,
          { ...base, no: 'MAR-PAID', status: 'Paid', rawDate: '2026-03-10', filterFiscalYear: undefined },
          { ...base, no: 'MAR-OPEN', status: 'Approved', rawDate: '2026-03-20', filterFiscalYear: undefined },
          { ...base, no: 'APR-PAID', status: 'Paid', rawDate: '2026-04-05', filterFiscalYear: undefined });
        store.dispatch({ type: 'ui/bumpData' });
        store.dispatch(setScopeFilter({ key: 'fy', value: 'all' }));
        store.dispatch(setScopeFilter({ key: 'dateField', value: 'invoice' }));
        store.dispatch({ type: 'ui/setPageFilters', payload: { key: 'searchInvoice', filters: { q: '', status: 'Paid', productType: '', dateFrom: '', dateTo: '' } } });
      });
      await screen.findByRole('heading', { name: 'Invoice Tracking' });
      const march = [...document.querySelectorAll('.col-slot')].find((b) => b.querySelector('.col-x').textContent === 'Mar 26');
      await user.click(march);
      expect(screen.getByLabelText(/Date From$/)).toHaveValue('2026-03-01');
      expect(screen.getByLabelText(/Date To$/)).toHaveValue('2026-03-31');
      expect(screen.getByRole('button', { name: 'Filter by status' })).toHaveTextContent('Paid');
      expect(screen.getByRole('button', { name: 'MAR-PAID' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'MAR-OPEN' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'APR-PAID' })).not.toBeInTheDocument();
      expect(screen.getByText(/Mar 2026 ·/)).toBeInTheDocument();
      // back on the dashboard the month stays highlighted and can be cleared there
      await user.click(screen.getByRole('button', { name: 'Back to Invoice Tracking' }));
      expect(await screen.findByText('Mar 26', { selector: '.col-slot.selected .col-x' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Clear' }));
      expect(document.querySelector('.col-slot.selected')).toBeNull();
      expect(store.getState().ui.pageFilters.searchInvoice).toMatchObject({ status: 'Paid', dateFrom: '', dateTo: '' });
    } finally {
      runtime.invoices.splice(0, runtime.invoices.length, ...original);
    }
  });

  it('the Service and Material cards open Search filtered to that product type', async () => {
    const { store, user } = await loginAdmin();
    const original = [...runtime.invoices];
    try {
      act(() => {
        const base = runtime.invoices.find((invoice) => invoice.channel === 'msetuSrm') || runtime.invoices[0];
        runtime.invoices.splice(0, runtime.invoices.length,
          { ...base, no: 'SVC-1', productType: 'S', invoiceType: 'Service', status: 'Paid', filterFiscalYear: undefined },
          { ...base, no: 'SVC-2', productType: 'S', invoiceType: 'Service', status: 'Approved', filterFiscalYear: undefined },
          { ...base, no: 'MAT-1', productType: 'M', invoiceType: 'Material', status: 'Paid', filterFiscalYear: undefined });
        store.dispatch({ type: 'ui/bumpData' });
        store.dispatch(setScopeFilter({ key: 'fy', value: 'all' }));
      });
      await screen.findByRole('heading', { name: 'Invoice Tracking' });
      await user.click(screen.getByRole('button', { name: /^Service: 2 invoices/ }));
      expect(await screen.findByText('Service invoices')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Filter by product type' })).toHaveTextContent('Service');
      expect(screen.getByRole('button', { name: 'Filter by status' })).toHaveTextContent('All');
      expect(screen.getByRole('button', { name: 'SVC-1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'SVC-2' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'MAT-1' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Back to Invoice Tracking' }));
      await user.click(await screen.findByRole('button', { name: /^Material: 1 invoices/ }));
      expect(await screen.findByText('Material invoices')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'MAT-1' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'SVC-1' })).not.toBeInTheDocument();
    } finally {
      runtime.invoices.splice(0, runtime.invoices.length, ...original);
    }
  });

  it('the Total Invoices KPI opens Search with every status, keeping the top-bar filters', async () => {
    const { store, user } = await loginAdmin();
    act(() => store.dispatch(setScopeFilter({ key: 'vcode', value: 'DIT00388AC' })));
    await screen.findByRole('heading', { name: 'Invoice Tracking' });
    const totalCard = [...document.querySelectorAll('button.stat-card')].find((b) => b.querySelector('.lbl')?.textContent === 'Total Invoices');
    expect(totalCard).toBeTruthy();
    await user.click(totalCard);
    expect(await screen.findByText('All invoices')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter by status' })).toHaveTextContent('All');
    expect(store.getState().ui.scope.vcode).toBe('DIT00388AC');
    const rows = [...document.querySelectorAll('.invoice-list-table tbody tr')];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.textContent).toContain('DIT00388AC');
  });

  it('invoice progress: a Paid invoice is complete, not "In progress"', async () => {
    const { user } = await loginAdmin();
    await user.click(document.querySelector('.nav-item[aria-label="Search Invoice(s)"]'));
    await user.click(await screen.findByRole('button', { name: 'All dates' }));
    const open = async (no) => {
      await user.click(await screen.findByRole('button', { name: no }));
      await screen.findByText('Invoice Progress');
    };
    await open('INV-MS-1001'); // Paid
    expect(screen.queryByText('In progress')).toBeNull();
    await user.click(within(document.querySelector('.modal-foot')).getByRole('button', { name: 'Close' }));
    await open('INV-MS-1002'); // Payment Due: still moving
    expect(screen.getByText('In progress')).toBeInTheDocument();
  });

  it('shows plant and division filters only on the SRM workspace; product type also on Search', async () => {
    const { user } = await loginAdmin();
    const srmControls = () => ['Filter by plant code', 'Filter by division', 'Filter by product type']
      .map((name) => screen.queryByRole('button', { name }));
    await user.click(screen.getAllByText('Search Invoice(s)')[0]);
    const [plant, division, product] = srmControls();
    expect(plant).toBeNull();
    expect(division).toBeNull();
    expect(product).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Date type' })).toBeInTheDocument();
    await user.click(screen.getAllByText('Msetu / SRM')[0]);
    srmControls().forEach((control) => expect(control).toBeInTheDocument());
    await user.type(screen.getByLabelText('Search SRM invoices'), 'Material');
    await user.click(screen.getAllByText('PO Portal')[0]);
    srmControls().forEach((control) => expect(control).toBeNull());
    await user.click(screen.getAllByText('Search Invoice(s)')[0]);
    srmControls().slice(0, 2).forEach((control) => expect(control).toBeNull());
    await user.click(screen.getAllByText('Msetu / SRM')[0]);
    srmControls().forEach((control) => expect(control).toBeInTheDocument());
    expect(screen.getByLabelText('Search SRM invoices')).toHaveValue('Material');
  });

  it('Search Invoice(s) returns matching results', async () => {
    const { user } = await loginAdmin();
    await user.click(screen.getAllByText('Search Invoice(s)')[0]);
    await user.type(await screen.findByPlaceholderText(/invoice no, po no/i), 'INV-MS-1001');
    expect(await screen.findByText(/1 invoice/i)).toBeInTheDocument();
  });

  it('Search Invoice(s) searches product type and other table columns through the master bar', async () => {
    const { store, user } = await loginAdmin();
    act(() => {
      const base = runtime.invoices.find((invoice) => invoice.no === 'INV-MS-1001');
      runtime.invoices.splice(0, runtime.invoices.length,
        { ...base, no: 'MASTER-M', productType: 'M', invoiceType: 'Material', plant: 'H001', dvType: 'AUTO DV',
          filterFiscalYear: 2027, rawDate: '2026-10-30', status: 'Approved', rejectionReason: undefined, shortPayReason: undefined,
          workflow: { pending_with: 'First Reviewer' }, sap: { currency: 'INR', net_due_date: '2026-11-01' } },
        { ...base, no: 'MASTER-S', productType: 'S', invoiceType: 'Service', plant: 'AMKT', dvType: 'CORPORATE DV',
          filterFiscalYear: 2027, rawDate: '2026-10-30', status: 'Paid', rejectionReason: undefined, shortPayReason: undefined,
          workflow: {}, sap: { currency: 'INR' } });
      store.dispatch({ type: 'ui/bumpData' });
      store.dispatch(setScopeFilter({ key: 'fy', value: 'all' }));
    });
    await user.click(screen.getAllByText('Search Invoice(s)')[0]);
    const input = screen.getByRole('textbox', { name: /Search all invoice table fields/ });
    for (const query of ['Material', 'H001', 'AUTO DV', 'First Reviewer', '01 Nov 2026']) {
      fireEvent.change(input, { target: { value: query } });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Export to Excel (1)' })).toBeEnabled());
      expect(screen.getByRole('button', { name: 'MASTER-M' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'MASTER-S' })).not.toBeInTheDocument();
    }
    expect(screen.getByText(/Searches all table fields/)).toBeInTheDocument();
  });

  it('Search Invoice(s) keeps the latest typed query, correct export count and clear behavior', async () => {
    const { store, user } = await loginAdmin();
    act(() => store.dispatch(setScopeFilter({ key: 'fy', value: 'all' })));
    await user.click(screen.getAllByText('Search Invoice(s)')[0]);
    const input = await screen.findByPlaceholderText(/invoice no, po no/i);
    fireEvent.change(input, { target: { value: 'NO-SUCH-INVOICE' } });
    fireEvent.change(input, { target: { value: 'INV-MS-1001' } });
    expect(input).toHaveValue('INV-MS-1001');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export to Excel (1)' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'INV-MS-1001' })).toBeInTheDocument();
    expect(store.getState().ui.pageFilters.searchInvoice.q).toBe('INV-MS-1001');
    await user.click(screen.getByRole('button', { name: 'Clear', exact: true }));
    expect(input).toHaveValue('');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Export to Excel (1)' })).not.toBeInTheDocument());
    expect(document.querySelector('.search-results')).toHaveAttribute('aria-busy', 'false');
  });

  it('Search Invoice(s) filters by product type from the chip row and clears it', async () => {
    const { store, user } = await loginAdmin();
    // Earlier tests may have swapped the shared runtime list, so copy any row and put it back afterwards.
    const original = [...runtime.invoices];
    try {
      act(() => {
        const base = runtime.invoices.find((invoice) => invoice.channel === 'msetuSrm') || runtime.invoices[0];
        runtime.invoices.splice(0, runtime.invoices.length,
          { ...base, no: 'TYPE-M', productType: 'M', invoiceType: 'Material', filterFiscalYear: undefined },
          { ...base, no: 'TYPE-S', productType: 'S', invoiceType: 'Service', filterFiscalYear: undefined });
        store.dispatch({ type: 'ui/bumpData' });
        store.dispatch(setScopeFilter({ key: 'fy', value: 'all' }));
      });
      await user.click(screen.getAllByText('Search Invoice(s)')[0]);
      await user.click(screen.getByRole('button', { name: 'Filter by product type' }));
      await user.click(screen.getByRole('option', { name: /^Material/ }));
      expect(screen.getByRole('button', { name: 'TYPE-M' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'TYPE-S' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Filter by product type' })).toHaveTextContent('Material');
      expect(store.getState().ui.pageFilters.searchInvoice.productType).toBe('Material');
      await user.click(screen.getByRole('button', { name: 'Clear', exact: true }));
      expect(store.getState().ui.pageFilters.searchInvoice.productType).toBe('');
    } finally {
      runtime.invoices.splice(0, runtime.invoices.length, ...original);
    }
  });
});
