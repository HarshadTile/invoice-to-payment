import { describe, it, expect } from 'vitest';
import { getFiscalYear } from './fiscalYear';

describe('getFiscalYear (April to March)', () => {
  it.each([
    ['2026-04-01', '2026-27'], // first day of the year
    ['2026-03-31', '2025-26'], // last day of the previous year
    ['2026-12-31', '2026-27'],
    ['2027-01-15', '2026-27'],
    ['1999-06-01', '1999-00'], // century boundary keeps two digits
  ])('%s is in FY %s', (date, fy) => {
    expect(getFiscalYear(date)).toBe(fy);
  });
});
