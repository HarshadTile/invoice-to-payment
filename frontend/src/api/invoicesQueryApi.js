/* Invoice lists, totals and lookups, filtered and paged on the server.
 *
 * Screens ask for what they show (one page, the dashboard totals, dropdown counts) instead of holding
 * every invoice. With the live API off (unit tests, the offline prototype) each query is answered from
 * the bundled invoices with the same rules, so a screen has one code path and the tests cover it.
 */
import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { api } from './client';
import { toWorkspaceInvoice, USE_FASTAPI_INVOICES } from './invoiceApi';
import { selectScopedInvoices, invoiceFiscalYear } from '../features/invoices/selectors';
import { dashboardMetrics, parseAmount } from '../features/invoices/dashboardMetrics';
import { findInvoice, invoiceProductType } from '../features/invoices/invoice';
import { CHANNELS } from '../data/constants';
import { filterInvoiceQuery } from '../utils/invoiceQuery';
import { invoiceFilterDate } from '../utils/invoiceDates';
import { dateValue } from '../utils/dateSort';
import { downloadCSV, timestampedExportName } from '../utils/csv';
import { totalsByCurrency } from '../utils/amounts';
import { INTERNAL_EXPORT_COLUMNS, internalExportRow } from '../utils/invoiceExport';

const BASE = '/v1/invoices';

/** Repeated keys for arrays (statuses=A&statuses=B); empty values are left out. */
export function invoiceQueryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'v') continue; // local cache key only
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined && item !== null && item !== '' && item !== false) search.append(key, String(item));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** The prefix the screens print before an amount for this ISO currency code ('INR' -> '₹'). */
export function currencyPrefix(code) {
  if (!code) return '';
  try {
    const shown = new Intl.NumberFormat('en-IN', { style: 'currency', currency: code }).format(0);
    return /^(\D*?)\s*\d/.exec(shown)?.[1] || code;
  } catch {
    return code;
  }
}

/* ── Local answers (live API off) ───────────────────────────────────── */

// RTK Query freezes what it caches; the bundled invoices are edited in place, so hand it copies.
const detach = (invoice) => (invoice ? structuredClone(invoice) : invoice);

// The server's sort fields (SORT_FIELDS in backend/app/services/invoice_index.py).
const SORT_READ = {
  invoice: (inv) => inv.rawDate, upload: (inv) => inv.rawUploadDate, status: (inv) => inv.date,
  due: (inv) => inv.sap?.net_due_date, approval: (inv) => invoiceFilterDate(inv, 'approval'),
  miro: (inv) => invoiceFilterDate(inv, 'miro'), utr_clearing: (inv) => invoiceFilterDate(inv, 'utr_clearing'),
  accounts: (inv) => inv.workflow?.document_sent_to_accounts_date, miro_document: (inv) => inv.sap?.document_date,
  posting: (inv) => inv.sap?.posting_date, payment: (inv) => inv.sap?.clearing_date,
  po_entry: (inv) => inv.poPortal?.entry_sheet_creation_date, po_miro_created: (inv) => inv.poPortal?.miro_created_on,
  po_miro_posting: (inv) => inv.poPortal?.miro_posting_date, po_parking: (inv) => inv.poPortal?.parking_date,
  po_posting: (inv) => inv.poPortal?.posting_date, po_rseg_posting: (inv) => inv.poPortal?.rseg_posting_date,
};
const PO_APPROVERS = ['hod1', 'hod2', 'accounts_user'];
const approverNames = (inv) => [...new Set(PO_APPROVERS.map((key) => inv.poPortal?.[key]).filter(Boolean))];
const includesText = (value, needle) => !!value && String(value).toLowerCase().includes(needle.toLowerCase());

