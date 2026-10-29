import { fireEvent, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import uiReducer from '../../features/ui/uiSlice';
import { selectFilteredInvoices } from '../../features/invoices/selectors';
import { setRuntimeData } from '../../data/runtime';
import InvoiceFilterBar from './InvoiceFilterBar.jsx';

describe('SRM invoice filters', () => {
  it('filters product and division, offers upload dates, and clears the shared filters', () => {
    const base = { channel: 'msetuSrm', vcode: 'V1', filterFiscalYear: 2027, rawDate: '2025-01-01' };
    setRuntimeData({ invoices: [{ ...base, no: 'S', productType: 'S', plant: 'H001', dvType: 'AUTO DV' },
      { ...base, no: 'M', productType: 'M', plant: 'AMKT', dvType: 'CORPORATE DV' }], syncLog: [] });
    const store = configureStore({ reducer: { ui: uiReducer, auth: () => ({ authType: 'internal', channelScope: 'all' }) },
      preloadedState: { ui: { ...uiReducer(undefined, { type: 'init' }), scope: { fy: '2026-27' } } } });
    const clear = vi.fn();
    render(<Provider store={store}><InvoiceFilterBar status="" dateFrom="" dateTo="" statusCountBase={[]}
      resultCount={0} rangeLabel="all dates" onClear={clear} /></Provider>);
    expect(selectFilteredInvoices(store.getState())).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Product type' }));
    fireEvent.click(screen.getByRole('option', { name: 'Material (M)' }));
    expect(selectFilteredInvoices(store.getState()).map((i) => i.no)).toEqual(['M']);
    expect(screen.queryByRole('button', { name: 'Plant' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Division' }));
    fireEvent.click(screen.getByRole('option', { name: 'AUTO DV' }));
    expect(selectFilteredInvoices(store.getState())).toHaveLength(0);
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
    expect(selectFilteredInvoices(store.getState())).toHaveLength(2);
    expect(screen.getByLabelText('Invoice Date From')).toBeTruthy();
  });
});
