import { describe, it, expect } from 'vitest';
import { runtime, setRuntimeData, suppliersFromRuntime } from '../data/runtime.js';
import { messageSide } from '../utils/tickets.js';

describe('runtime dataset', () => {
  it('keeps the same array reference after hydration', () => {
    const invoicesRef = runtime.invoices;
    const syncRef = runtime.syncLog;
    setRuntimeData({
      invoices: [{ no: 'X-1', vendor: 'Acme' }, { no: 'X-2', vendor: 'Globex' }],
      syncLog: [{ channel: 'A', status: 'Success' }],
    });
    expect(runtime.invoices).toBe(invoicesRef);
    expect(runtime.syncLog).toBe(syncRef);
    expect(runtime.invoices).toHaveLength(2);
    expect(suppliersFromRuntime()).toEqual(['Acme', 'Globex']);
  });

  it('replaces prior data on the next hydration', () => {
    setRuntimeData({ invoices: [{ no: 'Y-1', vendor: 'Initech' }], syncLog: [] });
    expect(runtime.invoices).toHaveLength(1);
    expect(runtime.invoices[0].no).toBe('Y-1');
  });
});

describe('ticket conversation alignment', () => {
  it('places each viewer party on the right and the other party on the left', () => {
    expect(messageSide('SUPPLIER', true)).toBe('own');
    expect(messageSide('ASSIGNEE', true)).toBe('other');
    expect(messageSide('SUPPLIER', false)).toBe('other');
    expect(messageSide('ASSIGNEE', false)).toBe('own');
  });
});
