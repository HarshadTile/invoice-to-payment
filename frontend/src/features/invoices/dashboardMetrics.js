/**
 * Every number on the Invoice Tracking dashboard, computed in one pass over the same invoice list
 * the rest of the app shows (already narrowed by the top-bar year / channel / vendor), so the
 * tiles, charts and Search always agree. Rules that matter for accuracy:
 *  - every invoice lands in exactly one status, product and channel bucket ("Other" catches the
 *    rest), so the parts always add up to the total;
 *  - amounts are summed per currency; value figures use the main currency (the one most invoices
 *    are in) and the others are reported separately, never converted;
 *  - the monthly chart groups by the chosen date type (the same one Search filters on) and only
 *    uses invoices that have that date, saying how many do not.
 */
import { invoiceProductType } from '../../utils/businessLogic';
import { invoiceFilterDate } from '../../utils/invoiceDates';

/** Workflow order for the status chart; anything else is listed after these. */
export const STATUS_FLOW = ['Initial', 'Push to PO Portal', 'Invoice Uploaded', 'Pending for Approval', 'Pending Approval',
  'Action Required', 'Level Approved', 'Approved', 'Miro Booked', 'Payment Due', 'Paid'];
export const EXCEPTION_STATUSES = ['Rejected', 'Entry Deleted', 'Deleted'];
const PENDING = ['Pending Approval', 'Pending for Approval'];

/** The pipeline groups behind the overview bar, in flow order. Statuses not listed land in "Other". */
export const STAGE_GROUPS = [
  { key: 'awaiting', label: 'Awaiting approval', statuses: ['Initial', 'Push to PO Portal', 'Invoice Uploaded', 'Pending for Approval', 'Pending Approval', 'Action Required', 'Level Approved'] },
  { key: 'approved', label: 'Approved', statuses: ['Approved'] },
  { key: 'miro', label: 'Miro Booked', statuses: ['Miro Booked'] },
  { key: 'paid', label: 'Paid', statuses: ['Paid'] },
  { key: 'exception', label: 'Rejected / deleted', statuses: EXCEPTION_STATUSES },
];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "₹3,39,136.00" -> { currency: '₹', value: 339136 }; "-" or blank -> null. */
export function parseAmount(amount) {
  const m = /^(\D*?)\s*(\d[\d,]*(?:\.\d+)?)$/.exec(String(amount ?? '').trim());
  return m ? { currency: m[1] || '', value: parseFloat(m[2].replace(/,/g, '')) } : null;
}

/** The 12 calendar months up to the latest month in `byMonth`, empty months filled with `empty()`. */
export function lastTwelveMonths(byMonth, empty) {
  const latest = [...byMonth.keys()].sort().pop();
  const months = [];
  if (!latest) return months;
  let [year, month] = latest.split('-').map(Number);
  for (let i = 0; i < 12; i += 1) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    months.unshift({ key, label: `${MONTH_NAMES[month - 1]} ${String(year).slice(2)}`, ...(byMonth.get(key) || empty()) });
    month -= 1;
    if (month === 0) { month = 12; year -= 1; }
  }
  return months;
}

export const monthKey = (value) => {
  const m = /^(\d{4})-(\d{2})/.exec(String(value || ''));
  return m ? `${m[1]}-${m[2]}` : null;
};

export function productKey(invoice) {
  const type = invoiceProductType(invoice);
  return type === 'Service' || type === 'Material' ? type : 'Other';
}

