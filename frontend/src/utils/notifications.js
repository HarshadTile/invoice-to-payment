export const NOTIFICATION_LABEL = {
  TICKET_CREATED: 'New query received',
  TICKET_ASSIGNED: 'Query assigned',
  SUPPLIER_REPLIED: 'Supplier replied',
  STAFF_REPLIED: 'Internal team replied',
  TICKET_RESOLVED: 'Query resolved',
  TICKET_REOPENED: 'Query reopened',
  TICKET_CLOSED: 'Query closed',
  TICKET_AUTO_CLOSED: 'Query automatically closed',
  SLA_BREACHED: 'Response SLA breached',
  SUPPLIER_ACCESS_REQUEST: 'Supplier account request',
  SUPPLIER_ACCESS_CHANGE: 'Vendor code change request',
  SUPPLIER_ACCOUNT_CREATED: 'Welcome to the supplier portal',
  SUPPLIER_CODES_APPROVED: 'Vendor code request approved',
  SUPPLIER_CODES_REJECTED: 'Vendor code request rejected',
};

// One plain-language line per event, shown under the title.
export const NOTIFICATION_DETAIL = {
  TICKET_CREATED: 'A supplier raised a new query.',
  TICKET_ASSIGNED: 'This query has been assigned.',
  SUPPLIER_REPLIED: 'The supplier added a reply.',
  STAFF_REPLIED: 'The team added a reply.',
  TICKET_RESOLVED: 'The query was marked resolved.',
  TICKET_REOPENED: 'The supplier reopened this query.',
  TICKET_CLOSED: 'The query was closed.',
  TICKET_AUTO_CLOSED: 'Closed automatically after being resolved.',
  SLA_BREACHED: 'No reply was sent within the target time.',
  SUPPLIER_ACCESS_REQUEST: 'A supplier asked for a portal account. Review it in Supplier Management.',
  SUPPLIER_ACCESS_CHANGE: 'An existing supplier asked to change their vendor codes.',
  SUPPLIER_ACCOUNT_CREATED: 'Your supplier account has been created.',
  SUPPLIER_CODES_APPROVED: 'The team approved your vendor code request.',
  SUPPLIER_CODES_REJECTED: 'The team could not approve your vendor code request.',
};

// Colour per event, using the app's chip tones (blue, amber, green, red, gray).
export const NOTIFICATION_TONE = {
  TICKET_CREATED: 'blue',
  TICKET_ASSIGNED: 'blue',
  SUPPLIER_REPLIED: 'amber',
  STAFF_REPLIED: 'blue',
  TICKET_RESOLVED: 'green',
  TICKET_REOPENED: 'amber',
  TICKET_CLOSED: 'gray',
  TICKET_AUTO_CLOSED: 'gray',
  SLA_BREACHED: 'red',
  SUPPLIER_ACCESS_REQUEST: 'red',
  SUPPLIER_ACCESS_CHANGE: 'amber',
  SUPPLIER_ACCOUNT_CREATED: 'blue',
  SUPPLIER_CODES_APPROVED: 'green',
  SUPPLIER_CODES_REJECTED: 'red',
};

const SUPPLIER_ACCOUNT_REF = {
  SUPPLIER_ACCOUNT_CREATED: 'Your account',
  SUPPLIER_CODES_APPROVED: 'Vendor codes',
  SUPPLIER_CODES_REJECTED: 'Vendor codes',
};
const MAX_CODES_SHOWN = 3;

function codeList(codes) {
  const hidden = codes.length - MAX_CODES_SHOWN;
  return `${codes.slice(0, MAX_CODES_SHOWN).join(', ')}${hidden > 0 ? ` +${hidden} more` : ''}`;
}

function supplierAccountSubject({ type, payload }) {
  const { vendor_codes: codes = [], added = [], removed = [], reason, note } = payload || {};
  if (type === 'SUPPLIER_ACCOUNT_CREATED') return codes.length ? `Vendor codes: ${codeList(codes)}` : '';
  if (type === 'SUPPLIER_CODES_REJECTED') return [reason && `Reason: ${reason}`, note].filter(Boolean).join(' · ');
  const changes = [added.length > 0 && `Added ${codeList(added)}`, removed.length > 0 && `Removed ${codeList(removed)}`].filter(Boolean);
  return [...(changes.length ? changes : ['No change to your vendor codes']), note].filter(Boolean).join(' · ');
}

export function notificationLabel(item) {
  return NOTIFICATION_LABEL[item.type] || item.type.toLowerCase().replaceAll('_', ' ');
}

export function notificationDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function notificationTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

/** "Today" / "Yesterday" / "07 Oct 2026". */
export function dayLabel(value, now = new Date()) {
  const day = new Date(value);
  const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start(now) - start(day)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(day);
}

/** The short reference shown on a notification: the query number, or who sent an access request. */
export function notificationRef(item) {
  if (item.ticket_no) return item.ticket_no;
  if (item.request_id) return item.payload?.name || 'Supplier';
  return SUPPLIER_ACCOUNT_REF[item.type] || 'Query';
}

/** The second line: the query subject, or the requester's email and PAN. */
export function notificationSubject(item) {
  if (item.subject) return item.subject;
  if (item.request_id) return [item.payload?.email, item.payload?.pan && `PAN ${item.payload.pan}`].filter(Boolean).join(' · ');
  if (SUPPLIER_ACCOUNT_REF[item.type]) return supplierAccountSubject(item);
  return '';
}
