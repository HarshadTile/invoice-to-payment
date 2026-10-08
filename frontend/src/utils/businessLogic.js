import {
  CHANNEL_STAGES, VIEW_MILESTONE, APP_NOW,
} from '../data/constants';
import { runtime } from '../data/runtime';
import { VENDOR_CODE_MAP } from '../data/constants';

export function handlerFor(inv) {
  return { approver: '-', approverEmail: '-', accounts: '-', accountsEmail: '-' };
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
  const fromMap = VENDOR_CODE_MAP.rows.find((r) => r[0] === code);
  if (fromMap) return fromMap[1];
  return code;
}

export function synthPAN(name) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 5; i++) s += letters[hashIdx(name + 'L' + i, 26)];
  for (let i = 0; i < 4; i++) s += hashIdx(name + 'D' + i, 10).toString();
  s += letters[hashIdx(name + 'X', 26)];
  return s;
}

export function synthPhone(name) {
  let s = '+91 ';
  for (let i = 0; i < 5; i++) s += hashIdx(name + 'P' + i, 10);
  s += ' ';
  for (let i = 5; i < 10; i++) s += hashIdx(name + 'P' + i, 10);
  return s;
}

export function supplierEmailFor(vendor) {
  const slug = vendor.toLowerCase().replace(/\b(ltd|pvt|inc|group|india|components|auto)\b/g, '').trim().split(/\s+/).filter(Boolean).join('');
  return `accounts@${slug || 'supplier'}.com`;
}

export function vendorCodesFor(supplier) {
  const fromMap = VENDOR_CODE_MAP.rows.filter((r) => r[1] === supplier).map((r) => r[0]);
  if (fromMap.length) return fromMap;
  return [...new Set(runtime.invoices.filter((i) => i.vendor === supplier).map((i) => i.vcode))];
}

const PAN_MASTER = {};
export function panFor(supplier) {
  if (!PAN_MASTER[supplier]) PAN_MASTER[supplier] = synthPAN(supplier);
  return PAN_MASTER[supplier];
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

export function currentStageName(inv) {
  const stages = CHANNEL_STAGES[inv.channel];
  const done = stageProgress(inv.channel, inv.status);
  if (inv.status === 'Rejected' || inv.status === 'Deleted') return 'Failed at: ' + stages[Math.max(0, done - 1)];
  if (done >= stages.length) return stages[stages.length - 1];
  return stages[done - 1];
}


export function combinedStatusFor(inv) {
  if (inv.status === 'Paid') return { label: 'Fully Paid', tone: 'green', reason: 'Settled in full. UTR and payment date are shown below.' };
  if (inv.status === 'Rejected' || inv.status === 'Deleted') return { label: inv.status, tone: 'red', reason: 'Blocked. See the current stage above for why.' };
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
  (tickets || []).filter((t) => t.no === inv.no).forEach((t) => {
    events.push({ date: t.raisedDate, event: 'Query Raised', stage: `Category: ${t.category}`, status: t.status, person: t.raisedBy, role: t.raisedBy === 'Supplier' ? 'Supplier' : 'Internal', email: '', remarks: t.desc });
    if (t.resolvedDate) {
      events.push({ date: t.resolvedDate, event: 'Query Resolved', stage: `Category: ${t.category}`, status: 'Resolved', person: '-', role: '-', email: '', remarks: '' });
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
export function channelViewRows(channelKey, view, invoices) {
  const milestone = (VIEW_MILESTONE[channelKey] || {})[view];
  return invoices.map((inv) => {
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
  const blob = new Blob([csv], { type: 'text/csv' });
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