export function dashboardMetrics(invoices, channels = [], dateField = 'invoice') {
  const currencyCount = new Map();
  for (const inv of invoices) {
    const amount = parseAmount(inv.amount);
    if (amount) currencyCount.set(amount.currency, (currencyCount.get(amount.currency) || 0) + 1);
  }
  const currency = [...currencyCount].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '₹';

  // `valued` = how many of the bucket's invoices carry an amount in the main currency, so a
  // bucket with no amounts on record shows that instead of a misleading 0.
  const bucket = () => ({ count: 0, value: 0, valued: 0 });
  const add = (target, amount) => {
    target.count += 1;
    if (amount && amount.currency === currency) { target.value += amount.value; target.valued += 1; }
  };

  const all = bucket();
  const otherCurrencies = {};
  const byStatus = new Map();
  const product = { Service: bucket(), Material: bucket(), Other: bucket() };
  const byChannel = new Map();
  const groups = Object.fromEntries(STAGE_GROUPS.map((g) => [g.key, bucket()]));
  groups.other = bucket();
  const statusGroup = new Map(STAGE_GROUPS.flatMap((g) => g.statuses.map((s) => [s, g.key])));
  const monthly = new Map();
  let withoutDate = 0;

  for (const inv of invoices) {
    const amount = parseAmount(inv.amount);
    if (amount && amount.currency !== currency) otherCurrencies[amount.currency] = (otherCurrencies[amount.currency] || 0) + amount.value;
    add(all, amount);

    const status = inv.status || 'Unknown';
    if (!byStatus.has(status)) byStatus.set(status, bucket());
    add(byStatus.get(status), amount);
    add(groups[statusGroup.get(status) || 'other'], amount);

    const type = productKey(inv);
    add(product[type], amount);

    const channel = inv.channel || 'unknown';
    if (!byChannel.has(channel)) byChannel.set(channel, bucket());
    add(byChannel.get(channel), amount);


    const invoiceMonth = monthKey(invoiceFilterDate(inv, dateField));
    if (!invoiceMonth) withoutDate += 1;
    else {
      if (!monthly.has(invoiceMonth)) monthly.set(invoiceMonth, { Service: 0, Material: 0, Other: 0 });
      monthly.get(invoiceMonth)[type] += 1;
    }

  }

  const months = lastTwelveMonths(monthly, () => ({ Service: 0, Material: 0, Other: 0 }));
  const inWindow = months.reduce((sum, m) => sum + m.Service + m.Material + m.Other, 0);

  const known = new Set([...STATUS_FLOW, ...EXCEPTION_STATUSES]);
  const statuses = [
    ...STATUS_FLOW.filter((s) => byStatus.has(s)),
    ...[...byStatus.keys()].filter((s) => !known.has(s)).sort(),
    ...EXCEPTION_STATUSES.filter((s) => byStatus.has(s)),
  ].map((key) => ({ key, ...byStatus.get(key), exception: EXCEPTION_STATUSES.includes(key) }));

  const sumOf = (names) => names.reduce((acc, s) => {
    const b = byStatus.get(s);
    if (b) { acc.count += b.count; acc.value += b.value; acc.valued += b.valued; }
    return acc;
  }, bucket());

  return {
    currency,
    otherCurrencies,
    total: all,
    kpi: {
      pendingApproval: sumOf(PENDING),
      approved: sumOf(['Approved']),
      miroBooked: sumOf(['Miro Booked']),
      paid: sumOf(['Paid']),
    },
    groups: [...STAGE_GROUPS.map((g) => ({ key: g.key, label: g.label, ...groups[g.key] })),
      ...(groups.other.count ? [{ key: 'other', label: 'Other status', ...groups.other }] : [])],
    statuses,
    product: ['Service', 'Material', 'Other'].map((key) => ({ key, label: key === 'Other' ? 'Not specified' : key, ...product[key] })),
    channels: [...byChannel].map(([key, b]) => ({ key, ...b }))
      .sort((a, b) => b.count - a.count || channels.indexOf(a.key) - channels.indexOf(b.key)),
    months,
    monthsCoverage: { inWindow, withoutDate },
  };
}

/** ₹ amounts in lakh / crore, others in K / M / B. */
export function formatMoney(value, currency = '₹', { compact = true } = {}) {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (!compact) return `${sign}${currency}${abs.toLocaleString(currency === '₹' ? 'en-IN' : 'en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
  const steps = currency === '₹'
    ? [[1e7, ' Cr'], [1e5, ' L'], [1e3, 'K']]
    : [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [size, suffix] of steps) {
    if (abs >= size) {
      const scaled = abs / size;
      const text = scaled >= 100 ? Math.round(scaled).toLocaleString('en-IN') : scaled.toFixed(2);
      return `${sign}${currency}${text}${suffix}`;
    }
  }
  return `${sign}${currency}${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export const formatCount = (n) => n.toLocaleString('en-IN');
export const share = (part, whole) => (whole ? part / whole : 0);
export const formatShare = (part, whole) => {
  const pct = share(part, whole) * 100;
  // never round a sliver up to 0% or a near-whole up to 100%
  if (pct > 0 && pct < 1) return '<1%';
  if (pct > 99 && pct < 100) return '>99%';
  return `${Math.round(pct)}%`;
};
