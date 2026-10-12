export const STATUS_LABEL = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const STATUS_TONE = {
  OPEN: 'red',
  IN_PROGRESS: 'amber',
  RESOLVED: 'green',
  CLOSED: 'gray',
};

export const PRIORITY_TONE = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'amber',
};

export function formatDate(value, includeTime = false) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function channelLabel(channel) {
  return channel === 'msetuSrm' ? 'Msetu / SRM' : channel || 'Legacy';
}

export function ticketPath(ticket, supplier) {
  return supplier ? `/supplier/tickets/${ticket.id}` : `/app/inquiry-desk/${ticket.id}`;
}

/** Where "Back" on a query goes, and what to call it. A query opened from another page (a
 *  notification, say) returns there; otherwise it returns to the queries list. Only in-app paths are
 *  honoured, so a crafted link can't send people elsewhere. */
export function backTarget(from, supplier) {
  const fallback = supplier ? '/supplier/tickets' : '/app/inquiry-desk';
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return { path: fallback, label: 'Back to queries' };
  if (from.startsWith('/app/notifications') || from.startsWith('/supplier/notifications')) return { path: from, label: 'Back to notifications' };
  if (from.startsWith(fallback)) return { path: from, label: 'Back to queries' };
  return { path: from, label: 'Back' };
}

export function messageSide(authorRole, viewerIsSupplier) {
  const fromSupplier = authorRole === 'SUPPLIER';
  return viewerIsSupplier === fromSupplier ? 'own' : 'other';
}
