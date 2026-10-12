/** The source invoice date is independent of the current processing stage. */
export function invoiceDateLabel(invoice) {
  if (!invoice.rawDate) return '-';
  const date = new Date(`${invoice.rawDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
