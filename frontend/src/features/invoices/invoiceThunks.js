import { api } from '../../api/client';
import { runtime } from '../../data/runtime';
import { bumpData } from '../ui/uiSlice';

/** The forward path an invoice takes; Failed is an outcome, not a step. */
export const STATUS_LADDER = ['Invoice Uploaded', 'Pending Approval', 'Approved', 'Miro Booked', 'Payment Due', 'Paid'];

export function nextStatusFor(inv) {
  const i = STATUS_LADDER.indexOf(inv.status);
  return i >= 0 && i < STATUS_LADDER.length - 1 ? STATUS_LADDER[i + 1] : null;
}

/** Move an invoice to `status` (optionally recording a UTR). Updates the shared
 *  runtime record straight away, persists via PATCH /invoices/:no, and rolls back
 *  if the server refuses. Throws on failure so the caller can toast. */
export const moveInvoice = ({ no, status, utr }) => async (dispatch) => {
  const inv = runtime.invoices.find((i) => i.no === no);
  if (!inv) throw new Error('Invoice not found.');
  const prev = { status: inv.status, utr: inv.utr, stageIndex: inv.stageIndex };

  Object.assign(inv, { status }, utr ? { utr } : {});
  dispatch(bumpData());
  try {
    const updated = await api.patch(`/invoices/${encodeURIComponent(no)}`, { status, ...(utr ? { utr } : {}) });
    if (updated && updated.no) Object.assign(inv, updated);
    dispatch(bumpData());
    return inv;
  } catch (err) {
    Object.assign(inv, prev);
    dispatch(bumpData());
    throw err;
  }
};
