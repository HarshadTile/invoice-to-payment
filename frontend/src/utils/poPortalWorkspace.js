import { SRM_COLUMNS, matchesSrmWorkspace, srmHistoryRows } from './srmWorkspace';

const field = (key, label, source, type = 'text') => ({ key, label, type, read: (i) => i.poPortal?.[source] });
const commonKeys = ['invoice', 'vendor', 'vcode', 'pan', 'po', 'item', 'product', 'fy', 'invoiceDate', 'uploadDate',
  'uploaded', 'amount', 'currency', 'status', 'pending', 'rejection', 'miroStatus', 'dueDate', 'paymentDate', 'utr', 'utrDate', 'accountType'];
export const PO_COLUMNS = [
  ...SRM_COLUMNS.filter((c) => commonKeys.includes(c.key)),
  field('sourceStage', 'Source Approval Stage', 'source_approval_stage'),
  field('approvalStage', 'Recorded Approval Stage', 'approval_stage'),
  field('hod1', 'HOD1', 'hod1'), field('hod1Status', 'HOD1 Status', 'hod1_status'),
  field('hod2', 'HOD2', 'hod2'), field('hod2Status', 'HOD2 Status', 'hod2_status'),
  field('accounts', 'Accounts User', 'accounts_user'), field('accountsStatus', 'Accounts Status', 'accounts_status'),
  field('service', 'Service Code', 'service'), field('line', 'Service Line', 'line_number'),
  field('entry', 'Service Entry Sheet', 'entry_sheet'), field('entryDate', 'Service Entry Date', 'entry_sheet_creation_date', 'date'),
  field('request', 'PO Request No', 'po_request_number'), field('poType', 'PO Type', 'po_type'),
  field('activity', 'PO Activity', 'po_activity'), field('cost', 'Cost Center', 'cost_center'),
  field('comments', 'Comments', 'comments'), field('editStatus', 'Edit Status', 'edit_status'),
  field('miroCreated', 'MIRO Created On', 'miro_created_on', 'date'),
  field('miroDate', 'MIRO Booking Date', 'miro_posting_date', 'date'),
  field('miroUser', 'MIRO Created By', 'miro_created_by'),
  field('parking', 'Parking Date', 'parking_date', 'date'), field('parkingUser', 'Parking User', 'parking_user'),
  field('posting', 'Posting Date', 'posting_date', 'date'), field('postingUser', 'Posting User', 'posting_user'),
  field('rsegPosting', 'RSEG Posting Date', 'rseg_posting_date', 'date'),
  field('document', 'Document Number', 'document_number'), field('doc', 'Doc Number', 'doc_number'),
  field('claim', 'Claim Number', 'claim_number'),
];
const APPROVALS = ['invoice', 'vendor', 'po', 'item', 'status', 'sourceStage', 'approvalStage',
  'hod1', 'hod1Status', 'hod2', 'hod2Status', 'accounts', 'accountsStatus', 'pending', 'rejection'];
const VIEWS = {
  'Invoice Log': ['invoice', 'vendor', 'vcode', 'po', 'item', 'service', 'line', 'invoiceDate', 'uploadDate',
    'amount', 'status', 'approvalStage', 'pending', 'dueDate', 'utr', 'rejection'],
  'Approver Assignment': APPROVALS,
  'Service Entry (ML81N)': ['invoice', 'vendor', 'po', 'item', 'service', 'line', 'entry', 'entryDate', 'request', 'poType', 'activity', 'cost'],
  'SAP Booking (MIRO)': ['invoice', 'vendor', 'po', 'item', 'miroStatus', 'miroCreated', 'miroDate', 'miroUser', 'parking', 'parkingUser', 'posting', 'postingUser', 'rsegPosting', 'document', 'doc', 'claim'],
  'Payment Status': ['invoice', 'vendor', 'po', 'item', 'amount', 'currency', 'status', 'dueDate', 'paymentDate', 'utr', 'utrDate'],
};
export const PO_VIEWS = [...Object.keys(VIEWS), 'History'];
export const PO_TABLE_CONFIG = {
  namespace: 'po-portal', label: 'PO Portal', columns: PO_COLUMNS,
  resolveColumns(view, selection = {}) {
    const keys = selection.preset === 'all' ? PO_COLUMNS.map((c) => c.key)
      : selection.preset === 'approvals' ? APPROVALS
        : selection.preset === 'custom' ? selection.columns || [] : VIEWS[view] || VIEWS['Invoice Log'];
    return [...new Set(['invoice', 'vendor', ...keys])].map((key) => PO_COLUMNS.find((c) => c.key === key)).filter(Boolean);
  },
};

export function matchesPoPortalWorkspace(invoice, filters, dateType, skipStatus = false) {
  if (!matchesSrmWorkspace(invoice, { ...filters, approver: '', pending_with: '', approved_by: '' }, dateType, skipStatus)) return false;
  for (const key of ['hod1_status', 'hod2_status', 'accounts_status', 'source_approval_stage', 'po_type']) {
    if (filters[key] && (invoice.poPortal?.[key] || '') !== (filters[key] === '__blank__' ? '' : filters[key])) return false;
  }
  if (filters.invoice_uploaded && invoice.invoiceUploaded !== (filters.invoice_uploaded === 'yes')) return false;
  if (filters.approver && !['hod1', 'hod2', 'accounts_user'].some((key) =>
    (invoice.poPortal?.[key] || '').toLowerCase().includes(filters.approver.toLowerCase()))) return false;
  return true;
}

export function poPortalHistoryRows(invoices) {
  // Reuse only genuinely dated common milestones, replacing MIRO with its explicit posting date.
  const rows = srmHistoryRows(invoices.map((i) => ({ ...i, sap: { ...i.sap, document_date: null, posting_date: null } })));
  for (const invoice of invoices) {
    for (const [event, value] of [['Service entry created', invoice.poPortal?.entry_sheet_creation_date],
      ['MIRO created', invoice.poPortal?.miro_created_on], ['MIRO posted', invoice.poPortal?.miro_posting_date]]) {
      if (!value) continue;
      rows.push({ key: `${invoice.sourceId}|${event}`, when: new Date(`${value}T00:00:00`), hasTime: false,
        type: 'Invoice', event, detail: '', invoiceNo: invoice.no, po: invoice.po, invoice,
        vcode: invoice.vcode, channel: invoice.channel, performedBy: 'System' });
    }
  }
  return rows;
}
