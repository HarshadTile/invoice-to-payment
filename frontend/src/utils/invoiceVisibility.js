/** Match the current effective status; payment/MIRO precedence is unchanged. */
export function isSupplierVisibleInvoice(invoice) {
  return !['entry deleted', 'deleted'].includes(String(invoice.status || invoice.overall_status || '').trim().toLowerCase());
}
