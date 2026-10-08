/* Shared "Invoice no, PO no, PO item" search — the same parsing/matching rule
 * used by the dedicated Search Invoice(s) page, reused everywhere else an
 * invoice table has its own search box (My Invoices, Channel pages, Vendor
 * Code page, Supplier Visibility, supplier home), so search behaves the same
 * way app-wide instead of each table doing its own looser "contains anywhere" match. */

/** Splits "invoice, po, item" (comma-separated, later parts optional) into its parts. */
export function parseInvoiceQuery(raw) {
  const parts = (raw || '').split(',').map((s) => s.trim());
  return { invoice: parts[0] || '', po: parts[1] || '', item: parts[2] || '' };
}

/** Invoice/PO are case-insensitive "contains"; PO item is an exact match. */
export function matchesInvoiceQuery(inv, raw) {
  const { invoice, po, item } = parseInvoiceQuery(raw);
  if (!invoice && !po && !item) return true;
  if (invoice && !inv.no.toLowerCase().includes(invoice.toLowerCase())) return false;
  if (po && !inv.po.toLowerCase().includes(po.toLowerCase())) return false;
  if (item && String(inv.poItem) !== item) return false;
  return true;
}
