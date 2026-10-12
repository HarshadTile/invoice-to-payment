/* Shared invoice search — the same parsing/matching rule used by the dedicated Search Invoice(s)
 * page and reused everywhere else an invoice table has its own search box (My Invoices, Channel
 * pages, Vendor Code page, Supplier Visibility, supplier home), so search behaves the same way
 * app-wide.
 *
 * Two ways to search:
 *  - One term, no comma: matches ANY of invoice no, PO no, PO item, UTR, vendor code or vendor name
 *    ("6500017465" finds the PO, "UTR2607" the payment, "DIT00388" a vendor code, "tata" a vendor).
 *  - Commas: each position is its own field, in order: invoice, PO, item, UTR ("INV-26, 6500017465, 10").
 *    Leave a position empty to skip it (", 6500017465" is PO only). */

/** Splits the raw search text. `mode` is 'any' (no comma) or 'fields' (comma-separated by position). */
export function parseInvoiceQuery(raw) {
  const text = raw || '';
  if (!text.includes(',')) {
    return { mode: 'any', any: text.trim(), invoice: '', po: '', item: '', utr: '' };
  }
  const parts = text.split(',').map((s) => s.trim());
  return { mode: 'fields', any: '', invoice: parts[0] || '', po: parts[1] || '', item: parts[2] || '', utr: parts[3] || '' };
}

const contains = (value, needle) => String(value ?? '').toLowerCase().includes(needle.toLowerCase());
// '-' is how the app shows "no UTR yet"; it is not something to search for
const utrOf = (inv) => (inv.utr && inv.utr !== '-' ? inv.utr : '');

/** Invoice / PO / UTR are case-insensitive "contains"; PO item is an exact match. */
export function matchesInvoiceQuery(inv, raw) {
  const q = parseInvoiceQuery(raw);
  if (q.mode === 'any') {
    if (!q.any) return true;
    return contains(inv.no, q.any) || contains(inv.po, q.any) || String(inv.poItem ?? '') === q.any || contains(utrOf(inv), q.any)
      || contains(inv.vcode, q.any) || contains(inv.vendor, q.any);
  }
  if (!q.invoice && !q.po && !q.item && !q.utr) return true;
  if (q.invoice && !contains(inv.no, q.invoice)) return false;
  if (q.po && !contains(inv.po, q.po)) return false;
  if (q.item && String(inv.poItem ?? '') !== q.item) return false;
  if (q.utr && !contains(utrOf(inv), q.utr)) return false;
  return true;
}