function sortLocal(rows, sort) {
  const [key, dir] = String(sort).split(':');
  const read = SORT_READ[key];
  if (!read) return rows;
  const factor = dir === 'asc' ? 1 : -1;
  return rows.map((row, index) => ({ row, index, ms: dateValue(read(row)) }))
    .sort((a, b) => {
      if (a.ms === null || b.ms === null) return (a.ms === null) - (b.ms === null) || a.index - b.index;
      return (a.ms - b.ms) * factor || a.index - b.index;
    })
    .map((item) => item.row);
}

/** The server's query_rows (backend/app/services/invoice_query.py) over the loaded invoices. */
export function localInvoiceRows(state, params = {}) {
  return filterLocalInvoices(selectScopedInvoices(state), params, state.auth.authType !== 'supplier');
}

/** query_rows over `list`; `internal` as on the server (undated invoices kept; internal fields searchable). */
export function filterLocalInvoices(list, params = {}, internal = true) {
  const { channel, vendor_code: vendorCode, po_number: poNumber, fy, fy_strict: fyStrict, statuses, status, product_name: productName,
    date_type: dateType = 'invoice', date_from: dateFrom, date_to: dateTo, q, sort, invoice_numbers: numbers,
    plant, dv_type: dvType, product_type: productType, po_type: poType, po_stage: poStage, approver, pan,
    vendor_name: vendorName } = params;
  const wanted = statuses?.length ? new Set(statuses) : null;
  const pickedNumbers = numbers?.length ? new Set(numbers) : null;
  const keepUndated = internal && !fyStrict;
  let rows = list.filter((inv) => {
    if (channel && channel !== 'all' && inv.channel !== channel) return false;
    if (vendorCode && inv.vcode !== vendorCode) return false;
    if (poNumber && inv.po !== poNumber) return false;
    if (plant && inv.plant !== plant) return false;
    if (dvType && inv.dvType !== dvType) return false;
    if (productType && inv.productType !== productType) return false;
    if (poType && inv.poPortal?.po_type !== poType) return false;
    if (poStage && inv.poPortal?.source_approval_stage !== poStage) return false;
    if (approver && !(inv.channel === 'poPortal'
      ? approverNames(inv).some((name) => includesText(name, approver))
      : Array.from({ length: 7 }, (_, i) => inv.workflow?.approvers?.[`approver_${i + 1}`]).some((name) => includesText(name, approver)))) return false;
    if (pan && String(inv.pan || '').trim().toUpperCase() !== pan.trim().toUpperCase()) return false;
    if (vendorName && inv.vendor !== vendorName) return false;
    if (fy && fy !== 'all') {
      const year = invoiceFiscalYear(inv);
      if (year ? year !== fy : !keepUndated) return false;
    }
    if (wanted && !wanted.has(inv.status)) return false;
    if (status && inv.status !== status) return false;
    if (productName && invoiceProductType(inv) !== productName) return false;
    if (pickedNumbers && !pickedNumbers.has(inv.no)) return false;
    if (dateFrom || dateTo) {
      const day = invoiceFilterDate(inv, dateType);
      if (!day || (dateFrom && day < dateFrom) || (dateTo && day > dateTo)) return false;
    }
    return true;
  });
  if (q) rows = filterInvoiceQuery(rows, q);
  return sort ? sortLocal(rows, sort) : rows;
}

const FACET_READ = {
  status: (inv) => inv.status, product_name: (inv) => invoiceProductType(inv), fy: (inv) => invoiceFiscalYear(inv),
  po: (inv) => inv.po, plant: (inv) => inv.plant || '', dv_type: (inv) => inv.dvType || '',
  product_type: (inv) => inv.productType || '', channel: (inv) => inv.channel,
  source_approval_stage: (inv) => (inv.channel === 'poPortal' ? inv.poPortal?.source_approval_stage || '' : undefined),
  po_type: (inv) => (inv.channel === 'poPortal' ? inv.poPortal?.po_type || '' : undefined),
  po_approver: (inv) => approverNames(inv), // an invoice counts once under each of its approvers
};
// A dropdown's counts ignore its own selection (the server's own_filter in /facets).
const OWN_FILTER = {
  status: ['statuses', 'status'], product_name: ['product_name'], fy: ['fy'], plant: ['plant'], dv_type: ['dv_type'],
  product_type: ['product_type'], po_type: ['po_type'], source_approval_stage: ['po_stage'], po_approver: ['approver'],
};

