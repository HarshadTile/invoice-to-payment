import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDateColumnSort } from './dateSort';

const rows = [
  { id: 'a', rawDate: '2026-09-04', date: '30 Oct 2026' },
  { id: 'b', rawDate: '2026-08-11', date: '12 Jun 2026' },
  { id: 'c', rawDate: '2026-09-28', date: '-' },
  { id: 'd', rawDate: '', date: '05 Aug 2026' },
];
const getters = { invoice: (r) => r.rawDate, status: (r) => r.date };
const ids = (r) => r.sorted.map((x) => x.id).join('');

describe('useDateColumnSort', () => {
  it('keeps the source order until a column is clicked', () => {
    const { result } = renderHook(() => useDateColumnSort(rows, getters));
    expect(ids(result.current)).toBe('abcd');
  });

  it('sorts by the invoice date: newest first, then oldest first, blanks last', () => {
    const { result } = renderHook(() => useDateColumnSort(rows, getters));
    act(() => result.current.toggle('invoice'));
    expect(ids(result.current)).toBe('cabd');
    expect(result.current.dirFor('invoice')).toBe('desc');
    act(() => result.current.toggle('invoice'));
    expect(ids(result.current)).toBe('bacd');
    expect(result.current.dirFor('invoice')).toBe('asc');
  });

  it('switching to the status date sorts by that column instead, and clears the other arrow', () => {
    const { result } = renderHook(() => useDateColumnSort(rows, getters));
    act(() => result.current.toggle('invoice'));
    act(() => result.current.toggle('status'));
    expect(ids(result.current)).toBe('adbc'); // 30 Oct, 05 Aug, 12 Jun, then "-" last
    expect(result.current.dirFor('status')).toBe('desc');
    expect(result.current.dirFor('invoice')).toBeNull();
  });
});
