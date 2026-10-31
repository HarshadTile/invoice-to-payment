import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider, useSelector } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import uiReducer from '../../features/ui/uiSlice';
import { selectScopedInvoices } from '../../features/invoices/selectors';
import { setRuntimeData } from '../../data/runtime';
import { downloadCSV } from '../../utils/businessLogic';
import InvoiceTable from './InvoiceTable.jsx';
import InvoiceFilterBar from './InvoiceFilterBar.jsx';
import SupplierInvoiceDetailModal from '../modals/SupplierInvoiceDetailModal.jsx';

vi.mock('../../utils/businessLogic', async (original) => ({ ...await original(), downloadCSV: vi.fn() }));
const visible = { no: 'VISIBLE', vcode: 'V1', vendor: 'Supplier', channel: 'msetuSrm', po: 'PO1', poItem: 10,
  status: 'Approved', amount: '-', utr: '-', sap: {}, workflow: {} };
const rows = [visible, { ...visible, no: 'DELETED-ENTRY', status: 'Entry Deleted' }, { ...visible, no: 'LEGACY-DELETED', status: 'Deleted' }];
let version = 600;

function Table() {
  const invoices = useSelector(selectScopedInvoices);
  return <>
    <InvoiceFilterBar status="" dateFrom="" dateTo="" statusCountBase={invoices} resultCount={invoices.length} rangeLabel="all dates" />
    <InvoiceTable invoices={invoices} tableKey="supplier-deleted" mode="supplierSafe" />
  </>;
}
function show(component, authType = 'supplier') {
  setRuntimeData({ invoices: rows, syncLog: [] });
  const store = configureStore({ reducer: { ui: uiReducer, auth: () => ({ authType, channelScope: 'all' }) },
    preloadedState: { ui: { ...uiReducer(undefined, { type: 'init' }), dataVersion: ++version, scope: { fy: 'all' } } } });
  const view = render(<Provider store={store}><MemoryRouter>{component}</MemoryRouter></Provider>);
  return { ...view, store };
}

describe('supplier deleted-invoice visibility', () => {
  it('excludes deleted entries from scoped tables, counts, exports and status options', () => {
    show(<Table />);
    expect(screen.getByRole('button', { name: 'VISIBLE' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'DELETED-ENTRY' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'LEGACY-DELETED' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Filter by status' }));
    expect(screen.queryByRole('option', { name: /Entry Deleted/ })).toBeNull();
    expect(screen.getByRole('option', { name: /All Statuses/ }).textContent).toContain('1');
    fireEvent.click(screen.getByRole('button', { name: 'Filter by status' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export to Excel (1)' }));
    expect(downloadCSV.mock.lastCall[2].map((row) => row[0])).toEqual(['VISIBLE']);
  });

  it('guards raw table props and stale detail links as well', () => {
    const view = show(<InvoiceTable invoices={rows} filteredCount={3} tableKey="raw" mode="supplierSafe" />);
    expect(screen.getByRole('button', { name: 'Export to Excel (1)' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'DELETED-ENTRY' })).toBeNull();
    view.unmount();
    show(<SupplierInvoiceDetailModal ctx={{ no: 'DELETED-ENTRY', poItem: 10 }} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not show deleted siblings in supplier details', () => {
    show(<SupplierInvoiceDetailModal ctx={{ no: 'VISIBLE', poItem: 10 }} />);
    expect(screen.queryByText('DELETED-ENTRY')).toBeNull();
    expect(screen.queryByText('LEGACY-DELETED')).toBeNull();
  });

  it('retains deleted entries and the status option for internal users', () => {
    show(<Table />, 'internal');
    expect(screen.getByRole('button', { name: 'DELETED-ENTRY' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Filter by status' }));
    expect(screen.getByRole('option', { name: /Entry Deleted/ })).toBeTruthy();
  });
});
