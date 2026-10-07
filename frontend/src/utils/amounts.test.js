import { describe, expect, it } from 'vitest';
import { totalsByCurrency } from './amounts';

describe('totalsByCurrency', () => {
  it('adds amounts per currency and ignores missing amounts', () => {
    const totals = totalsByCurrency([
      { amount: '₹1,00,000.50' }, { amount: '₹32,967.00' }, { amount: '$1,200.00' }, { amount: 'EUR 900.00' },
      { amount: '-' }, { amount: undefined }, { amount: '' },
    ]);
    expect(totals).toEqual({ '₹': 132967.5, $: 1200, EUR: 900 });
    expect(Object.values(totals).some(Number.isNaN)).toBe(false);
  });
});
