/* Invoice list export: the columns and values of the Excel (CSV) download. The server builds the same
 * file for lists it pages (backend/app/services/invoice_export.py), so keep the two in step. */
import { CHANNEL_LABEL } from '../data/constants';
import { currentStageName, invoiceProductType } from '../features/invoices/invoice';
import { formatInvoiceDate, invoiceDateLabel } from './invoiceDates';

export const poItemValue = (inv) => (inv.poItem === '' || inv.poItem == null ? '-' : inv.poItem);
export const rejectionReason = (inv) => (inv.status === 'Rejected'
  ? (inv.rejectionReason || inv.workflow?.rejection_reason || inv.shortPayReason || 'Not provided') : '-');

export const INTERNAL_EXPORT_COLUMNS = ['Invoice No', 'Vendor', 'Vendor Code', 'Channel', 'PO No', 'PO Item', 'Product Type',
  'Plant Code', 'Division', 'Invoice Date', 'Upload Date', 'Payment Due Date', 'Amount', 'Status', 'Pending With', 'UTR No',
  'Status Date', 'Rejection Reason'];
export const SUPPLIER_EXPORT_COLUMNS = ['Invoice No', 'Channel', 'PO No', 'Product Type', 'Invoice Date', 'Payment Due Date',
  'Amount', 'Status', 'Current Stage', 'UTR No', 'Status Date', 'Rejection Reason'];

export function internalExportRow(inv) {
  return [inv.no, inv.vendor, inv.vcode, CHANNEL_LABEL[inv.channel], inv.po, poItemValue(inv), invoiceProductType(inv),
    inv.plant || '-', inv.dvType || '-', invoiceDateLabel(inv), formatInvoiceDate(inv.rawUploadDate),
    formatInvoiceDate(inv.sap?.net_due_date), inv.amount, inv.status, inv.workflow?.pending_with || '-', inv.utr, inv.date,
    rejectionReason(inv)];
}

export function supplierExportRow(inv) {
  return [inv.no, CHANNEL_LABEL[inv.channel], inv.po, invoiceProductType(inv), invoiceDateLabel(inv),
    formatInvoiceDate(inv.sap?.net_due_date), inv.amount, inv.status, currentStageName(inv), inv.utr, inv.date,
    inv.status === 'Rejected' ? (inv.rejectionReason || inv.workflow?.rejection_reason || inv.shortPayReason || 'Not provided') : ''];
}
