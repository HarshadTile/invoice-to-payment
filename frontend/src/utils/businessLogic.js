import {
  CHANNEL_STAGES, VIEW_MILESTONE, APP_NOW,
} from '../data/constants';
import { runtime } from '../data/runtime';

export function handlerFor(inv) {
  return { approver: '-', approverEmail: '-', accounts: '-', accountsEmail: '-' };
}

/** Invoice number alone is NOT unique in the real source data — the same INV_NO can
 *  cover several PO line items (different PO_ITEM), each a separate real row. Every
 *  "open this one invoice" action must disambiguate with poItem when it's available,
 *  or it silently resolves to whichever matching row happens to come first. `list`
 *  defaults to runtime.invoices but callers with an already-scoped/filtered array
 *  (e.g. selectScopedInvoices) should pass it explicitly. */
export function findInvoice(no, poItem, list = runtime.invoices) {
  const candidates = list.filter((i) => i.no === no);
  if (candidates.length <= 1) return candidates[0];
  if (poItem !== undefined && poItem !== null && poItem !== '') {
    const match = candidates.find((i) => String(i.poItem) === String(poItem));
    if (match) return match;
  }
  return candidates[0];
}

export function currentHandlerFor(inv) {
  return { name: '-', role: '-', email: '-' };
}

function bucketHandlerFor(inv, pct) {
  return { name: '-', role: '-', email: '-' };
}


/* ===================== small deterministic helpers ===================== */
export function hashIdx(str, mod) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % mod;
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ===================== supplier / PAN / vendor code identity ===================== */
export function supplierForVendorCode(code) {
  const fromInvoice = runtime.invoices.find((i) => i.vcode === code);
  if (fromInvoice) return fromInvoice.vendor;
  return code;
}

// PAN is the one reliable identity in the source data — the same legal entity can
// appear under several vendor codes *and* several slightly different name spellings
// (casing, extra spaces, truncation). Map every name spelling we've seen to the PAN
// filed against it, so a lookup by any one spelling still finds every vendor code
// that really belongs to that supplier.
function panForSupplierName(supplier) {
  for (const inv of runtime.invoices) {
    if (inv.vendor === supplier && inv.pan) return inv.pan;
  }
  return null;
}

/** One row per real supplier identity (grouped by PAN, not the free-text name
 *  string) with a canonical display name — whichever spelling appears most often. */
