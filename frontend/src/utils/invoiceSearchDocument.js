import { CHANNEL_LABEL } from '../data/constants.js';

// Explicit fields used by invoice tables/details. Exclude source IDs, object
// keys and unrelated metadata. Supplier API redaction always applies first.
const ROOT = ['no', 'vcode', 'vendor', 'pan', 'channel', 'po', 'amount', 'status', 'utr', 'date',
  'shortPayReason', 'rejectionReason', 'rawDate', 'rawUploadDate', 'productType', 'invoiceType',
  'plant', 'filterFiscalYear', 'dvType', 'statusLabel', 'statusFlag', 'invoiceUploaded'];
const SAP = ['payable_amount', 'miro_status', 'miro_booking_date', 'utr_clearing_date_paid', 'miro_document',
  'company_code', 'fiscal_year', 'document_type', 'document_date', 'posting_date', 'reference', 'currency',
  'amount', 'amount_local_currency', 'cash_discount_base', 'po_number', 'net_due_date', 'baseline_date',
  'account_type', 'posting_key', 'clearing_date', 'clearing_document', 'clearing_fiscal_year', 'clearing_status', 'utr_number'];
const WORKFLOW = ['approved_by', 'pending_with', 'workflow_steps', 'rejection_reason', 'accountant',
  'document_sent_to_accounts_date', 'final_approval_date', 'approver_remarks'];
const APPROVERS = Array.from({ length: 7 }, (_, index) => `approver_${index + 1}`);
const PO = ['service', 'line_number', 'entry_sheet', 'entry_sheet_creation_date', 'po_request_number', 'po_type',
  'po_activity', 'cost_center', 'source_approval_stage', 'approval_stage', 'hod1', 'hod2', 'accounts_user',
  'hod1_status', 'hod2_status', 'accounts_status', 'comments', 'edit_status', 'edit_rejection_comment',
  'miro_created_on', 'miro_posting_date', 'parking_date', 'posting_date', 'rseg_posting_date',
  'miro_created_by', 'parking_user', 'posting_user', 'document_number', 'doc_number', 'claim_number'];
const ROOT_DEPS = [...ROOT, 'poItem', 'sap', 'workflow', 'poPortal'];
const WORKFLOW_DEPS = [...WORKFLOW, 'approvers'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const documents = new WeakMap();

function addValue(parts, value) {
  if (value == null || value === '' || value === '-' || typeof value === 'object') return;
  const text = String(value).toLowerCase();
  parts.push(text);
  if (typeof value === 'boolean') parts.push(value ? 'yes' : 'no');
  if (/\d,\d/.test(text)) parts.push(text.replaceAll(',', ''));
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(text);
  if (iso && MONTHS[Number(iso[2]) - 1]) {
    const [, year, month, day] = iso;
    const name = MONTHS[Number(month) - 1];
    parts.push(`${day} ${name} ${year}`, `${day}-${month}-${year}`, `${day}/${month}/${year}`);
    if (name === 'sep') parts.push(`${day} sept ${year}`);
  }
}

function unchanged(document) {
  for (const [object, keys, values] of document.dependencies) {
    for (let index = 0; index < keys.length; index += 1) {
      if (!Object.is(object[keys[index]], values[index])) return false;
    }
  }
  return true;
}

/** Weak per-row index with scalar snapshots to detect in-place edits too. */
export function invoiceSearchDocument(invoice) {
  const cached = documents.get(invoice);
  if (cached && unchanged(cached)) return cached.text;
  const parts = [], dependencies = [];
  const section = (object, fields, watched = fields) => {
    if (!object) return;
    dependencies.push([object, watched, watched.map((key) => object[key])]);
    for (const key of fields) addValue(parts, object[key]);
  };
  section(invoice, ROOT, ROOT_DEPS);
  section(invoice.sap, SAP);
  section(invoice.workflow, WORKFLOW, WORKFLOW_DEPS);
  section(invoice.workflow?.approvers, APPROVERS);
  section(invoice.poPortal, PO);
  addValue(parts, { S: 'Service', M: 'Material' }[invoice.productType]);
  addValue(parts, CHANNEL_LABEL[invoice.channel]);
  const endYear = Number(invoice.filterFiscalYear);
  if (Number.isInteger(endYear) && endYear >= 1900 && endYear <= 9999) parts.push(`${endYear - 1}-${String(endYear).slice(-2)}`);
  const text = parts.join('\u001f');
  documents.set(invoice, { text, dependencies });
  return text;
}
