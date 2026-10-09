/* In-memory stand-in for src/api/client used by the component test suite.
 * It mimics just enough of the server for the login → hydrate → mutate flows. */
import { vi } from 'vitest';
import { INVOICE_DATA, SYNC_LOG } from './fixtures/invoices';
import { INITIAL_TICKETS } from './fixtures/tickets';
import { ROLE_MATRIX } from '../data/constants';

const TABLE_SEED = {
  'settings-users': [
    ['Ravi Kulkarni', 'r.kulkarni@company.com', 'MDE Invoice Lead', 'Procurement', 'Admin', 'Active'],
    ['Priya Deshmukh', 'p.deshmukh@company.com', 'Invoice Processor', 'Procurement', 'MDE Invoice Team', 'Active'],
    ['Ajay Menon', 'a.menon@company.com', 'Category Approver', 'Sourcing', 'Approver', 'Active'],
    ['Neha Kulkarni', 'n.kulkarni@company.com', 'Accounts Executive', 'Finance', 'Accounts', 'Active'],
  ],
  'settings-notifications': [
    ['Invoice Uploaded', 'Internal, MDE Invoice Team', '-', 'On'],
    ['Approval Pending > 3 days', 'Internal, Approver', 'MDE Invoice Team', 'On'],
    ['Payment Due Today', 'Internal, Accounts', 'COE', 'On'],
    ['Payment Completed', 'Supplier', 'MDE Invoice Team', 'On'],
  ],
  'settings-audit': [
    ['2026-08-06 07:10', 'r.kulkarni@company.com', 'Login', 'SSO sign-in'],
    ['2026-08-05 18:02', 'MDE Invoice Team', 'Vendor Master Edit', 'Added vendor code TCLB15'],
  ],
};

const DEFAULT_USER = {
  name: 'Ravi Kulkarni', initials: 'RK', title: 'MDE Invoice Lead',
  dept: 'Procurement', email: 'r.kulkarni@company.com',
};

// Same rule as the server: signing in with the username shows the username,
// signing in with the e-mail shows the account holder's name.
const ACCOUNTS = {
  admin: { ...DEFAULT_USER, name: 'Administrator', initials: 'AD', title: 'System Administrator', dept: 'IT', email: 'admin@company.com' },
  ravi: DEFAULT_USER,
};
function internalUser(loginId) {
  const key = Object.keys(ACCOUNTS).find((k) => k === loginId || ACCOUNTS[k].email === loginId) || 'admin';
  const acct = ACCOUNTS[key];
  const byEmail = loginId === acct.email;
  const name = byEmail ? acct.name : loginId;
  return {
    ...acct,
    username: key,
    fullName: acct.name,
    name,
    initials: byEmail ? acct.initials : name.slice(0, 2).toUpperCase(),
  };
}

function authFor(form) {
  if (form.mode === 'supplier') {
    return {
      authType: 'supplier', channelScope: 'all', role: 'Viewer',
      supplierQuery: form.company, supplierPAN: 'ABCDE1234F',
      supplierLoginVcode: form.vcode || 'DIT00388AC', currentUser: DEFAULT_USER,
    };
  }
  const channelScope = form.channelScope || 'all';
  return {
    authType: 'internal', id: 1, channelScope, ticketRole: channelScope === 'all' ? 'ADMIN' : (form.ticketRole || 'ASSIGNEE'),
    role: channelScope === 'all' ? 'Admin' : 'Invoice Team',
    supplierQuery: null, supplierPAN: null, supplierLoginVcode: null,
    currentUser: internalUser(String(form.username || '').trim().toLowerCase()),
  };
}

