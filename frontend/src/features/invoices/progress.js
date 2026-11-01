import { formatInvoiceDate } from '../../utils/invoiceDates';

/** The six steps every invoice moves through, as shown in the Invoice Progress stepper. */
export const INVOICE_STEPS = ['Initial', 'Invoice Uploaded', 'Pending for Approval', 'Approved', 'Miro Booked', 'Paid'];

const DELETED = ['Deleted', 'Entry Deleted'];

export const isFailed = (inv) => inv.status === 'Rejected' || DELETED.includes(inv.status);
export const isDeleted = (inv) => DELETED.includes(inv.status);

const displayDate = (value) => {
  const text = formatInvoiceDate(value);
  return text === '-' ? null : text;
};

/** Each step's state: done, current, fail or todo. A rejected invoice stopped at the approval
 *  step; a deleted one never got past upload. */
export function invoiceSteps(inv) {
  const failed = isFailed(inv);
  const currentIndex = INVOICE_STEPS.indexOf(['Pending Approval', 'Level Approved', 'Action Required'].includes(inv.status) ? 'Pending for Approval' : inv.status);
  const done = failed ? (inv.status === 'Rejected' ? 2 : 1) : (currentIndex >= 0 ? currentIndex + 1 : 1);
  return INVOICE_STEPS.map((name, i) => {
    const idx = i + 1;
    const state = failed && idx >= done ? 'fail' : idx < done || (idx === done && inv.status === 'Paid') ? 'done' : idx === done ? 'current' : 'todo';
    return { name, idx, state, date: stepDate(inv, name) };
  });
}

/** When the invoice reached a step, from the source dates (the Paid step adds the UTR). */
export function stepDate(inv, step) {
  switch (step) {
    case 'Initial': return displayDate(inv.rawDate);
    case 'Invoice Uploaded': return displayDate(inv.rawUploadDate);
    case 'Approved': return displayDate(inv.workflow?.final_approval_date);
    case 'Miro Booked': return displayDate(inv.sap?.miro_booking_date || inv.sap?.document_date);
    case 'Paid':
      return inv.utr && inv.utr !== '-' ? `${displayDate(inv.sap?.clearing_date) || '-'} (${inv.utr})` : displayDate(inv.sap?.clearing_date);
    default: return null;
  }
}
