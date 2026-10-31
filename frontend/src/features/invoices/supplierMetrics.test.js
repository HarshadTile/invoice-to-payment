import { describe, expect, it } from 'vitest';
import { daysBetween, supplierKpiFilter, supplierMetrics } from './supplierMetrics';

const TODAY = '2026-10-31';
const inv = (over) => ({ no: 'X', status: 'Paid', amount: '₹1,000.00', rawDate: '2026-10-05', sap: {}, ...over });

describe('supplier metrics', () => {
  it('counts and sums the KPI lists the cards open', () => {
    const list = [
      inv({ status: 'Paid', sap: { clearing_date: '2026-10-25', net_due_date: '2026-10-30' } }),
      inv({ status: 'Approved', amount: '₹2,000.00', sap: { net_due_date: '2026-10-20' } }),
      inv({ status: 'Miro Booked', amount: '-', sap: { net_due_date: '2026-11-10' } }),
      inv({ status: 'Pending for Approval' }),
      inv({ status: 'Rejected' }),
    ];
    const m = supplierMetrics(list, 'invoice', TODAY);
    expect(m.kpi.total.count).toBe(5);
    expect(m.kpi.progress.count).toBe(3);
    expect(m.kpi.awaiting).toEqual({ count: 2, value: 2000, valued: 1 });
    expect(m.kpi.paid.value).toBe(1000);
    expect(m.kpi.rejected.count).toBe(1);
    expect(m.kpi.overdue.count).toBe(1); // approved, due 20 Oct
    expect(m.upcoming.map((u) => u.daysLeft)).toEqual([10]);
    // each card's count matches the filter My Invoices applies
    for (const key of Object.keys(m.kpi)) expect(list.filter(supplierKpiFilter(key, TODAY)).length).toBe(m.kpi[key].count);
  });

  it('measures days to payment and on-time share over paid invoices with the dates', () => {
    const list = [
      inv({ rawDate: '2026-09-01', sap: { clearing_date: '2026-09-11', net_due_date: '2026-09-30' } }),
      inv({ rawDate: '2026-09-01', sap: { clearing_date: '2026-10-01', net_due_date: '2026-09-30' } }),
      inv({ rawDate: '2026-09-01' }), // no payment date: not timed
    ];
    const m = supplierMetrics(list, 'invoice', TODAY);
    expect(m.avgDaysToPay).toBe(20);
    expect(m.payTimed).toBe(2);
    expect(m.onTime).toEqual({ count: 1, of: 2 });
    expect(m.recentPaid[0].paidOn).toBe('2026-10-01');
  });

  it('groups months by the chosen date type into paid / open / rejected', () => {
    const list = [
      inv({ rawDate: '2026-09-03', status: 'Paid' }),
      inv({ rawDate: '2026-10-03', status: 'Approved', sap: { net_due_date: '2026-11-02' } }),
      inv({ rawDate: '2026-10-04', status: 'Rejected' }),
    ];
    const byInvoice = supplierMetrics(list, 'invoice', TODAY);
    expect(byInvoice.months).toHaveLength(12);
    expect(byInvoice.months.at(-1)).toMatchObject({ key: '2026-10', Paid: 0, Open: 1, Rejected: 1 });
    expect(byInvoice.monthsInWindow).toBe(3);
    const byDue = supplierMetrics(list, 'due', TODAY);
    expect(byDue.months.at(-1)).toMatchObject({ key: '2026-11', Open: 1 });
    expect(byDue.monthsInWindow).toBe(1);
  });

  it('counts whole days between two dates', () => {
    expect(daysBetween('2026-10-31', '2026-11-30')).toBe(30);
    expect(daysBetween('2026-03-01', '2026-02-28')).toBe(-1);
  });
});
