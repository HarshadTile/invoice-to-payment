import { runtime } from '../../data/runtime';

/** Who the invoice is with now, as recorded by the source system. */
export function handlerFor(inv) {
  return { approver: inv.workflow?.pending_with || inv.workflow?.approved_by || '-', approverEmail: '-',
    accounts: inv.workflow?.accountant || '-', accountsEmail: '-' };
}

/** Invoice number alone is NOT unique in the real source data — the same INV_NO can
 *  cover several PO line items (different PO_ITEM), each a separate real row. Every
 *  "open this one invoice" action must disambiguate with poItem when it's available,
 *  or it silently resolves to whichever matching row happens to come first. `list`
 *  defaults to runtime.invoices but callers with an already-scoped/filtered array
 *  (e.g. selectScopedInvoices) should pass it explicitly. */
export function findInvoice(no, poItem, list = runtime.invoices, identity = {}) {
  const candidates = list.filter((i) => i.no === no
    && (!identity.sourceId || i.sourceId === identity.sourceId)
    && (!identity.channel || i.channel === identity.channel)
    && (!identity.vcode || i.vcode === identity.vcode) && (!identity.po || i.po === identity.po));
  if ((identity.vcode || identity.po) && poItem !== undefined && poItem !== null && poItem !== '') {
    return candidates.find((i) => String(i.poItem) === String(poItem));
  }
  if (candidates.length <= 1) return candidates[0];
  if (poItem !== undefined && poItem !== null && poItem !== '') {
    const match = candidates.find((i) => String(i.poItem) === String(poItem));
    if (match) return match;
  }
  return candidates[0];
}

// The real data only ever tells us one of these 6 status values — there's no
// granular SAP/ASN sub-step behind it. "Current Stage" used to invent one by
// mapping status onto a percentage of CHANNEL_STAGES' 9-step breakdown (e.g.
// showing "ASN/IBD created" for an invoice that's really just "Invoice
// Uploaded"); now it shows the real status, same as the progress stepper does.
export function currentStageName(inv) {
  if (inv.status === 'Rejected') return 'Rejected';
  if (['Deleted', 'Entry Deleted'].includes(inv.status)) return inv.status;
  return inv.status || 'Invoice Uploaded';
}

export function invoiceProductType(inv) {
  return { S: 'Service', M: 'Material' }[inv.productType] || inv.invoiceType || '-';
}

export function combinedStatusFor(inv) {
  if (inv.status === 'Action Required') return { label: 'Action Required', tone: 'amber', reason: 'Review the invoice comments and provide the requested information.' };
  if (inv.status === 'Paid') return { label: 'Fully Paid', tone: 'green', reason: 'Settled in full. UTR and payment date are shown below.' };
  if (inv.status === 'Rejected' || ['Deleted', 'Entry Deleted'].includes(inv.status)) return { label: inv.status, tone: 'red', reason: 'Blocked. See the current stage above for why.' };
  if (inv.status === 'Approved') return { label: 'Approved', tone: 'blue', reason: 'Approved. Waiting for the invoice to be booked in SAP (MIRO).' };
  if (['Payment Due', 'Miro Booked'].includes(inv.status)) return { label: 'Unpaid', tone: 'blue', reason: 'Booked in SAP, awaiting payment.' };
  if (['Initial', 'Invoice Uploaded', 'Push to PO Portal', 'Level Approved'].includes(inv.status)) return { label: inv.status, tone: 'gray', reason: 'Current status reported by SRM.' };
  return { label: 'In Approval', tone: 'amber', reason: 'Awaiting internal review or approver action.' };
}