function localFacets(state, params) {
  return facetsOfList(selectScopedInvoices(state), params, state.auth.authType !== 'supplier');
}

/** The server's /facets over `list`: value -> count per field, each ignoring its own selection. */
export function facetsOfList(list, { fields = [], ...params }, internal = true) {
  const result = {};
  for (const field of fields) {
    const own = Object.fromEntries((OWN_FILTER[field] || []).map((key) => [key, undefined]));
    const counts = {};
    for (const inv of filterLocalInvoices(list, { ...params, ...own }, internal)) {
      const value = FACET_READ[field]?.(inv);
      for (const one of Array.isArray(value) ? value : [value]) {
        if (one === undefined) continue;
        counts[one ?? ''] = (counts[one ?? ''] || 0) + 1;
      }
    }
    result[field] = counts;
  }
  return result;
}

function localVendors(state, { vendor_q: query, pan, limit = 50, ...params }) {
  const byCode = new Map();
  for (const inv of localInvoiceRows(state, { ...params, vendor_code: undefined })) {
    if (!inv.vcode || inv.vcode === '-') continue;
    const entry = byCode.get(inv.vcode) || { code: inv.vcode, name: '', pan: '', count: 0, channels: new Set() };
    entry.count += 1;
    entry.name = entry.name || (inv.vendor !== '-' ? inv.vendor : '');
    entry.pan = entry.pan || inv.pan || '';
    entry.channels.add(inv.channel);
    byCode.set(inv.vcode, entry);
  }
  let found = [...byCode.values()];
  if (pan) found = found.filter((v) => v.pan.toUpperCase() === pan.trim().toUpperCase());
  if (query) {
    const needle = query.trim().toLowerCase();
    found = found.filter((v) => [v.code, v.name, v.pan].some((text) => text.toLowerCase().includes(needle)));
  }
  return found.sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)).slice(0, limit)
    .map((v) => ({ ...v, channels: [...v.channels].sort() }));
}

/* ── Remote answers ──────────────────────────────────────────────────── */

const byPrefix = (byCode = {}) => Object.fromEntries(Object.entries(byCode).map(([code, value]) => [currencyPrefix(code), value]));

function withPrefixes(metrics) {
  return { ...metrics, currency: currencyPrefix(metrics.currency) || '₹', otherCurrencies: byPrefix(metrics.otherCurrencies),
    totalsByCurrency: byPrefix(metrics.totalsByCurrency) };
}

/** The local dashboard, with the extra totals the server adds (every currency; invoices with an amount). */
function localDashboard(rows, dateType) {
  const totals = totalsByCurrency(rows);
  return { ...dashboardMetrics(rows, CHANNELS.map((c) => c.key), dateType), totalsByCurrency: totals,
    amountCount: rows.filter((inv) => Object.keys(totalsByCurrency([inv])).length > 0).length };
}

/** The server's pan_directory over the loaded invoices. */
function localPans(state, { pan_q: query, limit = 5000, ...params }) {
  const pans = new Map();
  for (const inv of localInvoiceRows(state, { ...params, vendor_code: undefined, pan: undefined })) {
    const pan = String(inv.pan || '').trim();
    if (!pan) continue;
    const entry = pans.get(pan) || { names: new Map(), codes: new Set(), count: 0 };
    entry.names.set(inv.vendor, (entry.names.get(inv.vendor) || 0) + 1);
    entry.codes.add(inv.vcode);
    entry.count += 1;
    pans.set(pan, entry);
  }
  let list = [...pans].map(([pan, entry]) => {
    const names = [...entry.names].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    return { pan, name: names[0], names, codes: [...entry.codes].sort(), count: entry.count };
  });
  if (query) {
    const needle = query.trim().toLowerCase();
    list = list.filter((p) => p.pan.toLowerCase().includes(needle) || p.names.some((name) => name.toLowerCase().includes(needle)));
  }
  return list.sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
}

