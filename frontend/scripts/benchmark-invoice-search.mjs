// Synthetic data only. Run: node scripts/benchmark-invoice-search.mjs
import { parseInvoiceQuery, searchInvoiceRows } from '../src/utils/invoiceQuery.js';

const rows = Array.from({ length: 44279 }, (_, index) => ({ no: `INV-2026-${index}`, po: `65000${index}`,
  poItem: 10, vendor: `Supplier Company ${index}`, vcode: `V${index}`, utr: `UTR${index}`, status: 'Approved' }));
const queries = ['s', 'su', 'sup', 'supp', 'suppl', 'suppli', 'supplier'];
const statuses = ['Approved', 'Paid', 'Rejected', 'Initial', 'Invoice Uploaded', 'Miro Booked', 'Pending for Approval', 'Action Required'];
function previousMatch(row, query) {
  const parsed = parseInvoiceQuery(query);
  const contains = (value) => String(value ?? '').toLowerCase().includes(parsed.any.toLowerCase());
  return contains(row.no) || contains(row.po) || String(row.poItem) === parsed.any || contains(row.utr) || contains(row.vcode) || contains(row.vendor);
}
function measure(run) {
  const start = performance.now();
  let count = 0;
  for (const query of queries) count += run(query);
  return { ms: Number((performance.now() - start).toFixed(1)), matchingRows: count };
}
const before = measure((query) => {
  const matched = rows.filter((row) => previousMatch(row, query));
  const beforeStatus = rows.filter((row) => previousMatch(row, query));
  for (const status of statuses) beforeStatus.filter((row) => row.status === status);
  return matched.length;
});
const after = measure((query) => searchInvoiceRows(rows, query).rows.length);
if (before.matchingRows !== after.matchingRows) throw new Error('Search results changed');
console.log(JSON.stringify({ rows: rows.length, typingSteps: queries.length, before, after }, null, 2));
