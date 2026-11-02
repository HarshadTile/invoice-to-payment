import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import uiReducer from '../../features/ui/uiSlice';
import { downloadCSV } from '../../utils/csv';
import InvoiceTable from './InvoiceTable.jsx';
import SrmDataTable from './SrmDataTable.jsx';
import InvoiceFilterBar from './InvoiceFilterBar.jsx';

vi.mock('../../utils/csv', async (importOriginal) => ({ ...await importOriginal(), downloadCSV: vi.fn() }));

const invoice = (no) => ({
  no, po: '650001', poItem: 10, productType: 'S', channel: 'msetuSrm', vcode: 'V1', vendor: 'Supplier', status: 'Paid',
  rawDate: '2026-10-01', rawUploadDate: '2026-10-02', date: '03 Oct 2026', amount: '₹100.00', utr: 'UTR1',
  workflow: {}, sap: { net_due_date: '2026-11-01', clearing_date: '2026-10-03' },
});

function show(ui) {
  const store = configureStore({ reducer: { ui: uiReducer, auth: () => ({ authType: 'internal', channelScope: 'all', role: 'Admin' }) } });
  render(<Provider store={store}><MemoryRouter>{ui}</MemoryRouter></Provider>);
  return store;
}

beforeEach(() => vi.clearAllMocks());

describe('InvoiceTable paged on the server', () => {
  const server = () => ({ total: 35, sort: { key: null, dir: null }, onSort: vi.fn(), onExport: vi.fn(async () => {}),
    amountSummary: { known: 30, value: '₹3,500.00' } });

  it('shows the page it is given with the server total, and sends sorting to the server', () => {
    const s = server();
    show(<InvoiceTable invoices={[invoice('A'), invoice('B')]} server={s} tableKey="srv" mode="full" />);
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + the page, not sliced or searched again
    expect(screen.getByText('Showing 1 to 10 of 35 entries')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Invoice Date/ }));
    expect(s.onSort).toHaveBeenCalledWith('invoice');
  });

  it('exports every matching invoice through the server, or only the selected ones', async () => {
    const s = server();
    show(<InvoiceTable invoices={[invoice('A'), invoice('B')]} server={s} tableKey="srv-export" mode="full" bulk />);
    fireEvent.click(screen.getByRole('button', { name: /Export to Excel \(35\)/ }));
    await waitFor(() => expect(s.onExport).toHaveBeenCalledWith({ invoiceNumbers: undefined, filename: 'Invoices' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select invoice B' }));
    fireEvent.click(screen.getByRole('button', { name: /Export Selected to Excel/ }));
    await waitFor(() => expect(s.onExport).toHaveBeenLastCalledWith({ invoiceNumbers: ['B'], filename: 'Selected_Invoices' }));
    expect(downloadCSV).not.toHaveBeenCalled(); // nothing built from just this page
  });

  it('shows the amount the server totalled for all pages', () => {
    show(<InvoiceTable invoices={[invoice('A')]} server={server()} tableKey="srv-amount" mode="full" showFilteredAmount />);
    const summary = screen.getByRole('status', { name: 'Filtered invoice amount' });
    expect(summary).toHaveTextContent('35 matching invoices across all pages');
    expect(summary).toHaveTextContent('Amount available for 30 of 35 invoices');
    expect(summary).toHaveTextContent('₹3,500.00');
  });
});

describe('SrmDataTable paged on the server', () => {
  it('counts from the server, sorts by the column\'s server field and exports every matching row', async () => {
    const server = { total: 50, onSort: vi.fn(), fetchAll: vi.fn(async () => [invoice('A'), invoice('B')]) };
    show(<SrmDataTable invoices={[invoice('A')]} view="Invoice Log" canExport server={server} />);
    expect(screen.getByText('50 matching')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Invoice Date/ }));
    await waitFor(() => expect(server.onSort).toHaveBeenLastCalledWith('invoice:desc'));
    fireEvent.click(screen.getByRole('button', { name: /Export to Excel \(50\)/ }));
    await waitFor(() => expect(downloadCSV).toHaveBeenCalled());
    expect(server.fetchAll).toHaveBeenCalled();
    expect(downloadCSV.mock.calls[0][2]).toHaveLength(2); // every matching row, not just the page
  });
});

describe('InvoiceFilterBar with counts from the server', () => {
  it('counts each status, and all of them together', () => {
    show(<InvoiceFilterBar status="" dateFrom="" dateTo="" statusCounts={{ Paid: 3, Approved: 2 }}
      resultCount={5} rangeLabel="all dates" onClear={() => {}} onStatusChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter by status' }));
    expect(within(screen.getByRole('option', { name: /^All Statuses/ })).getByText('5')).toBeTruthy();
    expect(within(screen.getByRole('option', { name: /^Paid/ })).getByText('3')).toBeTruthy();
    expect(within(screen.getByRole('option', { name: /^Rejected/ })).getByText('0')).toBeTruthy();
  });
});