/** The server's vendor_report over the loaded invoices. */
function localVendorReport(state, params) {
  const paid = localInvoiceRows(state, { ...params, vendor_name: undefined }).filter((inv) => inv.status === 'Paid');
  const byCurrency = new Map();
  paid.forEach((inv) => { const a = parseAmount(inv.amount); if (a) byCurrency.set(a.currency, (byCurrency.get(a.currency) || 0) + 1); });
  const currency = [...byCurrency].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '₹';
  const rows = new Map();
  paid.forEach((inv) => {
    const row = rows.get(inv.vendor) || { name: inv.vendor, count: 0, value: 0, valued: 0 };
    row.count += 1;
    const a = parseAmount(inv.amount);
    if (a && a.currency === currency) { row.value += a.value; row.valued += 1; }
    rows.set(inv.vendor, row);
  });
  return { currency, completed: paid.length,
    suppliers: [...rows.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)) };
}

/** Runs `remote` against the API, or `local(state)` on the bundled data; errors become RTK Query errors. */
async function answer(remote, local, { getState }) {
  try {
    return { data: USE_FASTAPI_INVOICES ? await remote() : local(getState()) };
  } catch (error) {
    return { error: { status: error?.status ?? 'FETCH_ERROR', message: error?.message || 'Invoice request failed' } };
  }
}

export const invoicesQueryApi = createApi({
  reducerPath: 'invoicesQueryApi',
  baseQuery: fakeBaseQuery(),
  keepUnusedDataFor: 120,
  endpoints: (builder) => ({
    getInvoicePage: builder.query({
      queryFn: ({ page = 1, page_size: pageSize = 10, ...params }, queryApi) => answer(
        async () => {
          const result = await api.get(`${BASE}/list-invoices${invoiceQueryString({ ...params, page, page_size: pageSize })}`);
          return { items: result.items.map(toWorkspaceInvoice), total: result.total };
        },
        (state) => {
          const rows = localInvoiceRows(state, params);
          return { items: rows.slice((page - 1) * pageSize, page * pageSize).map(detach), total: rows.length };
        },
        queryApi),
    }),
    getInvoiceDashboard: builder.query({
      queryFn: (params, queryApi) => answer(
        async () => withPrefixes(await api.get(`${BASE}/dashboard${invoiceQueryString(params)}`)),
        (state) => localDashboard(localInvoiceRows(state, params), params.date_type || 'invoice'),
        queryApi),
    }),
    getInvoiceFacets: builder.query({
      queryFn: (params, queryApi) => answer(
        () => api.get(`${BASE}/facets${invoiceQueryString(params)}`),
        (state) => localFacets(state, params),
        queryApi),
    }),
    getInvoiceVendors: builder.query({
      queryFn: (params, queryApi) => answer(
        () => api.get(`${BASE}/vendors${invoiceQueryString(params)}`),
        (state) => localVendors(state, params),
        queryApi),
    }),
    getInvoicePans: builder.query({
      queryFn: (params, queryApi) => answer(
        () => api.get(`${BASE}/pans${invoiceQueryString(params)}`),
        (state) => localPans(state, params),
        queryApi),
    }),
    getVendorReport: builder.query({
      queryFn: (params, queryApi) => answer(
        async () => {
          const report = await api.get(`${BASE}/vendor-report${invoiceQueryString(params)}`);
          return { ...report, currency: currencyPrefix(report.currency) || '₹' };
        },
        (state) => localVendorReport(state, params),
        queryApi),
    }),
    /** Logs / History rows built on the server (live API only; the offline log is built in GlobalLogsBody). */
    getInvoiceEvents: builder.query({
      queryFn: (params, queryApi) => answer(
        async () => {
          const page = await api.get(`${BASE}/events${invoiceQueryString(params)}`);
          // naive ISO times are the server's local time, which new Date() reads as local too
          return { ...page, items: page.items.map((row) => ({ ...row, when: new Date(row.when) })) };
        },
        () => ({ items: [], total: 0, queryError: false }),
        queryApi),
    }),
    getRecentInvoices: builder.query({
      queryFn: ({ limit = 5, ...params }, queryApi) => answer(
        async () => (await api.get(`${BASE}/recent-invoices${invoiceQueryString({ ...params, limit })}`)).map(toWorkspaceInvoice),
        (state) => [...localInvoiceRows(state, params)]
          .sort((a, b) => new Date(b.rawUploadDate || b.rawDate || b.date) - new Date(a.rawUploadDate || a.rawDate || a.date))
          .slice(0, limit).map(detach),
        queryApi),
    }),
    /** One invoice by its identity (`no`, `poItem`, `channel`, `sourceId`, `vcode`, `po`), or null. */
    getInvoice: builder.query({
      queryFn: ({ no, poItem, channel, sourceId, vcode, po }, queryApi) => answer(
        async () => {
          const params = { po_item: poItem, channel: channel || 'all', source_id: sourceId, vendor_code: vcode,
            po_number: po && po !== '-' ? po : undefined };
          try {
            return toWorkspaceInvoice(await api.get(`${BASE}/invoice-details/${encodeURIComponent(no)}${invoiceQueryString(params)}`));
          } catch (error) {
            if (error?.status === 404) return null;
            throw error;
          }
        },
        (state) => detach(findInvoice(no, poItem, selectScopedInvoices(state), { sourceId, channel, vcode, po })) || null,
        queryApi),
    }),
  }),
});

