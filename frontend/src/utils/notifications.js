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
};

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
