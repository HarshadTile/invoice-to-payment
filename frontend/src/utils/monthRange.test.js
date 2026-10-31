import { describe, expect, it } from 'vitest';
import { calendarMonthOf, monthDateRange } from './invoiceDates';

describe('dashboard month ranges', () => {
  it('covers the whole calendar month, leap years included', () => {
    expect(monthDateRange('2026-03')).toEqual({ from: '2026-03-01', to: '2026-03-31' });
    expect(monthDateRange('2026-04')).toEqual({ from: '2026-04-01', to: '2026-04-30' });
    expect(monthDateRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthDateRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('recognises only an exact calendar month', () => {
    expect(calendarMonthOf('2026-03-01', '2026-03-31')).toEqual({ key: '2026-03', label: 'Mar 2026' });
    expect(calendarMonthOf('2026-03-01', '2026-03-30')).toBeNull();
    expect(calendarMonthOf('2026-03-02', '2026-03-31')).toBeNull();
    expect(calendarMonthOf('', '')).toBeNull();
  });
});
