/* ============================= DATA MODEL =============================
   Domain: Invoice-to-Payment tracking for Mahindra's supplier invoices.
   Ported 1:1 from the working prototype: same channels, same stage lists,
   same role matrix, same status vocabulary. */

export const ROLE_MATRIX = {
  Admin: { importExport: true, editRows: true, createTrace: true, manageUsers: true, manageConfig: true },
  'MDE Invoice Team': { importExport: true, editRows: true, createTrace: true, manageUsers: false, manageConfig: false },
  Approver: { importExport: false, editRows: false, createTrace: true, manageUsers: false, manageConfig: false },
  Accounts: { importExport: false, editRows: true, createTrace: true, manageUsers: false, manageConfig: false },
  Viewer: { importExport: false, editRows: false, createTrace: true, manageUsers: false, manageConfig: false },
};

export const CHANNELS = [
  {
    key: 'msetuSrm', label: 'Msetu / SRM',
    desc: 'Supplier-facing portal. Supplier uploads invoices against each visible purchase order; ASN/IBD gets auto-created.',
    views: ['Invoice Log', 'Approver Assignment', 'SAP Booking (MIRO)', 'Payment & UTR (FBL1N)', 'Queries', 'History'],
  },
  {
    key: 'poPortal', label: 'PO Portal',
    desc: 'Service invoices for certain plant codes get processed through the PO Portal.',
    views: ['Invoice Log', 'Approver Assignment', 'Service Entry (ML81N)', 'Payment Status', 'Queries', 'History'],
  },
  {
    key: 'manual', label: 'Manual',
    desc: 'Certain document-type purchase order invoices need to be processed manually, e.g. Capex service.',
    views: ['Invoice Log', 'Email Approval Trail', 'Service Entry (ML81N)', 'Payment Status', 'Queries', 'History'],
  },
  {
    key: 'mfoxPortal', label: 'MFOX Portal',
    desc: 'Invoices which are received in foreign currency.',
    views: ['Invoice Log', 'Approver Assignment', 'Corp Finance Routing', 'Service Entry & Payment', 'Queries', 'History'],
  },
];

export const CHANNEL_LABEL = Object.fromEntries(CHANNELS.map((c) => [c.key, c.label]));

export const CHANNEL_ROUTING_RULE = {
  msetuSrm: 'Standard PO, Indian supplier registered on SRM.',
  poPortal: 'Plant service PO, item category D.',
  manual: 'Capex / non-PO / special document type: no portal access for this doc type, so it can only move by e-mail.',
  mfoxPortal: 'Currency is not INR (USD, EUR, GBP): routed via MFOX Portal, with funds arranged by Corp Finance.',
};

// Manual/e-mail stays a real processing channel; it just isn't offered as its own team login.
export const LOGIN_CHANNELS = CHANNELS.filter((c) => c.key !== 'manual');
export const INTERNAL_TEAM_CHANNELS = LOGIN_CHANNELS.map((c) => c.key);

export const VIEW_COLUMNS = {
  'Invoice Log': ['Invoice No', 'Vendor Code', 'Vendor Name', 'PO No', 'Invoice Date', 'Amount', 'Status'],
  'Approver Assignment': ['Invoice No', 'Assigned Date', 'Approval Status', 'Approved Date'],
  'SAP Booking (MIRO)': ['Invoice No', 'MIRO Doc No', 'Booked By', 'Booking Date', 'Payment Due Date'],
  'Payment & UTR (FBL1N)': ['Invoice No', 'Vendor Code', 'Payment Date', 'UTR No', 'Amount Paid', 'Short-Payment Reason'],
  'Service Entry (ML81N)': ['Invoice No', 'Service Entry No', 'Created By', 'Creation Date', 'PO No'],
  'Payment Status': ['Invoice No', 'Vendor Code', 'Payment Due Date', 'Payment Status', 'Payment Date', 'UTR No'],
  'Email Approval Trail': ['Invoice No', 'Approval Email Date', 'Subject', 'Status'],
  'Corp Finance Routing': ['Invoice No', 'Routed Date', 'Fund Arrangement Status', 'Corp Finance Approver'],
  'Service Entry & Payment': ['Invoice No', 'Service Entry No', 'Currency', 'Payment Due Date', 'Payment Status', 'UTR No'],
};

