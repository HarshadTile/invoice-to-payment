import { CHANNELS } from '../data/constants';

const SETTINGS_LABEL = {
  integrations: 'Integration Settings', auditLogs: 'Audit Logs',
  users: 'User Management', suppliers: 'Supplier Management', roles: 'Roles & Permissions',
};

/**
 * The title of the page at `pathname` — the header's <h1> and the breadcrumb's labels both use
 * it. A channel-locked login sees only its own channel's invoices, and the title says so.
 */
export function pageTitle(pathname, lockedChannelLabel = '') {
  const segment = (index) => decodeURIComponent(pathname.split('/')[index] || '');
  if (pathname.startsWith('/app/invoices')) return lockedChannelLabel ? `${lockedChannelLabel} Invoice Tracking` : 'Invoice Tracking';
  if (pathname.startsWith('/app/search')) return 'Search Invoice(s)';
  if (pathname.startsWith('/app/channel/')) { const c = CHANNELS.find((x) => x.key === segment(3)); return `Processing Channels / ${c ? c.label : ''}`; }
  if (pathname.startsWith('/app/vendor-code/') || pathname.startsWith('/supplier/vendor-code/')) return `Supplier Visibility / ${segment(3)}`;
  if (pathname.startsWith('/app/supplier-visibility')) return 'Supplier Visibility';
  if (pathname.startsWith('/app/logs')) return 'Logs / History';
  if (pathname.startsWith('/app/inquiry-desk')) return 'Inquiry Desk';
  if (pathname.startsWith('/supplier/dashboard')) return 'Dashboard';
  if (pathname.startsWith('/supplier/home')) return 'My Invoices';
  if (pathname.startsWith('/supplier/tickets')) return 'My Queries';
  if (pathname.startsWith('/supplier/logs')) return 'Logs';
  if (pathname.startsWith('/app/outputs')) return 'Vendor Status Reports';
  if (pathname.startsWith('/app/settings/')) return `Settings / ${SETTINGS_LABEL[pathname.split('/').pop()] || ''}`;
  if (pathname === '/app/notifications' || pathname === '/supplier/notifications') return 'Notifications';
  if (pathname.startsWith('/app/profile') || pathname.startsWith('/supplier/profile')) return 'Profile';
  return '';
}

const SECTION_PREFIX = /^(Processing Channels|Settings|Supplier Visibility) \/ /;

/** The short name of a page, for a breadcrumb: "Processing Channels / Msetu / SRM" → "Msetu / SRM". */
export function shortPageTitle(pathname, lockedChannelLabel = '') {
  return pageTitle(pathname, lockedChannelLabel).replace(SECTION_PREFIX, '');
}

/** Where a page's breadcrumb leads when there is no earlier page in this tab. */
export function defaultParentPath(pathname, authType) {
  if (authType === 'supplier') {
    if (/^\/supplier\/tickets\/[^/]+/.test(pathname)) return '/supplier/tickets';
    return pathname.startsWith('/supplier/dashboard') ? null : '/supplier/dashboard';
  }
  if (/^\/app\/inquiry-desk\/[^/]+/.test(pathname)) return '/app/inquiry-desk';
  if (pathname.startsWith('/app/vendor-code/')) return '/app/supplier-visibility';
  return pathname.startsWith('/app/invoices') ? null : '/app/invoices';
}

/** A one-line description of the page, shown at the right of its breadcrumb row. */
export function pageHint(pathname) {
  if (/^\/(app\/inquiry-desk|supplier\/tickets)\/[^/]+/.test(pathname)) return 'Conversation, activity and SLA for this query';
  const hints = [
    ['/app/invoices', 'Overview of invoices across channels'],
    ['/app/search', 'Search and filter every invoice'],
    ['/app/channel/', 'Invoice register and history for this channel'],
    ['/app/vendor-code/', 'Invoices and queries for this vendor code'],
    ['/app/supplier-visibility', 'Invoices and queries by supplier, PAN or vendor code'],
    ['/app/inquiry-desk', 'Supplier queries, owners and SLA'],
    ['/app/notifications', 'Updates on invoices and queries'],
    ['/app/logs', 'Activity history across invoices and queries'],
    ['/app/outputs', 'Vendor status reports and exports'],
    ['/app/settings/', 'Administration'],
    ['/app/profile', 'Your account details'],
    ['/supplier/dashboard', 'Your invoices, payments and queries at a glance'],
    ['/supplier/home', 'Your invoices and their status'],
    ['/supplier/tickets', 'Your queries and replies'],
    ['/supplier/logs', 'Activity on your invoices and queries'],
    ['/supplier/notifications', 'Updates on your invoices and queries'],
    ['/supplier/profile', 'Your account details'],
  ];
  return hints.find(([prefix]) => pathname.startsWith(prefix))?.[1] || '';
}
