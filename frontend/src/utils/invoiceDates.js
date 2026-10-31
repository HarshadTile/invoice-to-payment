export const INVOICE_DATE_FIELDS = [
  { value: 'invoice', label: 'Invoice date', read: (inv) => inv.rawDate },
  { value: 'upload', label: 'Upload date', read: (inv) => inv.rawUploadDate },
  { value: 'approval', label: 'Approval date', read: (inv) => inv.workflow?.final_approval_date },
  { value: 'miro', label: 'MIRO booking date', read: (inv) => inv.sap?.miro_booking_date || inv.sap?.document_date },
  { value: 'due', label: 'Payment Due date', read: (inv) => inv.sap?.net_due_date },
  { value: 'utr_clearing', label: 'UTR clearing date', read: (inv) => inv.sap?.utr_clearing_date_paid },
];

export function invoiceDateTypeLabel(type = 'invoice') {
  return INVOICE_DATE_FIELDS.find((field) => field.value === type)?.label || 'Invoice date';
}

/** Filter the chosen source date only; a missing milestone never uses another date. */
export function invoiceFilterDate(inv, type = 'invoice') {
  const field = INVOICE_DATE_FIELDS.find((entry) => entry.value === type);
  const value = field?.read(inv);
  if (value) return String(value).slice(0, 10);
  if (type !== 'invoice' || inv.rawDate !== undefined) return '';
  // Older prototype rows contain only a formatted invoice date.
  const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
  const [day, month, year] = String(inv.date || '').split(' ');
  const key = months[(month || '').slice(0, 3)];
  return key && year ? `${year}-${key}-${day.padStart(2, '0')}` : '';
}

/** The source invoice date is independent of the current processing stage. */
export function invoiceDateLabel(invoice) {
  return formatInvoiceDate(invoice.rawDate);
}

export function formatInvoiceDate(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM' -> the first and last day of that calendar month, as YYYY-MM-DD. */
export function monthDateRange(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, '0')}` };
}

/** The calendar month a date range covers exactly ({ key: 'YYYY-MM', label: 'Mar 2026' }), or null. */
export function calendarMonthOf(from, to) {
  const key = /^(\d{4})-(\d{2})-01$/.exec(from || '') ? from.slice(0, 7) : null;
  if (!key || monthDateRange(key).to !== to) return null;
  return { key, label: `${MONTH_LABELS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}` };
}