// Real vendor-code list: every one of these maps to Tata Communications Ltd -- the
// "multiple vendor codes, one supplier" pain point. Internal data only, powers Supplier Visibility.
export const VENDOR_CODE_MAP = {
  cols: ['Vendor Code', 'Supplier Name', 'Status'],
  rows: [
    'DIT00388AC', 'DIT00388AA', 'DIT00388AP', 'DIT00388AE', 'DIT00388AM', 'DIT00388AB',
    'DIT00388AS', 'DIT00388AH', 'DIT00388AJ', 'V123', 'TCLW15', 'TCLB15', 'TCLT15',
    'DIT00388AR', 'DIT00388AL',
  ].map((code) => [code, 'Tata Communications Ltd', 'Active']),
};

export const STATUS_CHIP = {
  Paid: 'green', 'Payment Due': 'blue', 'Pending Approval': 'amber', Approved: 'blue',
  'Miro Booked': 'purple', 'Invoice Uploaded': 'gray', Rejected: 'red', Deleted: 'red',
};

export const CHANNEL_STAGES = {
  msetuSrm: [
    'Supplier uploads invoice (Msetu) against visible PO',
    'ASN/IBD created',
    'Visible to MDE Invoice Team',
    'Assigned to Approver & Accounts',
    'Approver approves',
    'Assigned to Accounts for booking',
    'Booked in SAP (MIRO)',
    'Payment due date set from payment term',
    'Payment processed & UTR confirmed (FBL1N)',
  ],
  poPortal: [
    'Invoice received manually from vendor',
    'Service entry created in SAP (ML81N)',
    'Uploaded on PO Portal, assigned to Approver',
    'Approver approves; Accounts books the invoice',
    'Payment cleared and UTR confirmed',
  ],
  manual: [
    'Vendor submits invoice by email',
    'Approval taken by email',
    'Service entry created; invoice submitted to Accounts',
    'Invoice booked by Accounts',
    'Payment cleared and UTR confirmed',
  ],
  mfoxPortal: [
    'Vendor submits invoice by email',
    'Uploaded on MFOX Portal',
    'Approver approves',
    'Corp Finance arranges funds',
    'Invoice booked by Accounts',
    'Payment cleared and UTR confirmed',
  ],
};

export const VIEW_MILESTONE = {
  msetuSrm: { 'Approver Assignment': 5, 'SAP Booking (MIRO)': 7, 'Payment & UTR (FBL1N)': 9 },
  poPortal: { 'Approver Assignment': 4, 'Service Entry (ML81N)': 2, 'Payment Status': 5 },
  manual: { 'Email Approval Trail': 2, 'Service Entry (ML81N)': 3, 'Payment Status': 5 },
  mfoxPortal: { 'Approver Assignment': 3, 'Corp Finance Routing': 4, 'Service Entry & Payment': 6 },
};


export const TICKET_CATEGORIES = ['Payment Not Received', 'Short Payment', 'Invoice Not Visible', 'Debit Note Query', 'PO / Rate Mismatch'];
export const TICKET_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
export const PRIORITY_CHIP = { Low: 'gray', Medium: 'blue', High: 'amber', Urgent: 'red' };
export const TICKET_STATUS_CHIP = { Open: 'red', 'In Progress': 'amber', Resolved: 'green', Closed: 'gray' };
export const TICKET_STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];

export const CHANNEL_SYNC_LABELS = {
  msetuSrm: ['Msetu / SRM', 'SAP: FBL1N'],
  poPortal: ['PO Portal', 'SAP: FBL1N'],
  manual: ['Manual (Email Inbox)', 'SAP: FBL1N'],
  mfoxPortal: ['MFOX Portal', 'SAP: FBL1N'],
};

// A fixed "now" so ticket SLA breach and relative dates are deterministic across the app.
export const APP_NOW = '2026-09-09';

export const ASSIGNEE_ROSTER = ['MDE Invoice Team', 'Sourcing Ops Team', 'Accounts Team'];
