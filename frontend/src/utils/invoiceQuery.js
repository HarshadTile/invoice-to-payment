/* Shared invoice search — the same parsing/matching rule used by the dedicated Search Invoice(s)
 * page and reused everywhere else an invoice table has its own search box (My Invoices, Channel
 * pages, Vendor Code page, Supplier Visibility, supplier home), so search behaves the same way
 * app-wide.
 *
 * Two ways to search:
 *  - One term, no comma: searches all mapped invoice table/detail values.
 *    ("6500017465" finds the PO, "UTR2607" the payment, "DIT00388" a vendor code, "tata" a vendor).
 *  - Commas: each position is its own field, in order: invoice, PO, item, UTR ("INV-26, 6500017465, 10").
 *    Leave a position empty to skip it (", 6500017465" is PO only). */

import { invoiceSearchDocument } from './invoiceSearchDocument.js';

export const INVOICE_SEARCH_PLACEHOLDER = 'Search all fields: Invoice no, PO no, type, status, dates, amount…';
export const INVOICE_SEARCH_LABEL = 'Search all invoice table fields - or comma-separated by position';

/** Splits the raw search text. `mode` is 'any' (no comma) or 'fields' (comma-separated by position). */
export function parseInvoiceQuery(raw) {
  const text = raw || '';
  if (!text.includes(',')) {
    return { mode: 'any', any: text.trim(), invoice: '', po: '', item: '', utr: '' };
  }
  const parts = text.split(',').map((s) => s.trim());
  return { mode: 'fields', any: '', invoice: parts[0] || '', po: parts[1] || '', item: parts[2] || '', utr: parts[3] || '' };
}

const contains = (value, needle) => value !== '-' && String(value ?? '').toLowerCase().includes(needle);
// '-' is how the app shows "no UTR yet"; it is not something to search for
const utrOf = (inv) => (inv.utr && inv.utr !== '-' ? inv.utr : '');

/** Invoice / PO / UTR are case-insensitive "contains"; PO item is an exact match. */
export function compileInvoiceQuery(raw, documentOf = invoiceSearchDocument) {
  const q = parseInvoiceQuery(raw);
  if (q.mode === 'any') {
    if (!q.any) return () => true;
    const needle = q.any.toLowerCase();
    return (inv) => contains(inv.no, needle) || contains(inv.po, needle) || String(inv.poItem ?? '') === q.any
      || contains(utrOf(inv), needle) || contains(inv.vcode, needle) || contains(inv.vendor, needle)
      || contains({ S: 'Service', M: 'Material' }[inv.productType], needle) || documentOf(inv).includes(needle);
  }
  const invoice = q.invoice.toLowerCase(), po = q.po.toLowerCase(), utr = q.utr.toLowerCase();
  return (inv) => (!invoice || contains(inv.no, invoice)) && (!po || contains(inv.po, po))
    && (!q.item || String(inv.poItem ?? '') === q.item) && (!utr || contains(utrOf(inv), utr));
}

// Reuse the compiled query for existing table/workspace callers too. Cache only
// the last query, never invoice rows or results from another user's scope.
let previousQuery;
let previousMatcher;
export function matchesInvoiceQuery(inv, raw) {
  const query = raw || '';
  if (!previousMatcher || query !== previousQuery) {
    previousQuery = query;
    previousMatcher = compileInvoiceQuery(query);
  }
  return previousMatcher(inv);
}

// Search text for a whole list, checked against in-place edits once per list
// rather than once per keystroke. Edits bump ui.dataVersion, which gives every
// view a new list reference, so a list's documents can't go stale.
const listDocuments = new WeakMap();
const WARM_CHUNK = 1500;

function listIndex(invoices) {
  let index = listDocuments.get(invoices);
  if (!index) listDocuments.set(invoices, index = { documents: new Map(), built: 0 });
  return index;
}

function buildDocuments(index, invoices, limit) {
  const end = Math.min(invoices.length, limit);
  for (; index.built < end; index.built += 1) {
    const invoice = invoices[index.built];
    index.documents.set(invoice, invoiceSearchDocument(invoice));
  }
}

function documentLookup(invoices) {
  const index = listIndex(invoices);
  buildDocuments(index, invoices, Infinity);
  return (invoice) => index.documents.get(invoice) ?? invoiceSearchDocument(invoice);
}

/** Builds a list's search text in small idle slices so the first keystroke doesn't pay for it. Returns a cancel function. */
export function warmInvoiceSearch(invoices) {
  const index = listIndex(invoices);
  let timer;
  const step = () => {
    buildDocuments(index, invoices, index.built + WARM_CHUNK);
    if (index.built < invoices.length) timer = setTimeout(step, 0);
  };
  timer = setTimeout(step, 0);
  return () => clearTimeout(timer);
}

function listMatcher(invoices, raw) {
  const q = parseInvoiceQuery(raw);
  return compileInvoiceQuery(raw, q.mode === 'any' && q.any ? documentLookup(invoices) : undefined);
}

/** Rows of `invoices` matching the search text, reusing the list's search index. */
export function filterInvoiceQuery(invoices, raw) {
  const q = parseInvoiceQuery(raw);
  return q.mode === 'any' && !q.any ? invoices : invoices.filter(listMatcher(invoices, raw));
}

/** One pass builds matching rows and dropdown counts from the same scoped data. */
export function searchInvoiceRows(invoices, raw) {
  const matcher = listMatcher(invoices, raw);
  const rows = [], counts = new Map();
  for (const invoice of invoices) {
    if (!matcher(invoice)) continue;
    rows.push(invoice);
    counts.set(invoice.status, (counts.get(invoice.status) || 0) + 1);
  }
  return { rows, counts };
}
