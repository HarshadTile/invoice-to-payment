import { describe, it, expect } from 'vitest';
import { matchesInvoiceQuery, parseInvoiceQuery } from './invoiceQuery';

const inv = { no: 'INV-2627000165', po: '6500017465', poItem: 10, utr: 'UTR2607290012', vcode: 'DIG00356AA', vendor: 'GBUSINESS INFOTECH SOLUTIONS' };
const noUtr = { no: 'MTS26M39', po: '6500018553', poItem: 20, utr: '-' };

describe('invoice search', () => {
  it('a single term matches invoice, PO, item or UTR on its own', () => {
    expect(matchesInvoiceQuery(inv, 'inv-2627')).toBe(true); // invoice (any case)
    expect(matchesInvoiceQuery(inv, '6500017465')).toBe(true); // PO
    expect(matchesInvoiceQuery(inv, '10')).toBe(true); // PO item (exact)
    expect(matchesInvoiceQuery(inv, 'UTR2607')).toBe(true); // UTR
    expect(matchesInvoiceQuery(inv, 'nothing')).toBe(false);
  });

  it('a single term also finds the vendor code or vendor name', () => {
    expect(matchesInvoiceQuery(inv, 'DIG00356')).toBe(true);
    expect(matchesInvoiceQuery(inv, 'dig00356aa')).toBe(true);
    expect(matchesInvoiceQuery(inv, 'infotech')).toBe(true);
    expect(matchesInvoiceQuery(inv, 'DIM00408')).toBe(false);
  });

  it('the PO item must match exactly, not as a fragment', () => {
    expect(matchesInvoiceQuery({ ...inv, poItem: 100 }, '10')).toBe(false);
  });

  it('commas match by position: invoice, PO, item, UTR', () => {
    expect(matchesInvoiceQuery(inv, 'INV-2627, 6500017465')).toBe(true);
    expect(matchesInvoiceQuery(inv, 'INV-2627, 6500017465, 10')).toBe(true);
    expect(matchesInvoiceQuery(inv, 'INV-2627, 6500017465, 10, UTR2607')).toBe(true);
    expect(matchesInvoiceQuery(inv, 'INV-2627, 6500099999')).toBe(false);
    // a PO typed in the invoice position is not a match when commas are used
    expect(matchesInvoiceQuery(inv, '6500017465, INV-2627')).toBe(false);
  });

  it('an empty position is skipped', () => {
    expect(matchesInvoiceQuery(inv, ', 6500017465')).toBe(true);
    expect(matchesInvoiceQuery(inv, ',, 10')).toBe(true);
    expect(matchesInvoiceQuery(inv, ',,, UTR2607')).toBe(true);
    expect(matchesInvoiceQuery(inv, ',,, UTR9999')).toBe(false);
  });

  it('"-" (no UTR yet) is not searchable', () => {
    expect(matchesInvoiceQuery(noUtr, '-')).toBe(false);
    expect(matchesInvoiceQuery(noUtr, ',,, UTR')).toBe(false);
  });

  it('empty search matches everything', () => {
    expect(matchesInvoiceQuery(inv, '')).toBe(true);
    expect(matchesInvoiceQuery(inv, '   ')).toBe(true);
    expect(matchesInvoiceQuery(inv, ',')).toBe(true);
  });

  it('parses the two modes', () => {
    expect(parseInvoiceQuery('abc').mode).toBe('any');
    expect(parseInvoiceQuery('a,b,c,d')).toMatchObject({ mode: 'fields', invoice: 'a', po: 'b', item: 'c', utr: 'd' });
  });
});
