export const INITIAL_TICKETS = [
  {
    id: 'TCK-1001', no: 'INV-PP-2002', category: 'Short Payment',
    desc: 'Amount received is less than invoice value. Please share the reason.',
    status: 'Resolved', priority: 'Medium', assignee: 'V. Nair', raisedBy: 'Supplier',
    raisedDate: '26 Jul 2026', slaHours: 48, resolvedDate: '27 Jul 2026',
    comments: [
      { author: 'Accounts', role: 'Accounts', date: '26 Jul 2026', text: 'Checking the debit note against this invoice, will update within the day.' },
      { author: 'Accounts', role: 'Accounts', date: '27 Jul 2026', text: 'Confirmed: ₹4,200 was withheld for a quality deduction per DN-0093, shared separately. Amount paid is correct.' },
      { author: 'Supplier', role: 'Supplier', date: '27 Jul 2026', text: 'Received the debit note, thank you for confirming. Closing this out on our end.' },
    ],
    activity: [
      { date: '26 Jul 2026', text: 'Ticket created by Supplier, priority set to Medium, assigned to V. Nair.' },
      { date: '26 Jul 2026', text: 'Status changed to In Progress.' },
      { date: '27 Jul 2026', text: 'Status changed to Resolved.' },
    ],
  },
  {
    id: 'TCK-1002', no: 'INV-MS-1002', category: 'Payment Not Received',
    desc: 'Payment due date has passed, no UTR visible yet.',
    status: 'Open', priority: 'High', assignee: 'MDE Invoice Team', raisedBy: 'Supplier',
    raisedDate: '05 Aug 2026', slaHours: 24,
    comments: [
      { author: 'Supplier', role: 'Supplier', date: '05 Aug 2026', text: 'Payment due date on this invoice was 02 Aug, still nothing showing on our end and no UTR here either. Can someone check?' },
      { author: 'MDE Invoice Team', role: 'MDE Invoice Team', date: '06 Aug 2026', text: 'Looking into it, checking with Accounts on the payment run status for this batch.' },
      { author: 'Supplier', role: 'Supplier', date: '06 Aug 2026', text: 'Thanks, following up as this is now a few days past due on our side too.' },
    ],
    activity: [{ date: '05 Aug 2026', text: 'Ticket created by Supplier, priority set to High, assigned to MDE Invoice Team.' }],
  },
  {
    id: 'TCK-1003', no: 'INV-MN-3003', category: 'PO / Rate Mismatch',
    desc: 'Rate on invoice does not match the PO line item.',
    status: 'In Progress', priority: 'Medium', assignee: 'K. Shah', raisedBy: 'Internal',
    raisedDate: '06 Aug 2026', slaHours: 24,
    comments: [
      { author: 'MDE Invoice Team', role: 'MDE Invoice Team', date: '06 Aug 2026', text: 'Flagging to Accounts to re-check the PO line rate before this goes to approval.' },
      { author: 'Accounts', role: 'Accounts', date: '06 Aug 2026', text: "Checked PO 4500061203, line rate shows ₹185/unit but invoice was raised at ₹210/unit. Need supplier to confirm which is correct before we proceed." },
      { author: 'Supplier', role: 'Supplier', date: '07 Aug 2026', text: "₹210 is correct, the PO line wasn't updated after the rate revision in June. Sharing the revised rate agreement separately." },
      { author: 'Accounts', role: 'Accounts', date: '07 Aug 2026', text: 'Received it, getting the PO line corrected now so approval can go through at the right rate.' },
    ],
    activity: [
      { date: '06 Aug 2026', text: 'Ticket created by Internal, priority set to Medium, assigned to MDE Invoice Team.' },
      { date: '06 Aug 2026', text: 'Reassigned to K. Shah.' },
      { date: '06 Aug 2026', text: 'Status changed to In Progress.' },
    ],
  },
  {
    id: 'TCK-1004', no: 'INV-MS-1005', category: 'Invoice Not Visible',
    desc: 'Invoice failed at approval; supplier cannot see any status update.',
    status: 'Open', priority: 'Urgent', assignee: 'Unassigned', raisedBy: 'Supplier',
    raisedDate: '07 Aug 2026', slaHours: 24,
    comments: [
      { author: 'Supplier', role: 'Supplier', date: '07 Aug 2026', text: "This invoice has been sitting with no movement for a week now, and status just shows Failed with no explanation. Can someone please take this up, it's urgent on our side." },
    ],
    activity: [{ date: '07 Aug 2026', text: 'Ticket created by Supplier, priority set to Urgent.' }],
  },
];
