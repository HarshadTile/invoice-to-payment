const INVOICE_BASE_URL = '/api/v1/invoices';

function displayDate(value) {
  if (!value) return '-';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function displayAmount(invoice) {
  const amount = invoice.sap?.cash_discount_base ?? invoice.sap?.amount_local_currency ?? invoice.sap?.amount;
  if (amount === null || amount === undefined) return '-';
  const currency = invoice.sap?.currency || 'INR';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(amount));
  } catch {
    return `${currency} ${amount}`;
  }
}

function getDynamicDate(invoice, status) {
  switch (status) {
    case 'Invoice Uploaded':
      return invoice.sap?.posting_date 
        ? `${displayDate(invoice.sap.posting_date)} / ${displayDate(invoice.invoice_date)}` 
        : displayDate(invoice.invoice_date);
    case 'Approved':
      return displayDate(invoice.workflow?.final_approval_date || invoice.invoice_date);
    case 'Miro Booked':
      return displayDate(invoice.sap?.document_date || invoice.sap?.posting_date || invoice.invoice_date);
    case 'Payment Due':
      return displayDate(invoice.sap?.net_due_date || invoice.invoice_date);
    case 'Paid':
      return displayDate(invoice.sap?.clearing_date || invoice.invoice_date);
    default:
      return displayDate(invoice.invoice_date);
  }
}

export function toWorkspaceInvoice(invoice) {
  const status = invoice.overall_status || 'Invoice Uploaded';
  return {
    no: invoice.invoice_number,
    vcode: invoice.supplier?.vendor_code || '-',
    vendor: invoice.supplier?.supplier_name || '-',
    pan: invoice.supplier?.pan || '',
    channel: 'msetuSrm',
    po: invoice.purchase_order?.po_number || '-',
    poItem: invoice.purchase_order?.po_item ?? '',
    amount: displayAmount(invoice),
    status,
    utr: invoice.sap?.utr_number || '-',
    date: getDynamicDate(invoice, status),
    shortPayReason: invoice.workflow?.rejection_reason || undefined,
    stageIndex: invoice.workflow?.current_workflow_level || undefined,
    // Keep raw objects for timeline rendering
    sap: invoice.sap,
    workflow: invoice.workflow,
    rawDate: invoice.invoice_date,
  };
}

async function request(path = '') {
  const response = await fetch(`${INVOICE_BASE_URL}${path}`);

  if (!response.ok) {
    let message = `Invoice request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.detail || body.message || message;
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
  list: (filters = {}) => request(queryString(filters)),
  get: (invoiceNumber) => request(`/${encodeURIComponent(invoiceNumber)}`),
  summary: (filters = {}) => request(`/summary${queryString(filters)}`),
  recent: (filters = {}) => request(`/recent${queryString(filters)}`),
  async listAll(filters = {}) {
    const pageSize = 1000;
    const first = await this.list({ ...filters, page: 1, page_size: pageSize });
    const pages = await Promise.all(
      Array.from({ length: Math.max(0, first.total_pages - 1) }, (_, index) =>
        this.list({ ...filters, page: index + 2, page_size: pageSize })),
    );
    return [first, ...pages].flatMap((page) => page.items.map(toWorkspaceInvoice));
  },
};
