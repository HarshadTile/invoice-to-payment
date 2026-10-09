/* ============================= DATA MODEL =============================
   Domain: Invoice-to-Payment tracking for Mahindra's supplier invoices.
   Ported 1:1 from the working prototype: same channels, same stage lists,
   same role matrix, same status vocabulary. */

export const ROLE_MATRIX = {
  Admin: { importExport: true, createTrace: true, manageConfig: true, manageUsers: true, manageRoles: true, viewAuditLog: true },
  'Invoice Team': { importExport: true, createTrace: true, manageConfig: false, manageUsers: false, manageRoles: false, viewAuditLog: false },
  Approver: { importExport: false, createTrace: true, manageConfig: false, manageUsers: false, manageRoles: false, viewAuditLog: false },
  Accounts: { importExport: false, createTrace: true, manageConfig: false, manageUsers: false, manageRoles: false, viewAuditLog: false },
  Viewer: { importExport: false, createTrace: true, manageConfig: false, manageUsers: false, manageRoles: false, viewAuditLog: false },
};

// Every channel the data model knows about. The Manual (e-mail) channel is kept here so
// labels/stages for any invoice already on it still resolve, but it's hidden from the UI
// (see CHANNELS below).
const ALL_CHANNELS = [
  {
    key: 'msetuSrm', label: 'Msetu / SRM',
    desc: 'Supplier-facing portal. Supplier uploads invoices against each visible purchase order; ASN/IBD gets auto-created.',
    views: ['Invoice Log', 'Approver Assignment', 'SAP Booking (MIRO)', 'Payment & UTR (FBL1N)', 'History'],
  },
  {
    key: 'poPortal', label: 'PO Portal',
    desc: 'Service invoices for certain plant codes get processed through the PO Portal.',
    views: ['Invoice Log', 'Approver Assignment', 'Service Entry (ML81N)', 'Payment Status', 'History'],
  },
  {
    key: 'manual', label: 'Manual',
    desc: 'Certain document-type purchase order invoices need to be processed manually, e.g. Capex service.',
    views: ['Invoice Log', 'Email Approval Trail', 'Service Entry (ML81N)', 'Payment Status', 'History'],
  },
  {
    key: 'mfoxPortal', label: 'MFOX Portal',
    desc: 'Invoices which are received in foreign currency.',
    views: ['Invoice Log', 'Approver Assignment', 'Corp Finance Routing', 'Service Entry & Payment', 'History'],
  },
];

// Channels offered in the UI: sidebar, filters, tabs, dashboards. Manual isn't one of them.
export const CHANNELS = ALL_CHANNELS.filter((c) => c.key !== 'manual');

export const CHANNEL_LABEL = Object.fromEntries(ALL_CHANNELS.map((c) => [c.key, c.label]));

export const CHANNEL_ROUTING_RULE = {
  msetuSrm: 'Standard PO, Indian supplier registered on SRM.',
  poPortal: 'Plant service PO, item category D.',
  manual: 'Capex / non-PO / special document type: no portal access for this doc type, so it can only move by e-mail.',
  mfoxPortal: 'Currency is not INR (USD, EUR, GBP): routed via MFOX Portal, with funds arranged by Corp Finance.',
};

export const LOGIN_CHANNELS = CHANNELS;
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


export const TICKET_CATEGORIES = [
  'Invoice Status Stuck',
  'Payment Date Enquiry',
  'Payment Not Received',
  'Amount Mismatch',
  'PO / GRN Issue',
  'Invoice Rejected',
  'Bank / GST Detail Change',
  'Invoice Missing or Duplicate',
  'Other',
];
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
