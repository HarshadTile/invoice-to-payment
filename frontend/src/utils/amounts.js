/**
 * Adds up formatted invoice amounts per currency prefix, e.g. "₹1,00,000.00" / "$1,200.00" /
 * "EUR 900.00" -> { '₹': 100000, '$': 1200, EUR: 900 }. An amount with no number in it (a
 * missing amount shows as "-") has nothing to add, so it is skipped instead of making the
 * total NaN.
 */
export function totalsByCurrency(invoices) {
  const totals = {};
  invoices.forEach((inv) => {
    const m = /^(\D*?)\s*(\d[\d,]*(?:\.\d+)?)$/.exec(String(inv.amount ?? '').trim());
    if (!m) return;
    const currency = m[1] || '';
    totals[currency] = (totals[currency] || 0) + parseFloat(m[2].replace(/,/g, ''));
  });
  return totals;
}