export function supplierDirectory() {
  const panByName = new Map();
  runtime.invoices.forEach((inv) => {
    if (inv.vendor && inv.pan && !panByName.has(inv.vendor)) panByName.set(inv.vendor, inv.pan);
  });
  const groups = new Map();
  runtime.invoices.forEach((inv) => {
    if (!inv.vendor) return;
    const key = panByName.get(inv.vendor) || inv.vendor;
    if (!groups.has(key)) groups.set(key, { key, pan: panByName.get(inv.vendor) || null, names: new Map() });
    const g = groups.get(key);
    g.names.set(inv.vendor, (g.names.get(inv.vendor) || 0) + 1);
  });
  return [...groups.values()]
    .map((g) => ({ key: g.key, pan: g.pan, name: [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function vendorCodesFor(supplier) {
  const pan = panForSupplierName(supplier);
  const matching = runtime.invoices.filter((i) => (pan ? i.pan === pan : i.vendor === supplier));
  const fromInvoices = [...new Set(matching.map((i) => i.vcode))];
  return fromInvoices;
}

/** Real PAN, read off whichever of this supplier's invoices has one on file. */
export function panFor(supplier) {
  return panForSupplierName(supplier) || '-';
}

export function posForVendorCode(code) {
  const invs = runtime.invoices.filter((i) => i.vcode === code);
  const byPO = {};
  invs.forEach((i) => { (byPO[i.po] = byPO[i.po] || []).push(i); });
  return byPO;
}

/* ===================== stage progress & handlers ===================== */
export function stageProgress(channel, status) {
  const total = CHANNEL_STAGES[channel].length;
  const pct = {
    'Invoice Uploaded': 0.2, 'Pending Approval': 0.45, Approved: 0.6,
    'Miro Booked': 0.8, 'Payment Due': 0.8, Paid: 1, Rejected: 0.4, Deleted: 0.4,
  }[status] || 0.2;
  return Math.max(1, Math.round(total * pct));
}

// The real data only ever tells us one of these 6 status values — there's no
// granular SAP/ASN sub-step behind it. "Current Stage" used to invent one by
// mapping status onto a percentage of CHANNEL_STAGES' 9-step breakdown (e.g.
// showing "ASN/IBD created" for an invoice that's really just "Invoice
// Uploaded"); now it shows the real status, same as the progress stepper does.
export function currentStageName(inv) {
  if (inv.status === 'Rejected') return 'Rejected';
  if (inv.status === 'Deleted') return 'Deleted';
  return inv.status || 'Invoice Uploaded';
}


export function combinedStatusFor(inv) {
  if (inv.status === 'Paid') return { label: 'Fully Paid', tone: 'green', reason: 'Settled in full. UTR and payment date are shown below.' };
  if (inv.status === 'Rejected' || inv.status === 'Deleted') return { label: inv.status, tone: 'red', reason: 'Blocked. See the current stage above for why.' };
  if (inv.status === 'Approved') return { label: 'Approved', tone: 'blue', reason: 'Approved. Waiting for the invoice to be booked in SAP (MIRO).' };
  if (['Payment Due', 'Miro Booked'].includes(inv.status)) return { label: 'Unpaid', tone: 'blue', reason: 'Booked, not yet due for payment.' };
  return { label: 'In Approval', tone: 'amber', reason: 'Awaiting internal review or approver action.' };
}

/* ===================== history / timeline (per invoice, per vendor code, global) ===================== */
export function getInvoiceHistory(inv, tickets) {
  const stages = CHANNEL_STAGES[inv.channel];
  const total = stages.length;
  const done = stageProgress(inv.channel, inv.status);
  const owner = currentHandlerFor(inv);
  const failed = inv.status === 'Rejected' || inv.status === 'Deleted';
  const fullyDone = done >= total && !failed;
  const events = [];
  for (let i = 1; i <= done; i++) {
    const pct = i / total;
    
    const isCurrent = i === done;
    let evStatus = 'Completed';
    if (isCurrent && failed) evStatus = 'Failed';
    else if (isCurrent && !fullyDone) evStatus = 'In Progress';
    events.push({
      date: addDays(inv.date, i - 1),
      event: stages[i - 1],
      stage: stages[i - 1],
      status: evStatus,
      person: owner.name,
      role: owner.role,
      email: owner.email,
      remarks: evStatus === 'Failed' ? (inv.shortPayReason || 'Process halted at this stage.') : '',
    });
  }
  (tickets || []).filter((t) => (t.invoice_no || t.no) === inv.no).forEach((t) => {
    const createdAt = t.created_at || t.raisedDate;
    const source = t.source === 'SUPPLIER' || t.raisedBy === 'Supplier' ? 'Supplier' : 'Internal';
    events.push({ date: createdAt, event: 'Query Raised', stage: `Category: ${t.category}`, status: t.status, person: source, role: source, email: '', remarks: t.description || t.desc });
    if (t.resolved_at || t.resolvedDate) {
      events.push({ date: t.resolved_at || t.resolvedDate, event: 'Query Resolved', stage: `Category: ${t.category}`, status: 'Resolved', person: '-', role: '-', email: '', remarks: '' });
    }
  });
  return events.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function getGlobalHistory(list, tickets) {
  const rows = [];
  (list || runtime.invoices).forEach((inv) => {
    getInvoiceHistory(inv, tickets).forEach((ev) => rows.push({ ...ev, no: inv.no, vcode: inv.vcode, vendor: inv.vendor, po: inv.po, channel: inv.channel }));
  });
  rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  return rows;
}

export function activityLogRows(invoices, limit = 8) {
  const sorted = [...invoices].sort((a, b) => new Date(b.date) - new Date(a.date));
  return sorted.slice(0, limit).map((inv) => ({
    inv,
    stage: currentStageName(inv),
    
  }));
}

/* ===================== per-channel sub-view rows (Approver Assignment, MIRO, etc.) ===================== */
// A real payment has actually happened for this invoice — either the status has
// moved to Paid, or a UTR has been recorded (a UTR can land slightly ahead of the
// status flip in real data). Anything else has nothing to show on a payment ledger.
function hasPaymentActivity(inv) {
  return inv.status === 'Paid' || (inv.utr && inv.utr !== '-');
}

export function channelViewRows(channelKey, view, invoices) {
  const milestone = (VIEW_MILESTONE[channelKey] || {})[view];
  // Payment & UTR / Payment Status are ledgers of what has actually been paid —
  // they used to list every single invoice (paid or not), burying the real
  // payment rows under thousands of all-dash placeholders for invoices that
  // haven't reached payment yet.
  const source = (view === 'Payment & UTR (FBL1N)' || view === 'Payment Status')
    ? invoices.filter(hasPaymentActivity)
    : invoices;
  return source.map((inv) => {
    const done = stageProgress(inv.channel, inv.status);
    const failed = inv.status === 'Rejected' || inv.status === 'Deleted';
    const reached = milestone != null && done >= milestone && !failed;
    const idShort = inv.no.replace('INV-', '');
    if (view === 'Approver Assignment') return [inv.no, inv.date, reached ? 'Approved' : (failed ? 'Rejected' : 'Pending'), reached ? inv.date : '-'];
    if (view === 'SAP Booking (MIRO)') return [inv.no, reached ? 'MIRO-' + idShort : '-', reached ? 'Accounts Team' : '-', reached ? inv.date : '-', reached ? addDays(inv.date, 30) : '-'];
    if (view === 'Payment & UTR (FBL1N)') {
      const paid = inv.status === 'Paid';
      return [inv.no, inv.vcode, paid ? inv.date : '-', inv.utr, paid ? inv.amount : '-', inv.shortPayReason || '-'];
    }
    if (view === 'Service Entry (ML81N)') return [inv.no, reached ? 'SE-' + idShort : '-', reached ? 'MDE Invoice Team' : '-', reached ? inv.date : '-', inv.po];
    if (view === 'Payment Status') {
      const paid = inv.status === 'Paid';
      return [inv.no, inv.vcode, addDays(inv.date, 30), failed ? 'Failed' : (paid ? 'Paid' : 'Pending'), paid ? inv.date : '-', paid ? inv.utr : '-'];
    }
    if (view === 'Email Approval Trail') return [inv.no, reached ? inv.date : '-', 'Approval - PO ' + inv.po, reached ? 'Approved' : (failed ? 'Rejected' : 'Pending')];
    if (view === 'Corp Finance Routing') return [inv.no, reached ? inv.date : '-', reached ? 'Arranged' : (failed ? 'Blocked' : 'Pending'), reached ? 'Corp Finance Desk' : '-'];
    if (view === 'Service Entry & Payment') {
      const paid = inv.status === 'Paid';
      return [inv.no, done >= 2 && !failed ? 'SE-' + idShort : '-', 'USD', addDays(inv.date, 30), failed ? 'Failed' : (paid ? 'Paid' : 'Pending'), paid ? inv.utr : '-'];
    }
    return [inv.no];
  });
}

/* ===================== tickets: SLA breach ===================== */
export function ticketInvoice(t) {
  return runtime.invoices.find((i) => i.no === t.no);
}

export function ticketBreached(t) {
  if (t.status === 'Resolved' || t.status === 'Closed') return false;
  const raised = new Date(t.raisedDate);
  const dueMs = raised.getTime() + t.slaHours * 3600 * 1000;
  return new Date(APP_NOW).getTime() > dueMs;
}

/* ===================== CSV export ===================== */
export function downloadCSV(filename, cols, rows) {
  const csv = [cols.join(',')].concat(
    rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
  ).join('\n');
  // The leading BOM tells Excel the file is UTF-8, so symbols such as the rupee sign (₹) open correctly
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.replace(/\s+/g, '_') + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}



export function getFiscalYear(dateStr) {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth();
  if (month < 3) return `${year - 1}-${String(year).slice(2)}`;
  return `${year}-${String(year + 1).slice(2)}`;
}
