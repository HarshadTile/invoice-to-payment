import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { setRuntimeData } from '../../data/runtime';
import uiReducer, { setScopeFilter } from '../../features/ui/uiSlice';
import { selectFilteredInvoices } from '../../features/invoices/selectors';
import { useScope } from '../../features/ui/scope';
import { useDispatch } from 'react-redux';
import TopbarPlantDropdown from './TopbarPlantDropdown.jsx';

function Filter() {
  const scope = useScope();
  const dispatch = useDispatch();
  return <TopbarPlantDropdown scope={scope} onUpdate={(key, value) => dispatch(setScopeFilter({ key, value }))} />;
}

describe('top-bar plant filter', () => {
  it('combines plant with division and clears plant independently', () => {
    setRuntimeData({ invoices: [
      { no: 'A', plant: 'H001', dvType: 'AUTO DV', channel: 'msetuSrm' },
      { no: 'B', plant: 'AMKT', dvType: 'AUTO DV', channel: 'msetuSrm' },
      { no: 'C', plant: 'H001', dvType: 'CORPORATE DV', channel: 'msetuSrm' },
      { no: 'D', plant: 'PRIVATE', dvType: 'AUTO DV', channel: 'poPortal' },
    ], syncLog: [] });
    const store = configureStore({ reducer: { ui: uiReducer, auth: () => ({ authType: 'internal', channelScope: 'msetuSrm' }) },
      preloadedState: { ui: { ...uiReducer(undefined, { type: 'init' }), scope: { fy: 'all', division: 'AUTO DV' } } } });
    render(<Provider store={store}><Filter /></Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Filter by plant code' }));
    expect(screen.queryByRole('option', { name: 'PRIVATE' })).toBeNull();
    const search = screen.getByRole('searchbox', { name: 'Search plant code' });
    fireEvent.change(search, { target: { value: ' h0 ' } });
    expect(screen.queryByRole('option', { name: 'AMKT' })).toBeNull();
    expect(screen.getByRole('option', { name: 'H001' })).toBeTruthy();
    fireEvent.change(search, { target: { value: 'NO-SUCH-PLANT' } });
    expect(screen.getByText('No matches found.')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Plant Code' })).toBeTruthy();
    fireEvent.change(search, { target: { value: 'h0' } });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(selectFilteredInvoices(store.getState()).map((invoice) => invoice.no)).toEqual(['A']);
    fireEvent.click(screen.getByRole('button', { name: 'Filter by plant code' }));
    expect(screen.getByRole('searchbox', { name: 'Search plant code' }).value).toBe('');
    fireEvent.click(screen.getByRole('option', { name: 'Plant Code' }));
    expect(selectFilteredInvoices(store.getState()).map((invoice) => invoice.no)).toEqual(['A', 'B']);
    expect(store.getState().ui.scope.division).toBe('AUTO DV');
  });
});
