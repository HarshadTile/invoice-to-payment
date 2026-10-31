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

export function messageSide(authorRole, viewerIsSupplier) {
  const fromSupplier = authorRole === 'SUPPLIER';
  return viewerIsSupplier === fromSupplier ? 'own' : 'other';
}
