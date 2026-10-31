import { describe, expect, it } from 'vitest';
import { dashboardMetrics, formatMoney, formatShare, parseAmount } from './dashboardMetrics';

const inv = (over) => ({ no: 'X', channel: 'msetuSrm', status: 'Paid', productType: 'S', amount: '₹1,000.00',
  rawDate: '2026-10-05', rawUploadDate: '2026-10-06', sap: {}, ...over });

describe('dashboard metrics', () => {
  it('puts every invoice in exactly one status, stage, product and channel bucket', () => {
    const list = [
      inv({ status: 'Paid' }), inv({ status: 'Pending for Approval', productType: 'M' }), inv({ status: 'Pending Approval' }),
      inv({ status: 'Miro Booked', channel: 'poPortal', productType: undefined, invoiceType: undefined }),
      inv({ status: 'Rejected' }), inv({ status: 'Something New' }),
    ];
    const m = dashboardMetrics(list, ['msetuSrm', 'poPortal']);
    const sum = (rows) => rows.reduce((total, row) => total + row.count, 0);
    expect(m.total.count).toBe(6);
    expect(sum(m.statuses)).toBe(6);
    expect(sum(m.groups)).toBe(6);
    expect(sum(m.product)).toBe(6);
    expect(sum(m.channels)).toBe(6);
    expect(m.kpi.pendingApproval.count).toBe(2);
    expect(m.statuses.at(-1).key).toBe('Rejected');
    expect(m.groups.find((g) => g.key === 'other').count).toBe(1);
    expect(m.groups.find((g) => g.key === 'approved').count).toBe(0);
    expect(m.groups.find((g) => g.key === 'miro').count).toBe(1);
    expect(m.product.map((p) => p.count)).toEqual([4, 1, 1]);
  });

  it('sums values in the main currency only and reports the others separately', () => {
    const m = dashboardMetrics([inv({ amount: '₹1,00,000.50' }), inv({ amount: '₹2,000.00' }), inv({ amount: '$500.00' }), inv({ amount: '-' })], []);
    expect(m.currency).toBe('₹');
    expect(m.total.value).toBeCloseTo(102000.5, 2);
    expect(m.total.count).toBe(4);
    expect(m.otherCurrencies).toEqual({ $: 500 });
    expect(m.total.valued).toBe(2); // the $ and the "-" invoices carry no rupee amount
  });



  it('shows the 12 months up to the latest invoice month, empty months included', () => {
    const m = dashboardMetrics([inv({ rawDate: '2026-10-05' }), inv({ rawDate: '2026-08-01', productType: 'M' }),
      inv({ rawDate: '2025-01-01' }), inv({ rawDate: undefined })], []);
    expect(m.months).toHaveLength(12);
    expect(m.months[0].key).toBe('2025-11');
    expect(m.months.at(-1)).toMatchObject({ key: '2026-10', label: 'Oct 26', Service: 1 });
    expect(m.months.find((x) => x.key === '2026-09')).toMatchObject({ Service: 0, Material: 0 });
    expect(m.monthsCoverage).toEqual({ inWindow: 2, withoutDate: 1 });
  });

  it('groups months by the chosen date type, counting what lacks that date', () => {
    const list = [
      inv({ rawDate: '2026-01-05', rawUploadDate: '2026-03-02' }),
      inv({ rawDate: '2026-01-06', rawUploadDate: '2026-04-09', productType: 'M' }),
      inv({ rawDate: '2026-01-07', rawUploadDate: undefined }),
      inv({ rawDate: '2026-01-08', rawUploadDate: undefined, sap: { utr_clearing_date_paid: '2026-04-20' } }),
    ];
    const byUpload = dashboardMetrics(list, [], 'upload');
    expect(byUpload.months.at(-1)).toMatchObject({ key: '2026-04', Service: 0, Material: 1 });
    expect(byUpload.months.at(-2)).toMatchObject({ key: '2026-03', Service: 1 });
    expect(byUpload.monthsCoverage).toEqual({ inWindow: 2, withoutDate: 2 });
    const byUtr = dashboardMetrics(list, [], 'utr_clearing');
    expect(byUtr.months.at(-1)).toMatchObject({ key: '2026-04', Service: 1 });
    expect(byUtr.monthsCoverage).toEqual({ inWindow: 1, withoutDate: 3 });
  });



  it('formats money and shares without rounding away small or near-whole parts', () => {
    expect(parseAmount('₹3,39,136.00')).toEqual({ currency: '₹', value: 339136 });
    expect(formatMoney(33913600)).toBe('₹3.39 Cr');
    expect(formatMoney(40020000000)).toBe('₹4,002 Cr');
    expect(formatMoney(250000)).toBe('₹2.50 L');
    expect(formatMoney(1234.5, '₹', { compact: false })).toBe('₹1,234.50');
    expect(formatShare(1, 400)).toBe('<1%');
    expect(formatShare(399, 400)).toBe('>99%');
    expect(formatShare(0, 0)).toBe('0%');
  });
});
