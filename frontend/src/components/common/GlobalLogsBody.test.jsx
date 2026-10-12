import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import uiReducer from '../../features/ui/uiSlice';
import GlobalLogsBody from './GlobalLogsBody.jsx';

vi.mock('../../api/client', () => ({ api: { get: vi.fn(async () => []) } }));

const inv = (no, status, extra = {}) => ({
  no, poItem: 10, po: '3400', vcode: 'V1', vendor: 'Vendor', channel: 'msetuSrm', status,
  rawDate: '2026-09-18', date: '18 Sep 2026', utr: status === 'Paid' ? 'UTR1' : '-', ...extra,
  sap: { document_date: '2026-09-18', net_due_date: '2026-10-18', clearing_date: status === 'Paid' ? '2026-09-20' : null },
  workflow: {},
});

describe('Logs type filter', () => {
  it('shows only rows of the chosen type, even when the source repeats an invoice line', async () => {
    const list = [inv('116', 'Payment Due'), inv('116', 'Payment Due'), inv('68', 'Paid'), inv('68', 'Paid'), inv('70', 'Paid'), inv('72', 'Payment Due')];
    const store = configureStore({ reducer: { ui: uiReducer } });
    render(<Provider store={store}><GlobalLogsBody invoiceList={list} /></Provider>);
    const typeOf = () => [...document.querySelectorAll('tbody tr')].map((tr) => tr.querySelectorAll('td')[4]?.textContent);
    await waitFor(() => expect(typeOf().length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText('Filter by type'), { target: { value: 'Payment' } });
    await waitFor(() => expect(new Set(typeOf())).toEqual(new Set(['Payment'])));
    fireEvent.change(screen.getByLabelText('Filter by type'), { target: { value: 'Invoice' } });
    await waitFor(() => expect(new Set(typeOf())).toEqual(new Set(['Invoice'])));
  });

  it('Clear is shown only while a filter is active and resets the filters; Export stays beside it', async () => {
    const store = configureStore({ reducer: { ui: uiReducer } });
    render(<Provider store={store}><GlobalLogsBody invoiceList={[inv('68', 'Paid'), inv('72', 'Payment Due')]} /></Provider>);
    await waitFor(() => expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(0));
    const actions = () => document.querySelector('.log-actions');
    expect(actions().textContent).not.toMatch(/Clear/);

    fireEvent.change(screen.getByLabelText('Filter by type'), { target: { value: 'Payment' } });
    await waitFor(() => expect(actions().textContent).toMatch(/Clear/));
    expect(actions().textContent).toMatch(/Export/); // the same group, on one row

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(actions().textContent).not.toMatch(/Clear/));
    expect(screen.getByLabelText('Filter by type').value).toBe('all');
  });
});