export const {
  useGetInvoicePageQuery, useGetInvoiceDashboardQuery, useGetInvoiceFacetsQuery, useGetInvoiceVendorsQuery,
  useGetRecentInvoicesQuery, useGetInvoiceQuery, useGetInvoicePansQuery, useGetVendorReportQuery, useGetInvoiceEventsQuery,
} = invoicesQueryApi;

/** Saves every Logs / History row matching `params` as the CSV the server builds. */
export async function downloadInvoiceEvents(params, name) {
  const blob = await api.getBlob(`${BASE}/events/export${invoiceQueryString(params)}`);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${name}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

const EXPORT_PAGE_SIZE = 1000;

/** Every invoice matching `params`, page by page (for exports built in the browser with chosen columns). */
export async function fetchAllMatching(params, { getState, onProgress } = {}) {
  if (!USE_FASTAPI_INVOICES) return localInvoiceRows(getState(), params);
  const first = await api.get(`${BASE}/list-invoices${invoiceQueryString({ ...params, page: 1, page_size: EXPORT_PAGE_SIZE })}`);
  const pages = [first.items];
  const pageCount = Math.ceil(first.total / EXPORT_PAGE_SIZE);
  onProgress?.(1, pageCount);
  for (let page = 2; page <= pageCount; page += 1) {
    pages.push((await api.get(`${BASE}/list-invoices${invoiceQueryString({ ...params, page, page_size: EXPORT_PAGE_SIZE })}`)).items);
    onProgress?.(page, pageCount);
  }
  return pages.flat().map(toWorkspaceInvoice);
}

/** Downloads every invoice matching `params` (or only `invoiceNumbers`) as the Excel-ready CSV. */
export async function exportInvoices(params, { getState, invoiceNumbers, filename = 'Invoices' } = {}) {
  const query = { ...params, invoice_numbers: invoiceNumbers };
  const name = timestampedExportName(filename);
  if (!USE_FASTAPI_INVOICES) {
    const rows = localInvoiceRows(getState(), query);
    downloadCSV(name, INTERNAL_EXPORT_COLUMNS, rows.map(internalExportRow));
    return rows.length;
  }
  const blob = await api.getBlob(`${BASE}/export${invoiceQueryString(query)}`);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${name}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  return null;
}
