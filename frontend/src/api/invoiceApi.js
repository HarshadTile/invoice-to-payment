import { api } from './client';
import { invoiceSearchDocument } from '../utils/invoiceSearchDocument';

const INVOICE_BASE_URL = '/api/v1/invoices';
const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const amountFormatters = new Map();

function displayDate(value) {
  if (!value) return '-';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? '-' : dateFormatter.format(parsed);
}

function displayAmount(invoice) {
  const amount = invoice.sap?.payable_amount ?? invoice.sap?.amount;
  if (amount === null || amount === undefined) return '-';
  const currency = invoice.sap?.currency || 'INR';
  try {
    if (!amountFormatters.has(currency)) amountFormatters.set(currency, new Intl.NumberFormat('en-IN', { style: 'currency', currency }));
    return amountFormatters.get(currency).format(Number(amount));
  } catch {
    return `${currency} ${amount}`;
  }
}

function getDynamicDate(invoice, status) {
  switch (status) {
    case 'Invoice Uploaded':
      return displayDate(invoice.invoice_upload_date);
    case 'Approved':
      return displayDate(invoice.workflow?.final_approval_date);
    case 'Miro Booked':
      return displayDate(invoice.sap?.miro_booking_date || invoice.sap?.document_date);
    case 'Payment Due':
      return displayDate(invoice.sap?.net_due_date || invoice.invoice_date);
    case 'Paid':
      return displayDate(invoice.sap?.clearing_date);
    default:
      return displayDate(invoice.invoice_date);
  }
}

export function toWorkspaceInvoice(invoice) {
  const status = invoice.overall_status || 'Invoice Uploaded';
  const workspace = {
    no: invoice.invoice_number,
    vcode: invoice.supplier?.vendor_code || '-',
    vendor: invoice.supplier?.supplier_name || '-',
    pan: invoice.supplier?.pan || '',
    channel: invoice.channel || 'msetuSrm',
    sourceId: invoice.source_id,
    poPortal: invoice.po_portal,
    po: invoice.purchase_order?.po_number || '-',
    poItem: invoice.purchase_order?.po_item ?? '',
    amount: displayAmount(invoice),
    status,
    utr: invoice.sap?.utr_number || '-',
    date: getDynamicDate(invoice, status),
    shortPayReason: invoice.channel === 'poPortal' ? undefined : invoice.workflow?.rejection_reason || undefined,
    rejectionReason: invoice.workflow?.rejection_reason || undefined,
    stageIndex: invoice.workflow?.current_workflow_level || undefined,
    // Keep raw objects for timeline rendering
    sap: invoice.sap,
    workflow: invoice.workflow,
    rawDate: invoice.invoice_date,
    rawUploadDate: invoice.invoice_upload_date,
    productType: invoice.product_type,
    invoiceType: invoice.invoice_type,
    plant: invoice.plant,
    filterFiscalYear: invoice.filter_fiscal_year,
    dvType: invoice.dv_type,
    statusLabel: invoice.status_label,
    statusFlag: invoice.status_flag,
    invoiceUploaded: invoice.invoice_uploaded,
  };
  invoiceSearchDocument(workspace);
  return workspace;
}

async function request(path = '') {
  const response = await fetch(`${INVOICE_BASE_URL}${path}`, { headers: api.authHeaders() });

  if (!response.ok) {
    let message = `Invoice request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.error?.message || body.detail || body.message || message;
    } catch {
      // Keep the status-based message when the API does not return JSON.
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function queryString(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const invoiceApi = {
  list: (filters = {}) => request(`/list-invoices${queryString(filters)}`),
  get: (invoiceNumber, poItem, identity = {}) => request(`/invoice-details/${encodeURIComponent(invoiceNumber)}${queryString({ po_item: poItem, ...identity })}`),
  summary: (filters = {}) => request(`/invoice-summary${queryString(filters)}`),
  recent: (filters = {}) => request(`/recent-invoices${queryString(filters)}`),
  async listAll(filters = {}) {
    filters = { channel: 'all', ...filters };
    const pageSize = 1000;
    const first = await this.list({ ...filters, page: 1, page_size: pageSize });
    const pages = new Array(first.total_pages);
    pages[0] = first.items.map(toWorkspaceInvoice);
    let nextPage = 2;
    let failed = false;
    const loadPage = async () => {
      while (!failed && nextPage <= first.total_pages) {
        const page = nextPage++;
        try {
          const result = await this.list({ ...filters, page, page_size: pageSize });
          pages[page - 1] = result.items.map(toWorkspaceInvoice);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, Math.max(0, first.total_pages - 1)) }, loadPage));
    return pages.flat();
  },
};
