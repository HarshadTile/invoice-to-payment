/**
 * Every number on the supplier Dashboard, from the same invoice list My Invoices shows (already
 * narrowed to the supplier's vendor codes and the top-bar year), so a card and the list it opens
 * always agree. Value figures use the main currency, as on the internal dashboard.
 */
import { dashboardMetrics, lastTwelveMonths, monthKey, parseAmount } from './dashboardMetrics';
import { invoiceFilterDate } from '../../utils/invoiceDates';

const CLOSED = ['Paid', 'Rejected'];
const AWAITING_PAYMENT = ['Approved', 'Miro Booked', 'Payment Due'];
export const UPCOMING_DAYS = 30;

const ymd = (value) => (/^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 10) : '');
export const dueDateOf = (inv) => ymd(inv.sap?.net_due_date);
export const paidDateOf = (inv) => ymd(inv.sap?.clearing_date) || ymd(inv.sap?.utr_clearing_date_paid);

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from, to) {
  const [a, b] = [from, to].map((d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)));
  return Math.round((b - a) / 86400000);
}

export function todayYMD(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const isOpen = (inv) => !CLOSED.includes(inv.status);
const isOverdue = (inv, today) => isOpen(inv) && !!dueDateOf(inv) && dueDateOf(inv) < today;
const isUpcoming = (inv, today) => {
  const due = dueDateOf(inv);
  return isOpen(inv) && !!due && due >= today && daysBetween(today, due) <= UPCOMING_DAYS;
};

/** The lists a KPI card (or a dashboard link) narrows My Invoices to. */
export const SUPPLIER_KPIS = {
  total: { label: 'Total Invoices', test: () => true },
  progress: { label: 'In Progress', test: isOpen },
  awaiting: { label: 'Awaiting Payment', test: (inv) => AWAITING_PAYMENT.includes(inv.status) },
  paid: { label: 'Fully Paid', test: (inv) => inv.status === 'Paid' },
  rejected: { label: 'Rejected', test: (inv) => inv.status === 'Rejected' },
  overdue: { label: 'Overdue payments', test: isOverdue },
  upcoming: { label: `Due in ${UPCOMING_DAYS} days`, test: isUpcoming },
};

export function supplierKpiFilter(kpi, today = todayYMD()) {
  const test = (SUPPLIER_KPIS[kpi] || SUPPLIER_KPIS.total).test;
  return (inv) => test(inv, today);
}

export function supplierMetrics(invoices, dateField = 'invoice', today = todayYMD()) {
  const base = dashboardMetrics(invoices, [], dateField);
  const { currency } = base;
  const bucket = () => ({ count: 0, value: 0, valued: 0 });
  const kpi = Object.fromEntries(Object.keys(SUPPLIER_KPIS).map((k) => [k, bucket()]));
  const monthly = new Map();
  const upcoming = [];
  const rejected = [];
  const paid = [];
  let payDays = 0;
  let payTimed = 0;
  let onTime = 0;
  let withDue = 0;

  for (const inv of invoices) {
    const amount = parseAmount(inv.amount);
    for (const [key, { test }] of Object.entries(SUPPLIER_KPIS)) {
      if (!test(inv, today)) continue;
      kpi[key].count += 1;
      if (amount && amount.currency === currency) { kpi[key].value += amount.value; kpi[key].valued += 1; }
    }

    const month = monthKey(invoiceFilterDate(inv, dateField));
    if (month) {
      if (!monthly.has(month)) monthly.set(month, { Paid: 0, Open: 0, Rejected: 0 });
      monthly.get(month)[inv.status === 'Paid' ? 'Paid' : inv.status === 'Rejected' ? 'Rejected' : 'Open'] += 1;
    }

    if (isUpcoming(inv, today)) upcoming.push({ inv, due: dueDateOf(inv), daysLeft: daysBetween(today, dueDateOf(inv)) });
    if (inv.status === 'Rejected') rejected.push(inv);
    if (inv.status === 'Paid') {
      const paidOn = paidDateOf(inv);
      paid.push({ inv, paidOn });
      const invoiced = ymd(inv.rawDate);
      if (paidOn && invoiced && paidOn >= invoiced) { payDays += daysBetween(invoiced, paidOn); payTimed += 1; }
      const due = dueDateOf(inv);
      if (paidOn && due) { withDue += 1; if (paidOn <= due) onTime += 1; }
    }
  }

  const months = lastTwelveMonths(monthly, () => ({ Paid: 0, Open: 0, Rejected: 0 }));
  return {
    currency,
    otherCurrencies: base.otherCurrencies,
    statuses: base.statuses,
    kpi,
    months,
    monthsInWindow: months.reduce((sum, m) => sum + m.Paid + m.Open + m.Rejected, 0),
    avgDaysToPay: payTimed ? Math.round(payDays / payTimed) : null,
    payTimed,
    onTime: withDue ? { count: onTime, of: withDue } : null,
    upcoming: upcoming.sort((a, b) => a.due.localeCompare(b.due)),
    rejected: rejected.sort((a, b) => String(b.rawDate || '').localeCompare(String(a.rawDate || ''))),
    recentPaid: paid.sort((a, b) => b.paidOn.localeCompare(a.paidOn)),
  };
}