export function installApiMock() {
  let seq = 1005;
  let persistedTickets = JSON.parse(JSON.stringify(INITIAL_TICKETS));
  // The bell and the Notifications page both read these; tests can change them via the returned `notifications` handle.
  const notifications = [];
  let persistedUsers = [
    { id: 1, username: 'admin', name: 'Administrator', email: 'admin@company.com', role: 'Admin', status: 'Active', channelScope: 'all', ticketRole: 'ADMIN', channels: [] },
    { id: 2, username: 'priya', name: 'Priya Deshmukh', email: 'p.deshmukh@company.com', role: 'Invoice Team', status: 'Active', channelScope: 'msetuSrm', ticketRole: 'ASSIGNEE', channels: ['msetuSrm'] },
  ];
  const statusCode = (value) => String(value || 'OPEN').toUpperCase().replaceAll(' ', '_');
  const normalizeTicket = (ticket) => {
    const invoiceNo = ticket.invoice_no || ticket.no;
    const invoice = INVOICE_DATA.find((item) => item.no === invoiceNo);
    const status = statusCode(ticket.status);
    const actions = status === 'CLOSED' ? [] : status === 'RESOLVED'
      ? ['close', 'reopen']
      : ['reply', 'note', 'attach_public', 'attach_internal', 'change_priority', ...(status === 'OPEN' ? ['assign'] : ['reassign', 'resolve'])];
    return {
      id: ticket.id,
      ticket_no: ticket.ticket_no || ticket.id,
      invoice_no: invoiceNo,
      invoice: invoice ? { invoice_no: invoice.no, po_no: invoice.po, amount: invoice.amount, status: invoice.status } : null,
      channel: invoice?.channel || 'msetuSrm',
      fy: '2026-27',
      vendor_code: invoice?.vcode || 'DIT00388AC',
      category: ticket.category,
      priority: ticket.priority === 'Urgent' ? 'HIGH' : String(ticket.priority || 'Medium').toUpperCase(),
      subject: ticket.subject || ticket.category,
      description: ticket.description || ticket.desc || 'No description provided.',
      status,
      awaiting: ticket.awaiting || 'STAFF',
      source: ticket.source || 'SUPPLIER',
      assignee: ticket.assignee && ticket.assignee !== 'Unassigned' ? { id: 1, name: typeof ticket.assignee === 'string' ? ticket.assignee : ticket.assignee.name } : null,
      sla: { response_due_at: '2026-09-10T12:00:00', reply_expected_by: null, breached: false, overdue_minutes: 0 },
      unread: false,
      reopen_count: 0,
      row_version: ticket.row_version || 1,
      legacy_unlinked: false,
      allowed_actions: actions,
      comments: (ticket.comments || []).map((comment, index) => ({
        id: comment.id || index + 1,
        ticket_id: ticket.id,
        author: comment.author || 'Supplier',
        author_id: null,
        author_role: String(comment.role || 'SUPPLIER').toUpperCase().replaceAll(' ', '_'),
        visibility: comment.visibility || 'PUBLIC',
        body: comment.body || comment.text,
        created_at: comment.created_at || '2026-09-09T10:00:00',
      })),
      attachments: ticket.attachments || [],
      created_at: ticket.created_at || '2026-09-09T09:00:00',
      updated_at: ticket.updated_at || '2026-09-09T10:00:00',
      resolved_at: status === 'RESOLVED' ? '2026-09-09T11:00:00' : null,
      closed_at: status === 'CLOSED' ? '2026-09-09T12:00:00' : null,
    };
  };
  const bootstrap = () => ({
    invoices: INVOICE_DATA.map((r) => ({ ...r, stageIndex: 1 })),
    syncLog: SYNC_LOG,
    tickets: persistedTickets,
    ticketSeq: 1005,
    tables: JSON.parse(JSON.stringify(TABLE_SEED)),
    settings: {
      roleMatrix: JSON.parse(JSON.stringify(ROLE_MATRIX)),
      twoFactorOn: false,
      senderEmail: 'i2ptracker@company.com',
      integrations: [
        ['Msetu / SRM', 'Connected', '06 Aug 2026, 07:00 AM'],
        ['PO Portal', 'Connected', '06 Aug 2026, 07:02 AM'],
        ['SAP (MIRO / ML81N / FBL1N)', 'Connected', '06 Aug 2026, 07:05 AM'],
        ['MFOX Portal', 'Connection Error', '06 Aug 2026, 07:08 AM'],
      ],
    },
  });

  const get = vi.fn(async (path) => {
    if (path === '/v1/workspace') return bootstrap();
    if (path === '/v1/auth/me') throw Object.assign(new Error('no session'), { status: 401 });
    if (path === '/v1/users/') return persistedUsers;
    if (path.startsWith('/tables/')) return TABLE_SEED[path.slice('/tables/'.length)] || [];
    if (path === '/v1/tickets/activity-log') return [];
    if (path === '/v1/ticket-permissions') return { roles: ['Admin', 'Channel Lead', 'Assignee', 'Supplier'], rows: [{ action: 'View ticket', cells: [{ text: 'Always', ifAssigned: '' }, { text: 'Always', ifAssigned: '' }, { text: '', ifAssigned: 'Always' }, { text: 'Always', ifAssigned: '' }] }] };
    if (path === '/settings') return bootstrap().settings;
    if (path === '/v1/notifications/unread-count') return { unread: notifications.filter((n) => !n.read_at).length };
    if (path.startsWith('/v1/notifications')) {
      const limit = Number(new URLSearchParams(path.split('?')[1] || '').get('limit')) || 100;
      return notifications.slice(0, limit).map((n) => ({ ...n }));
    }
    if (path.startsWith('/v1/tickets/summary')) {
      const rows = persistedTickets.map(normalizeTicket);
      return {
        open: rows.filter((item) => item.status === 'OPEN').length,
        in_progress: rows.filter((item) => item.status === 'IN_PROGRESS').length,
        sla_breached: rows.filter((item) => item.sla.breached).length,
        resolved_closed: rows.filter((item) => ['RESOLVED', 'CLOSED'].includes(item.status)).length,
      };
    }
    if (path.startsWith('/v1/tickets/board')) {
      const groups = { open: [], in_progress: [], resolved: [], closed: [] };
      persistedTickets.map(normalizeTicket).forEach((item) => groups[item.status.toLowerCase()].push(item));
      return groups;
    }
    if (path.startsWith('/v1/tickets/assignable-users')) return [{ id: 1, name: 'Priya Deshmukh', role: 'ASSIGNEE' }];
    if (path.endsWith('/activity')) {
      const id = path.split('/')[3];
      const ticket = persistedTickets.find((item) => item.id === id);
      return (ticket?.activity || []).map((item, index) => ({ id: index + 1, event: 'UPDATED', actor_id: 1, meta: {}, created_at: item.created_at || '2026-09-09T10:00:00' }));
    }
    if (path.startsWith('/v1/tickets/')) {
      const id = path.split('?')[0].split('/').pop();
      const t = persistedTickets.find(x => x.id === id);
      if (!t) throw Object.assign(new Error('Not found'), { status: 404 });
      return normalizeTicket(t);
    }
    if (path.startsWith('/v1/tickets')) {
      const items = persistedTickets.map(normalizeTicket);
      return { items, page: 1, page_size: 100, total: items.length };
    }
    return {};
  });

  const CREDS = { admin: 'admin123', 'admin@company.com': 'admin123', ravi: 'ravi123', 'r.kulkarni@company.com': 'ravi123', priya: 'priya123' };

  const post = vi.fn(async (path, body) => {
    if (path === '/v1/auth/login' || path === '/v1/auth/supplier/login') {
      const form = body || {};
      if (form.mode !== 'supplier') {
        const u = String(form.username || '').toLowerCase();
        if (CREDS[u] !== form.password) {
          throw Object.assign(new Error('Invalid EAML ID or password.'), { status: 401 });
        }
      }
      return { token: 'test-token', auth: authFor(form) };
    }
    if (path === '/v1/auth/logout') return { ok: true };
    if (path === '/v1/notifications/read-all') {
      notifications.forEach((n) => { n.read_at = n.read_at || new Date().toISOString(); });
      return { read: true };
    }
    {
      const one = path.match(/^\/v1\/notifications\/(\d+)\/read$/);
      if (one) {
        const item = notifications.find((n) => n.id === Number(one[1]));
        if (item) item.read_at = item.read_at || new Date().toISOString();
        return { read: true };
      }
      const byTicket = path.match(/^\/v1\/notifications\/ticket\/([^/]+)\/read$/);
      if (byTicket) {
        const rows = notifications.filter((n) => n.ticket_id === byTicket[1] && !n.read_at);
        rows.forEach((n) => { n.read_at = new Date().toISOString(); });
        return { read: rows.length };
      }
    }
    if (path === '/v1/users/') {
      const created = {
        id: Math.max(...persistedUsers.map((item) => item.id), 0) + 1,
        status: 'Invited',
        ticketRole: body.role === 'Admin' ? 'ADMIN' : (body.ticketRole || 'NO_ACCESS'),
        username: body.username || String(body.email).split('@')[0],
        channels: body.channels || [],
        ...body,
      };
      persistedUsers = [...persistedUsers, created];
      return created;
    }
    if (/^\/v1\/users\/\d+\/reset-password$/.test(path)) return { msg: 'Reset link sent.' };
    if (path === '/v1/tickets') {
      seq += 1;
      const id = 'TCK-' + seq;
      const newTicket = {
        id, no: body.invoice_no, category: body.category, subject: body.subject, description: body.description || 'No description provided.',
        status: 'OPEN', priority: body.priority || 'MEDIUM', assignee_id: '1', assignee: null,
        raisedBy: body.raised_by || 'Supplier', raisedDate: '09 Sep 2026', slaHours: 24,
        comments: [], activities: [{ createdAt: '09 Sep 2026', event: `Ticket created`, metaData: '' }],
        row_version: 1
      };
      // add to in-memory store so the next refetch includes it
      persistedTickets.unshift(newTicket);
      return normalizeTicket(newTicket);
    }
    if (path.includes('/comments')) {
      const ticketId = path.split('/')[3];
      const t = persistedTickets.find(x => x.id === ticketId);
      if (t) {
        t.comments.push({ id: 1000 + t.comments.length, text: body.body, visibility: body.visibility, author: 'You', role: body.visibility === 'INTERNAL' ? 'CHANNEL_LEAD' : 'ASSIGNEE' });
        t.row_version += 1;
      }
      return normalizeTicket(t);
    }
    if (path.endsWith('/read')) return { read: true };
    if (path.endsWith('/assign') || path.endsWith('/resolve') || path.endsWith('/close') || path.endsWith('/reopen')) {
      const ticketId = path.split('/')[3];
      const t = persistedTickets.find((item) => item.id === ticketId);
      if (path.endsWith('/assign')) { t.status = 'In Progress'; t.assignee = 'Priya Deshmukh'; }
      if (path.endsWith('/resolve')) t.status = 'Resolved';
      if (path.endsWith('/close')) t.status = 'Closed';
      if (path.endsWith('/reopen')) t.status = 'In Progress';
      t.row_version += 1;
      return normalizeTicket(t);
    }
    throw new Error(`Unmocked POST path: ${path}`);
  });

  const patch = vi.fn(async (path, body) => {
    if (/^\/v1\/users\/\d+$/.test(path)) {
      const id = Number(path.split('/').pop());
      let updated;
      persistedUsers = persistedUsers.map((item) => {
        if (item.id !== id) return item;
        updated = { ...item, ...body };
        return updated;
      });
      return updated;
    }
    if (path.startsWith('/v1/tickets/')) {
      const id = path.split('/')[3];
      const t = persistedTickets.find(x => x.id === id);
      if (t) {
        if (body.priority) t.priority = body.priority;
        if (body.category) t.category = body.category;
        t.row_version += 1;
      }
      return normalizeTicket(t);
    }
    return {};
  });
  const put = vi.fn(async (_path, body) => (body && body.rows ? body.rows : {}));
  const remove = vi.fn(async (path) => {
    const id = Number(path.split('/').pop());
    persistedUsers = persistedUsers.filter((item) => item.id !== id);
    return { msg: 'User removed.' };
  });

  return {
    get, post, patch, put, delete: remove,
    notifications,
    setToken: vi.fn(),
    clearToken: vi.fn(),
    hasToken: vi.fn(() => false),
  };
}
