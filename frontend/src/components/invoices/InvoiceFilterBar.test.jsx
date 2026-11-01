import { fireEvent, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import uiReducer from '../../features/ui/uiSlice';
import { selectFilteredInvoices, selectFilteredInvoicesAnyChannel, selectFilteredInvoicesAnyVendor } from '../../features/invoices/selectors';
import { setRuntimeData } from '../../data/runtime';
import InvoiceFilterBar from './InvoiceFilterBar.jsx';

describe('common invoice filters', () => {
  it('keeps date filters and ignores obsolete global SRM selections', () => {
    const base = { channel: 'msetuSrm', vcode: 'V1', filterFiscalYear: 2027, rawDate: '2025-01-01' };
    setRuntimeData({ invoices: [{ ...base, no: 'S', productType: 'S', plant: 'H001', dvType: 'AUTO DV' },
      { ...base, no: 'M', productType: 'M', plant: 'AMKT', dvType: 'CORPORATE DV' },
      { ...base, no: 'PO', channel: 'poPortal', productType: 'S' }], syncLog: [] });
    const store = configureStore({ reducer: { ui: uiReducer, auth: () => ({ authType: 'internal', channelScope: 'all' }) },
      preloadedState: { ui: { ...uiReducer(undefined, { type: 'init' }), dataVersion: 201,
        scope: { fy: '2026-27', productType: 'M', plant: 'MISSING', division: 'MISSING' } } } });
    const clear = vi.fn();
    render(<Provider store={store}><InvoiceFilterBar status="" dateFrom="" dateTo="" statusCountBase={[]}
      resultCount={0} rangeLabel="all dates" onClear={clear} /></Provider>);
    for (const selector of [selectFilteredInvoices, selectFilteredInvoicesAnyChannel, selectFilteredInvoicesAnyVendor]) {
      expect(selector(store.getState()).map((i) => i.no)).toEqual(['S', 'M', 'PO']);
    }
    expect(screen.queryByRole('button', { name: 'Product type' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Filter by plant code' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Division' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Date type' }));
    fireEvent.click(screen.getByRole('option', { name: 'Upload date' }));
    expect(screen.getByLabelText('Upload Date From')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Date type' }));
    fireEvent.click(screen.getByRole('option', { name: 'Payment Due date' }));
    expect(screen.getByLabelText('Payment Due Date From')).toBeTruthy();
    expect(screen.getByLabelText('Payment Due Date To')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Date type' }));
    expect(screen.queryByRole('option', { name: 'Payment date' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Posting date' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Sent to accounts date' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Date type' }));
    expect(screen.queryByRole('option', { name: 'Payment Due' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(clear).toHaveBeenCalledOnce();
    expect(selectFilteredInvoices(store.getState())).toHaveLength(3);
    expect(screen.getByLabelText('Invoice Date From')).toBeTruthy();
  });
});
