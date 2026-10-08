/* In-memory stand-in for src/api/client used by the component test suite.
 * It mimics just enough of the server for the login → hydrate → mutate flows. */
import { vi } from 'vitest';
import { INVOICE_DATA, SYNC_LOG } from '../data/invoices';
import { INITIAL_TICKETS } from '../data/tickets';
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
  const channelScope = form.channelScope === 'internalTeam' ? 'internalTeam' : 'all';
  return {
    authType: 'internal', channelScope,
    role: channelScope === 'all' ? 'Admin' : 'MDE Invoice Team',
    supplierQuery: null, supplierPAN: null, supplierLoginVcode: null,
    currentUser: internalUser(String(form.username || '').trim().toLowerCase()),
  };
}

export function installApiMock() {
  let seq = 1005;
  const bootstrap = () => ({
    invoices: INVOICE_DATA.map((r) => ({ ...r, stageIndex: 1 })),
    syncLog: SYNC_LOG,
    tickets: JSON.parse(JSON.stringify(INITIAL_TICKETS)),
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
    if (path === '/workspace') return bootstrap();
    if (path === '/auth/me') throw Object.assign(new Error('no session'), { status: 401 });
    if (path.startsWith('/tables/')) return TABLE_SEED[path.slice('/tables/'.length)] || [];
    if (path === '/settings') return bootstrap().settings;
    return {};
  });

  const CREDS = { admin: 'admin123', 'admin@company.com': 'admin123', ravi: 'ravi123', 'r.kulkarni@company.com': 'ravi123', priya: 'priya123' };

  const post = vi.fn(async (path, body) => {
    if (path === '/auth/login') {
      const form = body || {};
      if (form.mode !== 'supplier') {
        const u = String(form.username || '').toLowerCase();
        if (CREDS[u] !== form.password) {
          throw Object.assign(new Error('Invalid username or password.'), { status: 401 });
        }
      }
      return { token: 'test-token', auth: authFor(form) };
    }
    if (path === '/auth/logout') return { ok: true };
    if (path === '/tickets') {
      seq += 1;
      const id = 'TCK-' + seq;
      return {
        ticket: {
          id, no: body.no, category: body.category, desc: body.desc || 'No description provided.',
          status: 'Open', priority: body.priority || 'Medium', assignee: 'MDE Invoice Team',
          raisedBy: body.raisedBy, raisedDate: '09 Sep 2026', slaHours: 24,
          comments: [], activity: [{ date: '09 Sep 2026', text: `Ticket created by ${body.raisedBy}.` }],
        },
        seq,
      };
    }
    // comment posts: let the optimistic reducer keep the local update
    return {};
  });

  const patch = vi.fn(async () => ({}));
  const put = vi.fn(async (_path, body) => (body && body.rows ? body.rows : {}));

  return {
    get, post, patch, put,
    setToken: vi.fn(),
    clearToken: vi.fn(),
    hasToken: vi.fn(() => false),
  };
}
