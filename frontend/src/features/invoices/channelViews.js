import { CHANNEL_STAGES, VIEW_MILESTONE } from '../../data/constants';

/** How many of the channel's stages an invoice in this status has reached. */
function stageProgress(channel, status) {
  const total = CHANNEL_STAGES[channel].length;
  const pct = {
    Initial: 0.1, 'Pending for Approval': 0.45, 'Level Approved': 0.5,
    'Push to PO Portal': 0.2, 'Entry Deleted': 0.1,
    'Invoice Uploaded': 0.2, 'Pending Approval': 0.45, Approved: 0.6,
    'Miro Booked': 0.8, 'Payment Due': 0.8, Paid: 1, Rejected: 0.4, Deleted: 0.4,
  }[status] || 0.2;
  return Math.max(1, Math.round(total * pct));
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// A real payment has actually happened for this invoice — either the status has
// moved to Paid, or a UTR has been recorded (a UTR can land slightly ahead of the
// status flip in real data). Anything else has nothing to show on a payment ledger.
function hasPaymentActivity(inv) {
  return inv.status === 'Paid' || (inv.utr && inv.utr !== '-');
}

export function channelViewRows(channelKey, view, invoices) {
  const milestone = (VIEW_MILESTONE[channelKey] || {})[view];
  // Payment & UTR / Payment Status are ledgers of what has actually been paid —
  // they used to list every single invoice (paid or not), burying the real
  // payment rows under thousands of all-dash placeholders for invoices that
  // haven't reached payment yet.
  const source = (view === 'Payment & UTR (FBL1N)' || view === 'Payment Status')
    ? invoices.filter(hasPaymentActivity)
    : invoices;
  return source.map((inv) => {
    // Real SRM invoices carry source dates; missing documents and people stay empty.
    if (inv.sap) {
      const dateLabel = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
      if (view === 'Approver Assignment') return [inv.no, '-', inv.statusLabel || inv.status, dateLabel(inv.workflow?.final_approval_date)];
      if (view === 'SAP Booking (MIRO)') return [inv.no, inv.sap.miro_document || '-', inv.workflow?.accountant || '-', dateLabel(inv.sap.document_date), dateLabel(inv.sap.net_due_date)];
      if (view === 'Payment & UTR (FBL1N)') return [inv.no, inv.vcode, dateLabel(inv.sap.clearing_date), inv.utr, inv.amount, inv.shortPayReason || '-'];
      if (view === 'Payment Status') return [inv.no, inv.vcode, dateLabel(inv.sap.net_due_date), inv.status === 'Paid' ? 'Paid' : 'Pending', dateLabel(inv.sap.clearing_date), inv.utr];
    }
    const done = stageProgress(inv.channel, inv.status);
    const failed = inv.status === 'Rejected' || ['Deleted', 'Entry Deleted'].includes(inv.status);
    const reached = milestone != null && done >= milestone && !failed;
    const idShort = inv.no.replace('INV-', '');
    if (view === 'Approver Assignment') return [inv.no, inv.date, reached ? 'Approved' : (failed ? 'Rejected' : 'Pending'), reached ? inv.date : '-'];
    if (view === 'SAP Booking (MIRO)') return [inv.no, reached ? 'MIRO-' + idShort : '-', reached ? 'Accounts Team' : '-', reached ? inv.date : '-', reached ? addDays(inv.date, 30) : '-'];
    if (view === 'Payment & UTR (FBL1N)') {
      const paid = inv.status === 'Paid';
      return [inv.no, inv.vcode, paid ? inv.date : '-', inv.utr, paid ? inv.amount : '-', inv.shortPayReason || '-'];
    }
    if (view === 'Service Entry (ML81N)') return [inv.no, reached ? 'SE-' + idShort : '-', reached ? 'MDE Invoice Team' : '-', reached ? inv.date : '-', inv.po];
    if (view === 'Payment Status') {
      const paid = inv.status === 'Paid';
      return [inv.no, inv.vcode, addDays(inv.date, 30), failed ? 'Failed' : (paid ? 'Paid' : 'Pending'), paid ? inv.date : '-', paid ? inv.utr : '-'];
    }
    if (view === 'Email Approval Trail') return [inv.no, reached ? inv.date : '-', 'Approval - PO ' + inv.po, reached ? 'Approved' : (failed ? 'Rejected' : 'Pending')];
    if (view === 'Corp Finance Routing') return [inv.no, reached ? inv.date : '-', reached ? 'Arranged' : (failed ? 'Blocked' : 'Pending'), reached ? 'Corp Finance Desk' : '-'];
    if (view === 'Service Entry & Payment') {
      const paid = inv.status === 'Paid';
      return [inv.no, done >= 2 && !failed ? 'SE-' + idShort : '-', 'USD', addDays(inv.date, 30), failed ? 'Failed' : (paid ? 'Paid' : 'Pending'), paid ? inv.utr : '-'];
    }
    return [inv.no];
  });
}
