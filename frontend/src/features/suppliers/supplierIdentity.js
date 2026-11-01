import { runtime } from '../../data/runtime';

export function supplierForVendorCode(code) {
  const fromInvoice = runtime.invoices.find((i) => i.vcode === code);
  if (fromInvoice) return fromInvoice.vendor;
  return code;
}

// PAN is the one reliable identity in the source data — the same legal entity can
// appear under several vendor codes *and* several slightly different name spellings
// (casing, extra spaces, truncation). Map every name spelling we've seen to the PAN
// filed against it, so a lookup by any one spelling still finds every vendor code
// that really belongs to that supplier.
function panForSupplierName(supplier) {
  for (const inv of runtime.invoices) {
    if (inv.vendor === supplier && inv.pan) return inv.pan;
  }
  return null;
}

/** Real PAN, read off whichever of this supplier's invoices has one on file. */
export function panFor(supplier) {
  return panForSupplierName(supplier) || '-';
}

export function posForVendorCode(code) {
  const invs = runtime.invoices.filter((i) => i.vcode === code);
  const byPO = {};
  invs.forEach((i) => { (byPO[i.po] = byPO[i.po] || []).push(i); });
  return byPO;
}
