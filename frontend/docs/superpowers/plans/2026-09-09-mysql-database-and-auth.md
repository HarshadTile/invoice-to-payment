# MySQL Database + Real Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's static seed data with a real local MySQL database and a genuine login → logout flow, so every in-app change persists across restarts.

**Architecture:** A new `server/` Express API talks to MySQL (`mahindra_i2p` on `localhost:3306`) via `mysql2/promise`. The React client keeps its Redux store but, after login, hydrates it once from `GET /api/bootstrap`; every mutating action becomes a thunk that writes through to the API. Static `src/data/*` files become seed input only. One indirection module (`src/data/runtime.js`) replaces ~25 synchronous `INVOICE_DATA` imports.

**Tech Stack:** Node 22, Express 4, mysql2, dotenv, bcryptjs, cors; React 19 + Redux Toolkit 2; Vite 8; Vitest 5 + React Testing Library.

## Global Constraints

- MySQL target: `localhost:3306`, database `mahindra_i2p`, driver `mysql2/promise` with a connection pool. Never touch the existing `duroshox` / `duroshox_db` schemas.
- Credentials come only from `server/.env` (git-ignored). Committed `server/.env.example` carries placeholders. Never hardcode a password.
- Demo internal credential: username `admin`, password `admin123` (bcrypt-hashed in `users`).
- Fixed "now" for date logic stays `APP_NOW = '2026-09-09'` from `src/data/constants.js`.
- No change to visual design, routes, role matrix semantics, or business rules in `src/utils/businessLogic.js`.
- All API JSON responses are camelCase and match the exact shapes the Redux slices already use.
- Token transport: `Authorization: Bearer <token>`; client stores it at `localStorage['i2p_token']`.
- The 27 existing tests in `src/__tests__/app.test.jsx` must still pass, offline, with no running server.
- Frequent commits: one per task, Conventional Commits style, ending with the Co-Authored-By trailer.

---

## File Structure

**New — server:**
- `server/.env` / `server/.env.example` — DB connection + `PORT`
- `server/db.js` — mysql2 pool, `query()` helper, `withConn()` for transactions
- `server/schema.sql` — `CREATE DATABASE` + all `CREATE TABLE IF NOT EXISTS`
- `server/applySchema.js` — reads `schema.sql`, splits on `;`, executes each statement
- `server/seed.js` — apply schema, then TRUNCATE + insert from `src/data/*`
- `server/auth.js` — `hashPassword`, `verifyPassword`, `createSession`, `getSession`, `deleteSession`, `requireAuth` middleware
- `server/serializers.js` — row → API shape mappers (invoice, ticket, table rows, settings)
- `server/routes/auth.js` — `POST /api/login`, `POST /api/logout`, `GET /api/me`
- `server/routes/bootstrap.js` — `GET /api/bootstrap`
- `server/routes/invoices.js` — `GET /api/invoices`, `PATCH /api/invoices/:no`
- `server/routes/tickets.js` — `GET /api/tickets`, `POST /api/tickets`, `POST /api/tickets/:id/comments`, `PATCH /api/tickets/:id`
- `server/routes/tables.js` — `GET /api/tables/:key`, `PUT /api/tables/:key`
- `server/routes/settings.js` — `GET /api/settings`, `PUT /api/settings`
- `server/index.js` — express app, cors, json, route mounting, error handler, `listen`
- `server/__tests__/auth.test.js`, `server/__tests__/persistence.test.js`

**New — client:**
- `src/data/runtime.js` — mutable `{ invoices, syncLog }` + `setRuntimeData`
- `src/api/client.js` — fetch wrapper (`get/post/patch/put`) + token handling
- `src/features/bootstrap/Bootstrapper.jsx` — runs `/api/me` + `/api/bootstrap`, gates the authed tree
- `src/features/bootstrap/hydrateThunks.js` — `restoreSession()`, `loadBootstrap()`

**Modified — client:**
- `package.json` — deps + scripts
- `vite.config.js` — `/api` proxy
- `.gitignore` — `server/.env`
- `src/data/invoices.js`, `src/data/tickets.js` — unchanged content, but re-exported for seed/tests only
- `src/utils/businessLogic.js` — `INVOICE_DATA` → `runtime.invoices`
- `src/features/invoices/selectors.js` — same swap
- `src/features/tickets/ticketsSlice.js` — `INITIAL_TICKETS` seed → empty + `hydrate`; `INVOICE_DATA` → `runtime.invoices`; actions → `*Local` + write-through thunks
- `src/features/tables/tablesSlice.js` — `hydrate`; thunks for row mutations
- `src/features/settings/settingsSlice.js` — `hydrate`; thunks for toggles
- `src/features/auth/authSlice.js` — login/logout become thunks hitting the API
- `src/pages/LoginPage.jsx` — dispatch async login thunks, await result, handle error
- `src/components/layout/Topbar.jsx` — logout button awaits logout thunk
- `src/App.jsx` / `src/routes/AppRoutes.jsx` — wrap authed routes in `<Bootstrapper>`
- `src/pages/*` and `src/components/modals/*` that import `INVOICE_DATA` / `SYNC_LOG` / `SUPPLIERS` → `runtime`
- `src/__tests__/app.test.jsx` + new `src/test/hydrateStore.js` helper

---

## Task 1: Server scaffolding + DB connection

**Files:**
- Modify: `package.json` (deps, scripts)
- Modify: `vite.config.js`
- Modify: `.gitignore`
- Create: `server/.env`, `server/.env.example`
- Create: `server/db.js`
- Test: `server/__tests__/db.test.js`

**Interfaces:**
- Produces: `pool` (mysql2 pool), `query(sql, params) -> Promise<rows>`, `withConn(fn)` (runs `fn(conn)` inside a transaction, commits or rolls back).

- [ ] **Step 1: Add dependencies**

```bash
npm install express@^4.21.2 mysql2@^3.11.5 dotenv@^16.4.7 bcryptjs@^2.4.3 cors@^2.8.5
npm install -D concurrently@^9.1.0
```

- [ ] **Step 2: Add scripts to `package.json`**

```json
"scripts": {
  "dev": "vite",
  "server": "node server/index.js",
  "seed": "node server/seed.js",
  "dev:all": "concurrently -n api,web -c blue,green \"npm run server\" \"npm run dev\"",
  "build": "vite build",
  "lint": "oxlint",
  "preview": "vite preview",
  "test": "vitest run",
  "test:server": "vitest run server"
}
```

- [ ] **Step 3: Vite proxy** — in `vite.config.js` add to the `defineConfig` object:

```js
server: { proxy: { '/api': 'http://localhost:3001' } },
```

- [ ] **Step 4: `.gitignore`** — append:

```
server/.env
```

- [ ] **Step 5: `server/.env.example`**

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=changeme
DB_NAME=mahindra_i2p
PORT=3001
```

- [ ] **Step 6: `server/.env`** — same keys, with the real local password (`MyNewPassword@123`). This file is git-ignored; do not commit it.

- [ ] **Step 7: `server/db.js`**

```js
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const env = process.env;
export const DB_NAME = env.DB_NAME || 'mahindra_i2p';

// Pool WITHOUT database selected — used by schema creation.
export const rootPool = mysql.createPool({
  host: env.DB_HOST, port: Number(env.DB_PORT) || 3306,
  user: env.DB_USER, password: env.DB_PASSWORD,
  waitForConnections: true, connectionLimit: 5, multipleStatements: true,
});

// Pool WITH database selected — used by the app.
export const pool = mysql.createPool({
  host: env.DB_HOST, port: Number(env.DB_PORT) || 3306,
  user: env.DB_USER, password: env.DB_PASSWORD, database: DB_NAME,
  waitForConnections: true, connectionLimit: 10,
});

export async function query(sql, params) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

export async function withConn(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
```

- [ ] **Step 8: Write `server/__tests__/db.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { rootPool } from '../db.js';

describe('db connection', () => {
  it('connects to local MySQL', async () => {
    const [rows] = await rootPool.query('SELECT 1 AS ok');
    expect(rows[0].ok).toBe(1);
  });
});
```

- [ ] **Step 9: Run** `npm run test:server` → expect PASS (requires local MySQL running).

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vite.config.js .gitignore server/.env.example server/db.js server/__tests__/db.test.js
git commit -m "feat(server): scaffold express+mysql2, db pool, vite proxy

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Schema + schema applier

**Files:**
- Create: `server/schema.sql`
- Create: `server/applySchema.js`
- Test: `server/__tests__/schema.test.js`

**Interfaces:**
- Produces: `applySchema() -> Promise<void>` — creates the database and all tables; safe to run repeatedly.

- [ ] **Step 1: `server/schema.sql`** — full DDL:

```sql
CREATE DATABASE IF NOT EXISTS mahindra_i2p CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mahindra_i2p;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(128) NOT NULL,
  email VARCHAR(191) NOT NULL,
  role VARCHAR(64) NOT NULL,
  dept VARCHAR(64) NOT NULL DEFAULT '',
  title VARCHAR(128) NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'Active'
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
  token CHAR(36) PRIMARY KEY,
  user_id INT NULL,
  auth_type ENUM('internal','supplier') NOT NULL,
  scope_json JSON NULL,
  supplier_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoices (
  no VARCHAR(32) PRIMARY KEY,
  vcode VARCHAR(32) NOT NULL,
  vendor VARCHAR(128) NOT NULL,
  channel VARCHAR(32) NOT NULL,
  po VARCHAR(64) NOT NULL,
  amount VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  utr VARCHAR(32) NOT NULL DEFAULT '-',
  date VARCHAR(32) NOT NULL,
  short_pay_reason TEXT NULL,
  stage_index INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tickets (
  id VARCHAR(16) PRIMARY KEY,
  no VARCHAR(32) NOT NULL,
  category VARCHAR(64) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  priority VARCHAR(16) NOT NULL,
  assignee VARCHAR(64) NOT NULL,
  raised_by VARCHAR(32) NOT NULL,
  raised_date VARCHAR(32) NOT NULL,
  sla_hours INT NOT NULL DEFAULT 24,
  resolved_date VARCHAR(32) NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ticket_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id VARCHAR(16) NOT NULL,
  author VARCHAR(64) NOT NULL,
  role VARCHAR(64) NOT NULL DEFAULT '',
  date VARCHAR(32) NOT NULL,
  text TEXT NOT NULL,
  seq INT NOT NULL,
  CONSTRAINT fk_comments_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ticket_activity (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id VARCHAR(16) NOT NULL,
  date VARCHAR(32) NOT NULL,
  text TEXT NOT NULL,
  seq INT NOT NULL,
  CONSTRAINT fk_activity_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS table_rows (
  table_key VARCHAR(64) NOT NULL,
  row_index INT NOT NULL,
  cells_json JSON NOT NULL,
  PRIMARY KEY (table_key, row_index)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS settings (
  id TINYINT PRIMARY KEY,
  role_matrix_json JSON NOT NULL,
  two_factor TINYINT NOT NULL DEFAULT 0,
  sender_email VARCHAR(191) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sync_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  channel VARCHAR(64) NOT NULL,
  time VARCHAR(48) NOT NULL,
  status VARCHAR(16) NOT NULL,
  records INT NOT NULL DEFAULT 0,
  msg TEXT NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS integrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(96) NOT NULL,
  status VARCHAR(32) NOT NULL,
  last_sync VARCHAR(48) NOT NULL
) ENGINE=InnoDB;
```

- [ ] **Step 2: `server/applySchema.js`**

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rootPool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function applySchema() {
  const sql = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
  const conn = await rootPool.getConnection();
  try {
    await conn.query(sql); // multipleStatements enabled on rootPool
  } finally {
    conn.release();
  }
}

// Allow `node server/applySchema.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  applySchema().then(() => { console.log('schema applied'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 3: Write `server/__tests__/schema.test.js`**

```js
import { describe, it, expect, beforeAll } from 'vitest';
import { applySchema } from '../applySchema.js';
import { query } from '../db.js';

beforeAll(async () => { await applySchema(); });

describe('schema', () => {
  it('creates all expected tables', async () => {
    const rows = await query(
      "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?",
      ['mahindra_i2p'],
    );
    const names = rows.map((r) => r.t.toLowerCase());
    for (const t of ['users','sessions','invoices','tickets','ticket_comments',
      'ticket_activity','table_rows','settings','sync_log','integrations']) {
      expect(names).toContain(t);
    }
  });
});
```

- [ ] **Step 4: Run** `npm run test:server` → expect PASS.

- [ ] **Step 5: Commit**

```bash
git add server/schema.sql server/applySchema.js server/__tests__/schema.test.js
git commit -m "feat(server): mysql schema + idempotent applier

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Seed script

**Files:**
- Create: `server/seed.js`
- Create: `server/stageIndex.js` (derive `stage_index` from status)
- Test: `server/__tests__/seed.test.js`

**Interfaces:**
- Consumes: `applySchema` from Task 2; `INVOICE_DATA`, `SYNC_LOG` from `src/data/invoices.js`; `INITIAL_TICKETS` from `src/data/tickets.js`; `ROLE_MATRIX`, `CHANNEL_STAGES` from `src/data/constants.js`; the `settingsSlice` integration seed; the `tablesSlice` `SEED`.
- Produces: `seedAll() -> Promise<void>` — TRUNCATEs every table then inserts. Idempotent.

- [ ] **Step 1: `server/stageIndex.js`** — map an invoice to a stage index within its channel's `CHANNEL_STAGES` list:

```js
import { CHANNEL_STAGES } from '../src/data/constants.js';

// Best-effort mapping from the coarse status vocabulary to a stage position.
const STATUS_TO_FRACTION = {
  Uploaded: 0.1, 'Pending Approval': 0.4, Approved: 0.55, Booked: 0.75,
  'Payment Due': 0.85, Paid: 1, 'Short-Paid': 1, Failed: 0.5,
};

export function stageIndexFor(inv) {
  const stages = CHANNEL_STAGES[inv.channel] || [];
  const frac = STATUS_TO_FRACTION[inv.status] ?? 0.1;
  return Math.max(0, Math.min(stages.length - 1, Math.round(frac * (stages.length - 1))));
}
```

- [ ] **Step 2: `server/seed.js`**

```js
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { applySchema } from './applySchema.js';
import { pool, query } from './db.js';
import { stageIndexFor } from './stageIndex.js';
import { INVOICE_DATA, SYNC_LOG } from '../src/data/invoices.js';
import { INITIAL_TICKETS } from '../src/data/tickets.js';
import { ROLE_MATRIX } from '../src/data/constants.js';

const USERS = [
  ['admin', 'admin123', 'Ravi Kulkarni', 'r.kulkarni@company.com', 'Admin', 'Procurement', 'MDE Invoice Lead'],
  ['priya', 'priya123', 'Priya Deshmukh', 'p.deshmukh@company.com', 'MDE Invoice Team', 'Procurement', 'Invoice Processor'],
];

const TABLE_ROWS = {
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

const INTEGRATIONS = [
  ['Msetu / SRM', 'Connected', '06 Aug 2026, 07:00 AM'],
  ['PO Portal', 'Connected', '06 Aug 2026, 07:02 AM'],
  ['SAP (MIRO / ML81N / FBL1N)', 'Connected', '06 Aug 2026, 07:05 AM'],
  ['MFOX Portal', 'Connection Error', '06 Aug 2026, 07:08 AM'],
];

async function seedAll() {
  await applySchema();
  await query('SET FOREIGN_KEY_CHECKS=0');
  for (const t of ['users','sessions','invoices','tickets','ticket_comments',
    'ticket_activity','table_rows','settings','sync_log','integrations']) {
    await query(`TRUNCATE TABLE ${t}`);
  }
  await query('SET FOREIGN_KEY_CHECKS=1');

  for (const [username, pw, name, email, role, dept, title] of USERS) {
    await query(
      'INSERT INTO users (username,password_hash,name,email,role,dept,title,status) VALUES (?,?,?,?,?,?,?,?)',
      [username, bcrypt.hashSync(pw, 10), name, email, role, dept, title, 'Active'],
    );
  }

  for (const i of INVOICE_DATA) {
    await query(
      `INSERT INTO invoices (no,vcode,vendor,channel,po,amount,status,utr,date,short_pay_reason,stage_index)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [i.no, i.vcode, i.vendor, i.channel, i.po, i.amount, i.status, i.utr || '-', i.date,
       i.shortPayReason || null, stageIndexFor(i)],
    );
  }

  for (const t of INITIAL_TICKETS) {
    await query(
      `INSERT INTO tickets (id,no,category,description,status,priority,assignee,raised_by,raised_date,sla_hours,resolved_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [t.id, t.no, t.category, t.desc, t.status, t.priority, t.assignee, t.raisedBy,
       t.raisedDate, t.slaHours || 24, t.resolvedDate || null],
    );
    let s = 0;
    for (const c of t.comments || []) {
      await query('INSERT INTO ticket_comments (ticket_id,author,role,date,text,seq) VALUES (?,?,?,?,?,?)',
        [t.id, c.author, c.role || '', c.date, c.text, s++]);
    }
    s = 0;
    for (const a of t.activity || []) {
      await query('INSERT INTO ticket_activity (ticket_id,date,text,seq) VALUES (?,?,?,?)',
        [t.id, a.date, a.text, s++]);
    }
  }

  for (const [key, rows] of Object.entries(TABLE_ROWS)) {
    rows.forEach(async (cells, idx) => {}); // replaced below to await properly
  }
  for (const [key, rows] of Object.entries(TABLE_ROWS)) {
    for (let idx = 0; idx < rows.length; idx++) {
      await query('INSERT INTO table_rows (table_key,row_index,cells_json) VALUES (?,?,?)',
        [key, idx, JSON.stringify(rows[idx])]);
    }
  }

  await query('INSERT INTO settings (id,role_matrix_json,two_factor,sender_email) VALUES (1,?,?,?)',
    [JSON.stringify(ROLE_MATRIX), 0, 'i2ptracker@company.com']);

  for (const s of SYNC_LOG) {
    await query('INSERT INTO sync_log (channel,time,status,records,msg) VALUES (?,?,?,?,?)',
      [s.channel, s.time, s.status, s.records, s.msg]);
  }
  for (const [name, status, last] of INTEGRATIONS) {
    await query('INSERT INTO integrations (name,status,last_sync) VALUES (?,?,?)', [name, status, last]);
  }
}

export { seedAll };

if (import.meta.url === `file://${process.argv[1]}`) {
  seedAll()
    .then(() => { console.log('seed complete'); return pool.end(); })
    .then(() => process.exit(0))
    .catch((e) => { console.error('seed failed:', e.message); process.exit(1); });
}
```

Note: remove the dead `rows.forEach(async …)` loop when implementing — kept out of the final file.

- [ ] **Step 3: Write `server/__tests__/seed.test.js`**

```js
import { describe, it, expect, beforeAll } from 'vitest';
import { seedAll } from '../seed.js';
import { query } from '../db.js';

beforeAll(async () => { await seedAll(); });

describe('seed', () => {
  it('loads invoices', async () => {
    const [{ n }] = await query('SELECT COUNT(*) AS n FROM invoices');
    expect(n).toBeGreaterThanOrEqual(19);
  });
  it('hashes the admin password', async () => {
    const [u] = await query('SELECT password_hash FROM users WHERE username=?', ['admin']);
    expect(u.password_hash).not.toBe('admin123');
    expect(u.password_hash.length).toBeGreaterThan(20);
  });
  it('seeds one settings row', async () => {
    const [{ n }] = await query('SELECT COUNT(*) AS n FROM settings');
    expect(n).toBe(1);
  });
});
```

- [ ] **Step 4: Run** `npm run seed` then `npm run test:server` → expect PASS.

- [ ] **Step 5: Commit**

```bash
git add server/seed.js server/stageIndex.js server/__tests__/seed.test.js
git commit -m "feat(server): seed mysql from src/data with bcrypt admin user

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Auth module + routes

**Files:**
- Create: `server/auth.js`
- Create: `server/routes/auth.js`
- Create: `server/serializers.js` (auth payload builder only for now)
- Create: `server/index.js`
- Test: `server/__tests__/auth.test.js`

**Interfaces:**
- Consumes: `query`, `withConn` (Task 1); `stageIndexFor` not needed here.
- Produces:
  - `hashPassword(s) -> string`, `verifyPassword(s, hash) -> bool`
  - `createSession({ userId, authType, scope, supplier }) -> token`
  - `getSession(token) -> { token, userId, authType, scope, supplier } | null`
  - `deleteSession(token) -> void`
  - `requireAuth(req, res, next)` — sets `req.session`, 401s if missing/invalid
  - `buildAuthPayload(session) -> { authType, channelScope, role, supplierQuery, supplierPAN, supplierLoginVcode, currentUser }`
  - Express app on `PORT` (default 3001) with `/api/login`, `/api/logout`, `/api/me` mounted.

- [ ] **Step 1: `server/auth.js`**

```js
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from './db.js';

export const hashPassword = (s) => bcrypt.hashSync(s, 10);
export const verifyPassword = (s, hash) => bcrypt.compareSync(s, hash);

export async function createSession({ userId = null, authType, scope = null, supplier = null }) {
  const token = randomUUID();
  await query(
    'INSERT INTO sessions (token,user_id,auth_type,scope_json,supplier_json) VALUES (?,?,?,?,?)',
    [token, userId, authType, scope ? JSON.stringify(scope) : null, supplier ? JSON.stringify(supplier) : null],
  );
  return token;
}

export async function getSession(token) {
  if (!token) return null;
  const rows = await query('SELECT * FROM sessions WHERE token=?', [token]);
  if (!rows.length) return null;
  const r = rows[0];
  return {
    token: r.token, userId: r.user_id, authType: r.auth_type,
    scope: r.scope_json ? (typeof r.scope_json === 'string' ? JSON.parse(r.scope_json) : r.scope_json) : null,
    supplier: r.supplier_json ? (typeof r.supplier_json === 'string' ? JSON.parse(r.supplier_json) : r.supplier_json) : null,
  };
}

export async function deleteSession(token) {
  await query('DELETE FROM sessions WHERE token=?', [token]);
}

export async function requireAuth(req, res, next) {
  const auth = req.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const session = await getSession(token);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  req.session = session;
  next();
}
```

- [ ] **Step 2: `server/serializers.js`** (auth payload; other serializers added in Task 5)

```js
import { panFor, vendorCodesFor } from '../src/utils/businessLogic.js';

const DEFAULT_USER = { name: 'Ravi Kulkarni', initials: 'RK', title: 'MDE Invoice Lead', dept: 'Procurement', email: 'r.kulkarni@company.com' };

export function buildAuthPayload(session, userRow) {
  if (session.authType === 'supplier') {
    const s = session.supplier || {};
    return {
      authType: 'supplier', channelScope: 'all', role: 'Viewer',
      supplierQuery: s.company, supplierPAN: s.pan ?? panFor(s.company),
      supplierLoginVcode: s.vcode || vendorCodesFor(s.company)[0],
      currentUser: DEFAULT_USER,
    };
  }
  const scope = session.scope || {};
  const channelScope = scope.channelScope === 'internalTeam' ? 'internalTeam' : 'all';
  return {
    authType: 'internal', channelScope,
    role: channelScope === 'all' ? 'Admin' : 'MDE Invoice Team',
    supplierQuery: null, supplierPAN: null, supplierLoginVcode: null,
    currentUser: userRow
      ? { name: userRow.name, initials: userRow.name.split(' ').map((w) => w[0]).join('').slice(0, 2),
          title: userRow.title, dept: userRow.dept, email: userRow.email }
      : DEFAULT_USER,
  };
}
```

- [ ] **Step 3: `server/routes/auth.js`**

```js
import { Router } from 'express';
import { query } from '../db.js';
import { verifyPassword, createSession, deleteSession, requireAuth, getSession } from '../auth.js';
import { buildAuthPayload } from '../serializers.js';
import { panFor, vendorCodesFor } from '../../src/utils/businessLogic.js';

const r = Router();

r.post('/login', async (req, res) => {
  const { mode } = req.body;
  if (mode === 'supplier') {
    const { company, vcode } = req.body;
    if (!company) return res.status(400).json({ error: 'company required' });
    const supplier = { company, pan: panFor(company), vcode: vcode || vendorCodesFor(company)[0] };
    const token = await createSession({ authType: 'supplier', supplier });
    const session = await getSession(token);
    return res.json({ token, auth: buildAuthPayload(session) });
  }
  const { username, password, channelScope } = req.body;
  const rows = await query('SELECT * FROM users WHERE username=?', [String(username || '').toLowerCase()]);
  const user = rows[0];
  if (!user || !verifyPassword(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  const scope = { channelScope: channelScope === 'internalTeam' ? 'internalTeam' : 'all' };
  const token = await createSession({ userId: user.id, authType: 'internal', scope });
  const session = await getSession(token);
  return res.json({ token, auth: buildAuthPayload(session, user) });
});

r.post('/logout', requireAuth, async (req, res) => {
  await deleteSession(req.session.token);
  res.json({ ok: true });
});

r.get('/me', requireAuth, async (req, res) => {
  let userRow = null;
  if (req.session.userId) {
    const rows = await query('SELECT * FROM users WHERE id=?', [req.session.userId]);
    userRow = rows[0] || null;
  }
  res.json({ auth: buildAuthPayload(req.session, userRow) });
});

export default r;
```

- [ ] **Step 4: `server/index.js`**

```js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api', authRoutes);
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error' });
  });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 3001;
  createApp().listen(port, () => console.log(`API on http://localhost:${port}`));
}
```

- [ ] **Step 5: Write `server/__tests__/auth.test.js`**

```js
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { seedAll } from '../seed.js';
import { createApp } from '../index.js';
import { query } from '../db.js';

let app;
beforeAll(async () => { await seedAll(); app = createApp(); });

describe('auth', () => {
  it('logs in with correct credentials', async () => {
    const res = await request(app).post('/api/login').send({ mode: 'internal', username: 'admin', password: 'admin123', channelScope: 'all' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.auth.role).toBe('Admin');
  });

  it('rejects a wrong password and creates no session', async () => {
    const before = await query('SELECT COUNT(*) AS n FROM sessions');
    const res = await request(app).post('/api/login').send({ mode: 'internal', username: 'admin', password: 'nope' });
    expect(res.status).toBe(401);
    const after = await query('SELECT COUNT(*) AS n FROM sessions');
    expect(after[0].n).toBe(before[0].n);
  });

  it('GET /api/me works with a valid token and 401s without', async () => {
    const login = await request(app).post('/api/login').send({ mode: 'internal', username: 'admin', password: 'admin123' });
    const ok = await request(app).get('/api/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(ok.status).toBe(200);
    const no = await request(app).get('/api/me');
    expect(no.status).toBe(401);
  });

  it('logout invalidates the session', async () => {
    const login = await request(app).post('/api/login').send({ mode: 'internal', username: 'admin', password: 'admin123' });
    const t = login.body.token;
    await request(app).post('/api/logout').set('Authorization', `Bearer ${t}`).expect(200);
    await request(app).get('/api/me').set('Authorization', `Bearer ${t}`).expect(401);
  });

  it('supplier login needs no password', async () => {
    const res = await request(app).post('/api/login').send({ mode: 'supplier', company: 'Tata Communications Ltd' });
    expect(res.status).toBe(200);
    expect(res.body.auth.authType).toBe('supplier');
    expect(res.body.auth.supplierLoginVcode).toBeTruthy();
  });
});
```

- [ ] **Step 6: Install test dep** `npm install -D supertest@^7.0.0` then run `npm run test:server` → expect PASS.

- [ ] **Step 7: Commit**

```bash
git add server/auth.js server/serializers.js server/routes/auth.js server/index.js server/__tests__/auth.test.js package.json package-lock.json
git commit -m "feat(server): real login/logout/me with sessions table

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Domain read/write routes + bootstrap

**Files:**
- Modify: `server/serializers.js` (add invoice/ticket/tables/settings mappers)
- Create: `server/routes/invoices.js`, `server/routes/tickets.js`, `server/routes/tables.js`, `server/routes/settings.js`, `server/routes/bootstrap.js`
- Modify: `server/index.js` (mount them)
- Test: `server/__tests__/persistence.test.js`

**Interfaces:**
- Consumes: `requireAuth`, `query`, `withConn`.
- Produces these responses (all require `Bearer` token):
  - `GET /api/bootstrap` → `{ invoices: Invoice[], syncLog: SyncRow[], tickets: Ticket[], ticketSeq: number, tables: { [key]: string[][] }, settings: { roleMatrix, twoFactorOn, senderEmail, integrations } }`
  - `PATCH /api/invoices/:no` body `{ status?, utr?, stageIndex? }` → updated `Invoice`
  - `POST /api/tickets` body `{ no, category, priority, desc, raisedBy, assignee }` → `{ ticket: Ticket, seq }`
  - `POST /api/tickets/:id/comments` body `{ author, role, text, date }` → updated `Ticket`
  - `PATCH /api/tickets/:id` body `{ status?, priority?, assignee?, resolvedDate?, activity?: {date,text}[] }` → updated `Ticket`
  - `GET /api/tables/:key` → `string[][]`; `PUT /api/tables/:key` body `{ rows: string[][] }` → `string[][]`
  - `GET /api/settings` / `PUT /api/settings` body `{ roleMatrix?, twoFactorOn?, senderEmail? }` → settings object
- `Invoice` shape: `{ no, vcode, vendor, channel, po, amount, status, utr, date, shortPayReason, stageIndex }`
- `Ticket` shape: `{ id, no, category, desc, status, priority, assignee, raisedBy, raisedDate, slaHours, resolvedDate, comments: {author,role,date,text}[], activity: {date,text}[] }`

- [ ] **Step 1: Add serializers** to `server/serializers.js`:

```js
export const toInvoice = (r) => ({
  no: r.no, vcode: r.vcode, vendor: r.vendor, channel: r.channel, po: r.po,
  amount: r.amount, status: r.status, utr: r.utr, date: r.date,
  shortPayReason: r.short_pay_reason || undefined, stageIndex: r.stage_index,
});

export const toSyncRow = (r) => ({ channel: r.channel, time: r.time, status: r.status, records: r.records, msg: r.msg });

export function toTicket(row, comments, activity) {
  return {
    id: row.id, no: row.no, category: row.category, desc: row.description,
    status: row.status, priority: row.priority, assignee: row.assignee,
    raisedBy: row.raised_by, raisedDate: row.raised_date, slaHours: row.sla_hours,
    resolvedDate: row.resolved_date || null,
    comments: comments.map((c) => ({ author: c.author, role: c.role, date: c.date, text: c.text })),
    activity: activity.map((a) => ({ date: a.date, text: a.text })),
  };
}
```

- [ ] **Step 2: `server/routes/bootstrap.js`**

```js
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { toInvoice, toSyncRow, toTicket } from '../serializers.js';

const r = Router();

r.get('/bootstrap', requireAuth, async (_req, res) => {
  const invoices = (await query('SELECT * FROM invoices')).map(toInvoice);
  const syncLog = (await query('SELECT * FROM sync_log ORDER BY id')).map(toSyncRow);

  const tRows = await query('SELECT * FROM tickets');
  const allComments = await query('SELECT * FROM ticket_comments ORDER BY ticket_id, seq');
  const allActivity = await query('SELECT * FROM ticket_activity ORDER BY ticket_id, seq');
  const tickets = tRows.map((row) => toTicket(
    row,
    allComments.filter((c) => c.ticket_id === row.id),
    allActivity.filter((a) => a.ticket_id === row.id),
  ));
  const maxSeq = tRows.reduce((m, t) => {
    const n = parseInt(String(t.id).replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 1005);

  const tableRows = await query('SELECT * FROM table_rows ORDER BY table_key, row_index');
  const tables = {};
  for (const tr of tableRows) {
    (tables[tr.table_key] ||= []).push(
      typeof tr.cells_json === 'string' ? JSON.parse(tr.cells_json) : tr.cells_json,
    );
  }

  const [s] = await query('SELECT * FROM settings WHERE id=1');
  const integrations = (await query('SELECT name,status,last_sync FROM integrations ORDER BY id'))
    .map((i) => [i.name, i.status, i.last_sync]);
  const settings = {
    roleMatrix: typeof s.role_matrix_json === 'string' ? JSON.parse(s.role_matrix_json) : s.role_matrix_json,
    twoFactorOn: !!s.two_factor, senderEmail: s.sender_email, integrations,
  };

  res.json({ invoices, syncLog, tickets, ticketSeq: maxSeq, tables, settings });
});

export default r;
```

- [ ] **Step 3: `server/routes/invoices.js`**

```js
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { toInvoice } from '../serializers.js';

const r = Router();

r.get('/invoices', requireAuth, async (_req, res) => {
  res.json((await query('SELECT * FROM invoices')).map(toInvoice));
});

r.patch('/invoices/:no', requireAuth, async (req, res) => {
  const { status, utr, stageIndex } = req.body;
  const sets = [], vals = [];
  if (status !== undefined) { sets.push('status=?'); vals.push(status); }
  if (utr !== undefined) { sets.push('utr=?'); vals.push(utr); }
  if (stageIndex !== undefined) { sets.push('stage_index=?'); vals.push(stageIndex); }
  if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
  vals.push(req.params.no);
  await query(`UPDATE invoices SET ${sets.join(',')} WHERE no=?`, vals);
  const [row] = await query('SELECT * FROM invoices WHERE no=?', [req.params.no]);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(toInvoice(row));
});

export default r;
```

- [ ] **Step 4: `server/routes/tickets.js`**

```js
import { Router } from 'express';
import { query, withConn } from '../db.js';
import { requireAuth } from '../auth.js';
import { toTicket } from '../serializers.js';

const r = Router();

async function loadTicket(id) {
  const [row] = await query('SELECT * FROM tickets WHERE id=?', [id]);
  if (!row) return null;
  const comments = await query('SELECT * FROM ticket_comments WHERE ticket_id=? ORDER BY seq', [id]);
  const activity = await query('SELECT * FROM ticket_activity WHERE ticket_id=? ORDER BY seq', [id]);
  return toTicket(row, comments, activity);
}

r.get('/tickets', requireAuth, async (_req, res) => {
  const rows = await query('SELECT id FROM tickets');
  res.json(await Promise.all(rows.map((r0) => loadTicket(r0.id))));
});

r.post('/tickets', requireAuth, async (req, res) => {
  const { no, category, priority = 'Medium', desc, raisedBy, assignee = 'MDE Invoice Team' } = req.body;
  const [{ maxid }] = await query("SELECT COALESCE(MAX(CAST(SUBSTRING(id,5) AS UNSIGNED)),1005) AS maxid FROM tickets");
  const seq = Number(maxid) + 1;
  const id = 'TCK-' + seq;
  const today = req.body.date || new Date('2026-09-09').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  await withConn(async (c) => {
    await c.execute(
      `INSERT INTO tickets (id,no,category,description,status,priority,assignee,raised_by,raised_date,sla_hours,resolved_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,NULL)`,
      [id, no, category, desc || 'No description provided.', 'Open', priority, assignee, raisedBy, today, 24],
    );
    await c.execute('INSERT INTO ticket_activity (ticket_id,date,text,seq) VALUES (?,?,?,0)',
      [id, today, `Ticket created by ${raisedBy}, priority set to ${priority}, assigned to ${assignee}.`]);
  });
  res.json({ ticket: await loadTicket(id), seq });
});

r.post('/tickets/:id/comments', requireAuth, async (req, res) => {
  const { author, role = '', text, date } = req.body;
  const id = req.params.id;
  const [{ n }] = await query('SELECT COUNT(*) AS n FROM ticket_comments WHERE ticket_id=?', [id]);
  const [{ a }] = await query('SELECT COUNT(*) AS a FROM ticket_activity WHERE ticket_id=?', [id]);
  await withConn(async (c) => {
    await c.execute('INSERT INTO ticket_comments (ticket_id,author,role,date,text,seq) VALUES (?,?,?,?,?,?)',
      [id, author, role, date, text, n]);
    await c.execute('INSERT INTO ticket_activity (ticket_id,date,text,seq) VALUES (?,?,?,?)',
      [id, date, `Comment added by ${author}${role ? ` (${role})` : ''}.`, a]);
  });
  res.json(await loadTicket(id));
});

r.patch('/tickets/:id', requireAuth, async (req, res) => {
  const { status, priority, assignee, resolvedDate, activity } = req.body;
  const id = req.params.id;
  const sets = [], vals = [];
  if (status !== undefined) { sets.push('status=?'); vals.push(status); }
  if (priority !== undefined) { sets.push('priority=?'); vals.push(priority); }
  if (assignee !== undefined) { sets.push('assignee=?'); vals.push(assignee); }
  if (resolvedDate !== undefined) { sets.push('resolved_date=?'); vals.push(resolvedDate); }
  await withConn(async (c) => {
    if (sets.length) { vals.push(id); await c.execute(`UPDATE tickets SET ${sets.join(',')} WHERE id=?`, vals); }
    for (const entry of activity || []) {
      const [[{ a }]] = await c.query('SELECT COUNT(*) AS a FROM ticket_activity WHERE ticket_id=?', [id]);
      await c.execute('INSERT INTO ticket_activity (ticket_id,date,text,seq) VALUES (?,?,?,?)',
        [id, entry.date, entry.text, a]);
    }
  });
  res.json(await loadTicket(id));
});

export default r;
```

- [ ] **Step 5: `server/routes/tables.js`**

```js
import { Router } from 'express';
import { query, withConn } from '../db.js';
import { requireAuth } from '../auth.js';

const r = Router();

r.get('/tables/:key', requireAuth, async (req, res) => {
  const rows = await query('SELECT cells_json FROM table_rows WHERE table_key=? ORDER BY row_index', [req.params.key]);
  res.json(rows.map((x) => (typeof x.cells_json === 'string' ? JSON.parse(x.cells_json) : x.cells_json)));
});

r.put('/tables/:key', requireAuth, async (req, res) => {
  const key = req.params.key;
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  await withConn(async (c) => {
    await c.execute('DELETE FROM table_rows WHERE table_key=?', [key]);
    for (let i = 0; i < rows.length; i++) {
      await c.execute('INSERT INTO table_rows (table_key,row_index,cells_json) VALUES (?,?,?)',
        [key, i, JSON.stringify(rows[i])]);
    }
  });
  res.json(rows);
});

export default r;
```

- [ ] **Step 6: `server/routes/settings.js`**

```js
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';

const r = Router();

async function readSettings() {
  const [s] = await query('SELECT * FROM settings WHERE id=1');
  const integrations = (await query('SELECT name,status,last_sync FROM integrations ORDER BY id'))
    .map((i) => [i.name, i.status, i.last_sync]);
  return {
    roleMatrix: typeof s.role_matrix_json === 'string' ? JSON.parse(s.role_matrix_json) : s.role_matrix_json,
    twoFactorOn: !!s.two_factor, senderEmail: s.sender_email, integrations,
  };
}

r.get('/settings', requireAuth, async (_req, res) => res.json(await readSettings()));

r.put('/settings', requireAuth, async (req, res) => {
  const { roleMatrix, twoFactorOn, senderEmail } = req.body;
  const sets = [], vals = [];
  if (roleMatrix !== undefined) { sets.push('role_matrix_json=?'); vals.push(JSON.stringify(roleMatrix)); }
  if (twoFactorOn !== undefined) { sets.push('two_factor=?'); vals.push(twoFactorOn ? 1 : 0); }
  if (senderEmail !== undefined) { sets.push('sender_email=?'); vals.push(senderEmail); }
  if (sets.length) await query(`UPDATE settings SET ${sets.join(',')} WHERE id=1`, vals);
  res.json(await readSettings());
});

export default r;
```

- [ ] **Step 7: Mount in `server/index.js`** — add imports and `app.use('/api', ...)` for bootstrap, invoices, tickets, tables, settings (after `authRoutes`).

- [ ] **Step 8: Write `server/__tests__/persistence.test.js`**

```js
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { seedAll } from '../seed.js';
import { createApp } from '../index.js';

let app, token;
beforeAll(async () => {
  await seedAll();
  app = createApp();
  const login = await request(app).post('/api/login').send({ mode: 'internal', username: 'admin', password: 'admin123' });
  token = login.body.token;
});
const auth = () => ({ Authorization: `Bearer ${token}` });

describe('persistence', () => {
  it('bootstrap returns the seeded dataset', async () => {
    const res = await request(app).get('/api/bootstrap').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.invoices.length).toBeGreaterThanOrEqual(19);
    expect(res.body.tickets.length).toBeGreaterThanOrEqual(4);
    expect(res.body.settings.roleMatrix.Admin.manageUsers).toBe(true);
  });

  it('a new ticket survives a fresh app/bootstrap', async () => {
    const create = await request(app).post('/api/tickets').set(auth())
      .send({ no: 'INV-MS-1002', category: 'Payment Not Received', priority: 'High', desc: 'test', raisedBy: 'Internal' });
    expect(create.status).toBe(200);
    const id = create.body.ticket.id;
    const app2 = createApp();
    const res = await request(app2).get('/api/bootstrap').set(auth());
    expect(res.body.tickets.some((t) => t.id === id)).toBe(true);
  });

  it('invoice stage move persists', async () => {
    await request(app).patch('/api/invoices/INV-MS-1003').set(auth()).send({ stageIndex: 6, status: 'Approved' }).expect(200);
    const res = await request(createApp()).get('/api/bootstrap').set(auth());
    const inv = res.body.invoices.find((i) => i.no === 'INV-MS-1003');
    expect(inv.stageIndex).toBe(6);
    expect(inv.status).toBe('Approved');
  });
});
```

- [ ] **Step 9: Run** `npm run test:server` → expect PASS.

- [ ] **Step 10: Commit**

```bash
git add server/serializers.js server/routes/ server/index.js server/__tests__/persistence.test.js
git commit -m "feat(server): bootstrap + invoices/tickets/tables/settings routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Client — runtime indirection + API client

**Files:**
- Create: `src/data/runtime.js`
- Create: `src/api/client.js`
- Modify: `src/utils/businessLogic.js`, `src/features/invoices/selectors.js`, `src/features/tickets/ticketsSlice.js` (import swap only in this task), and every `src/pages/*` / `src/components/modals/*` importing `INVOICE_DATA` or `SYNC_LOG`
- Test: `src/__tests__/runtime.test.js`

**Interfaces:**
- Produces:
  - `runtime` — `{ invoices: [], syncLog: [] }` (live object, never reassigned)
  - `setRuntimeData({ invoices, syncLog })` — mutates arrays in place (`splice`) so existing references stay valid
  - `suppliersFromRuntime()` — `[...new Set(runtime.invoices.map(i => i.vendor))]`
  - `api` — `{ get(path), post(path, body), patch(path, body), put(path, body), setToken(t), clearToken() }`

- [ ] **Step 1: `src/data/runtime.js`**

```js
export const runtime = { invoices: [], syncLog: [] };

export function setRuntimeData({ invoices, syncLog } = {}) {
  if (invoices) runtime.invoices.splice(0, runtime.invoices.length, ...invoices);
  if (syncLog) runtime.syncLog.splice(0, runtime.syncLog.length, ...syncLog);
}

export function suppliersFromRuntime() {
  return [...new Set(runtime.invoices.map((i) => i.vendor))];
}
```

- [ ] **Step 2: `src/api/client.js`**

```js
const TOKEN_KEY = 'i2p_token';
let token = null;
try { token = localStorage.getItem(TOKEN_KEY); } catch { /* ignore */ }

async function req(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  get: (p) => req('GET', p),
  post: (p, b) => req('POST', p, b),
  patch: (p, b) => req('PATCH', p, b),
  put: (p, b) => req('PUT', p, b),
  setToken(t) { token = t; try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } },
  clearToken() { token = null; try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
  hasToken: () => !!token,
};
```

- [ ] **Step 3: Swap imports.** In each file that has `import { INVOICE_DATA } from '.../data/invoices'`, replace usage of `INVOICE_DATA` with `runtime.invoices` and import `{ runtime }` from the correct relative path to `src/data/runtime.js`. Same for `SYNC_LOG` → `runtime.syncLog`. For `SUPPLIERS`, import `suppliersFromRuntime` and call it where a list is needed (LoginPage, Topbar, SupplierVisibilityPage). Files (from `grep -rl "INVOICE_DATA\|SYNC_LOG\|SUPPLIERS" src`):
  `src/utils/businessLogic.js`, `src/features/invoices/selectors.js`, `src/features/tickets/ticketsSlice.js`,
  `src/pages/OutputsPage.jsx`, `src/pages/SyncLogPage.jsx`, `src/pages/VendorCodePage.jsx`, `src/pages/ChannelPage.jsx`,
  `src/pages/SupplierVisibilityPage.jsx`, `src/pages/LoginPage.jsx`,
  `src/pages/supplier/SupplierHomePage.jsx`, `src/pages/supplier/SupplierLogsPage.jsx`,
  `src/components/modals/InvoiceDetailModal.jsx`, `src/components/modals/NotifyPreviewModal.jsx`,
  `src/components/modals/RaiseTicketModal.jsx`, `src/components/modals/StageSimpleModal.jsx`,
  `src/components/modals/SupplierInvoiceDetailModal.jsx`, `src/components/modals/VendorCodePreviewModal.jsx`,
  `src/components/layout/Topbar.jsx`.
  Leave `src/data/invoices.js` / `src/data/tickets.js` as-is (still used by the seed + tests).

- [ ] **Step 4: `src/__tests__/runtime.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { runtime, setRuntimeData, suppliersFromRuntime } from '../data/runtime.js';

describe('runtime dataset', () => {
  it('keeps the same array reference after hydration', () => {
    const ref = runtime.invoices;
    setRuntimeData({ invoices: [{ no: 'X', vendor: 'Acme' }], syncLog: [] });
    expect(runtime.invoices).toBe(ref);
    expect(runtime.invoices[0].no).toBe('X');
    expect(suppliersFromRuntime()).toEqual(['Acme']);
  });
});
```

- [ ] **Step 5: Run** `npm test` → runtime test PASSES. The existing suite will FAIL here (no hydration yet) — that is expected and fixed in Task 9. Note the failure count.

- [ ] **Step 6: Commit**

```bash
git add src/data/runtime.js src/api/client.js src/utils/businessLogic.js src/features src/pages src/components src/__tests__/runtime.test.js
git commit -m "refactor(client): route static data through runtime.js + add api client

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Client — hydrate reducers + write-through thunks

**Files:**
- Modify: `src/features/tickets/ticketsSlice.js`, `src/features/tables/tablesSlice.js`, `src/features/settings/settingsSlice.js`
- Test: `src/features/tickets/ticketsSlice.test.js` (new, unit)

**Interfaces:**
- Consumes: `api` from `src/api/client.js`.
- Produces (new exports):
  - tickets: `hydrateTickets({ items, seq })` reducer; thunks `submitTicket`, `postComment`, `setStatus`, `moveStatus`, `setPriority`, `setAssignee` (same names as today — now thunks; the raw reducers become `submitTicketLocal` etc. and stay exported for tests)
  - tables: `hydrateTables(byKey)` reducer; thunks `setRows`, `addRow`, `updateRow`, `deleteRow`, `toggleNotifRule` (raw reducers → `*Local`)
  - settings: `hydrateSettings({ roleMatrix, twoFactorOn, senderEmail, integrations })` reducer; thunks `togglePermission`, `toggleTwoFactor` (raw → `*Local`)

- [ ] **Step 1: tickets slice.** Set `initialState.items = []`, `seq = 1005`. Add `hydrateTickets` reducer:

```js
hydrateTickets(state, action) {
  state.items = action.payload.items;
  state.seq = action.payload.seq ?? state.seq;
},
```

Rename existing reducers to `submitTicketLocal`, `postCommentLocal`, `setStatusLocal`, `moveStatusLocal`, `setPriorityLocal`, `setAssigneeLocal` (bodies unchanged). Export both the raw actions and new thunks:

```js
export const submitTicket = (payload) => async (dispatch, getState) => {
  const raisedBy = payload.raisedBy;
  const { ticket, seq } = await api.post('/tickets', payload);
  dispatch(ticketsSlice.actions.hydrateTickets({
    items: [ticket, ...getState().tickets.items], seq,
  }));
};

export const postComment = (payload) => async (dispatch) => {
  dispatch(postCommentLocal(payload));               // optimistic
  try {
    const updated = await api.post(`/tickets/${payload.id}/comments`, {
      author: payload.author, role: payload.role, text: payload.text, date: payload.date || todayStr(),
    });
    dispatch(replaceTicket(updated));
  } catch (e) { /* toast handled by caller */ throw e; }
};
```

Add a small `replaceTicket` reducer that swaps one item by `id`, and a `todayStr()` helper (uses `APP_NOW`). Mirror the pattern for `setStatus`/`moveStatus`/`setPriority`/`setAssignee` — optimistic `*Local` dispatch, then `api.patch('/tickets/'+id, {...})`, then `replaceTicket`.

- [ ] **Step 2: tables slice.** `initialState.byKey = {}`. Add `hydrateTables`. Rename mutating reducers to `*Local`. Thunks apply `*Local` then `api.put('/tables/'+key, { rows: nextRows })` with the post-mutation rows read from `getState()`.

- [ ] **Step 3: settings slice.** Add `hydrateSettings`. Rename `togglePermission`/`toggleTwoFactor` to `*Local`. Thunks apply local then `api.put('/settings', { roleMatrix })` / `{ twoFactorOn }`.

- [ ] **Step 4: Unit test `src/features/tickets/ticketsSlice.test.js`**

```js
import { describe, it, expect } from 'vitest';
import reducer, { hydrateTickets, setStatusLocal } from './ticketsSlice.js';

describe('tickets reducer', () => {
  it('hydrates items + seq', () => {
    const s = reducer(undefined, hydrateTickets({ items: [{ id: 'TCK-1', status: 'Open' }], seq: 1010 }));
    expect(s.items).toHaveLength(1);
    expect(s.seq).toBe(1010);
  });
  it('setStatusLocal updates status and logs activity', () => {
    let s = reducer(undefined, hydrateTickets({ items: [{ id: 'TCK-1', status: 'Open', activity: [] }], seq: 1 }));
    s = reducer(s, setStatusLocal({ id: 'TCK-1', status: 'Resolved' }));
    expect(s.items[0].status).toBe('Resolved');
    expect(s.items[0].activity.at(-1).text).toMatch(/Resolved/);
  });
});
```

- [ ] **Step 5: Run** `npm test -- ticketsSlice` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/tickets src/features/tables src/features/settings
git commit -m "feat(client): hydrate reducers + write-through thunks for tickets/tables/settings

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Client — auth thunks, Bootstrapper, wiring

**Files:**
- Modify: `src/features/auth/authSlice.js`
- Create: `src/features/bootstrap/hydrateThunks.js`
- Create: `src/features/bootstrap/Bootstrapper.jsx`
- Modify: `src/pages/LoginPage.jsx`, `src/components/layout/Topbar.jsx`, `src/App.jsx` (or `src/routes/AppRoutes.jsx`)
- Test: covered by the full suite in Task 9

**Interfaces:**
- Consumes: `api`, hydrate reducers from Task 7, `setRuntimeData`.
- Produces:
  - authSlice: keep `loginInternal`/`loginSupplier`/`switchIdentity`/`logout` as **reducers** but add `setAuthFromServer(payload)` reducer that assigns the server `auth` object + `loggedIn:true`.
  - `hydrateThunks.js`: `loginThunk(form)`, `logoutThunk()`, `restoreSession()`, `loadBootstrap()`.
  - `Bootstrapper.jsx`: default export component; renders `children` only after `loadBootstrap()` resolves, else a centered "Loading…" div.

- [ ] **Step 1: authSlice** — add:

```js
setAuthFromServer(state, action) {
  Object.assign(state, action.payload, { loggedIn: true });
},
```

Keep `logout` reducer as-is (resets to `initialState`).

- [ ] **Step 2: `src/features/bootstrap/hydrateThunks.js`**

```js
import { api } from '../../api/client.js';
import { setAuthFromServer, logout as logoutLocal } from '../auth/authSlice.js';
import { hydrateTickets } from '../tickets/ticketsSlice.js';
import { hydrateTables } from '../tables/tablesSlice.js';
import { hydrateSettings } from '../settings/settingsSlice.js';
import { setRuntimeData } from '../../data/runtime.js';

export const loginThunk = (form) => async (dispatch) => {
  const { token, auth } = await api.post('/login', form);
  api.setToken(token);
  dispatch(setAuthFromServer(auth));
  await dispatch(loadBootstrap());
};

export const restoreSession = () => async (dispatch) => {
  if (!api.hasToken()) return false;
  try {
    const { auth } = await api.get('/me');
    dispatch(setAuthFromServer(auth));
    await dispatch(loadBootstrap());
    return true;
  } catch {
    api.clearToken();
    return false;
  }
};

export const loadBootstrap = () => async (dispatch) => {
  const b = await api.get('/bootstrap');
  setRuntimeData({ invoices: b.invoices, syncLog: b.syncLog });
  dispatch(hydrateTickets({ items: b.tickets, seq: b.ticketSeq }));
  dispatch(hydrateTables(b.tables));
  dispatch(hydrateSettings(b.settings));
};

export const logoutThunk = () => async (dispatch) => {
  try { await api.post('/logout'); } catch { /* ignore */ }
  api.clearToken();
  dispatch(logoutLocal());
};
```

- [ ] **Step 3: `src/features/bootstrap/Bootstrapper.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { restoreSession, loadBootstrap } from './hydrateThunks.js';

export default function Bootstrapper({ children }) {
  const dispatch = useDispatch();
  const loggedIn = useSelector((s) => s.auth.loggedIn);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (loggedIn) { try { await dispatch(loadBootstrap()); } catch { /* ignore */ } }
      else { await dispatch(restoreSession()); }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) return <div style={{ padding: 40, textAlign: 'center' }}>Loading…</div>;
  return children;
}
```

- [ ] **Step 4: LoginPage** — replace `dispatch(loginInternal(...))` with:

```js
try {
  await dispatch(loginThunk({ mode: 'internal', username, password, channelScope }));
  navigate('/app/invoices');
} catch (e) {
  setError(e.message || 'Login failed');
}
```

and the supplier submit with `loginThunk({ mode: 'supplier', company, vcode, phone })` → `navigate('/supplier/home')`. Remove the hardcoded `DEMO_USER` check.

- [ ] **Step 5: Topbar logout** — make the handler `async () => { await dispatch(logoutThunk()); navigate('/login'); }`.

- [ ] **Step 6: Wrap routes** — in `src/App.jsx`, wrap the authed route subtree (everything except `/login`) with `<Bootstrapper>`. Simplest: wrap the whole `<Routes>` — `/login` renders instantly because `restoreSession()` returns fast when there's no token.

- [ ] **Step 7: Manual smoke** — `npm run seed`, `npm run dev:all`, open the app: login as `admin`/`admin123` → invoices load from DB → raise a ticket → reload → ticket still there → logout → back at `/login`, back button does not re-enter.

- [ ] **Step 8: Commit**

```bash
git add src/features/auth src/features/bootstrap src/pages/LoginPage.jsx src/components/layout/Topbar.jsx src/App.jsx
git commit -m "feat(client): real login/logout thunks + bootstrap-on-load

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Fix the existing test suite

**Files:**
- Create: `src/test/hydrateStore.js`
- Modify: `src/__tests__/app.test.jsx`
- Modify: `vitest.config.js` if needed (exclude `server/**` from the default `test` project, include it only in `test:server`)

**Interfaces:**
- Produces: `seedTestStore(store)` — dispatches `hydrateTickets`/`hydrateTables`/`hydrateSettings` with fixture data from `src/data/*` and calls `setRuntimeData` with `INVOICE_DATA` + `SYNC_LOG`; also `api` is stubbed so thunks resolve without network.

- [ ] **Step 1: `vitest.config.js`** — ensure the client run ignores the server tests:

```js
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['@testing-library/jest-dom/vitest'],
    exclude: ['node_modules', 'dist', 'server/**'],
  },
});
```

Add a second config `vitest.server.config.js` with `environment: 'node'`, `include: ['server/**/*.test.js']`, and point `test:server` at it (`vitest run -c vitest.server.config.js`).

- [ ] **Step 2: `src/test/hydrateStore.js`**

```js
import { vi } from 'vitest';
import { INVOICE_DATA, SYNC_LOG } from '../data/invoices.js';
import { INITIAL_TICKETS } from '../data/tickets.js';
import { ROLE_MATRIX } from '../data/constants.js';
import { setRuntimeData } from '../data/runtime.js';
import { hydrateTickets } from '../features/tickets/ticketsSlice.js';
import { hydrateTables } from '../features/tables/tablesSlice.js';
import { hydrateSettings } from '../features/settings/settingsSlice.js';
import { api } from '../api/client.js';

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

export function stubApi() {
  vi.spyOn(api, 'get').mockResolvedValue({});
  vi.spyOn(api, 'post').mockImplementation(async (p, b) => {
    if (p === '/tickets') return { ticket: { ...b, id: 'TCK-9999', comments: [], activity: [] }, seq: 9999 };
    return {};
  });
  vi.spyOn(api, 'patch').mockResolvedValue({});
  vi.spyOn(api, 'put').mockResolvedValue({});
}

export function seedTestStore(store) {
  setRuntimeData({ invoices: INVOICE_DATA.map((r) => ({ ...r })), syncLog: SYNC_LOG });
  store.dispatch(hydrateTickets({ items: JSON.parse(JSON.stringify(INITIAL_TICKETS)), seq: 1005 }));
  store.dispatch(hydrateTables(TABLE_SEED));
  store.dispatch(hydrateSettings({
    roleMatrix: JSON.parse(JSON.stringify(ROLE_MATRIX)), twoFactorOn: false,
    senderEmail: 'i2ptracker@company.com',
    integrations: [
      ['Msetu / SRM', 'Connected', '06 Aug 2026, 07:00 AM'],
      ['PO Portal', 'Connected', '06 Aug 2026, 07:02 AM'],
      ['SAP (MIRO / ML81N / FBL1N)', 'Connected', '06 Aug 2026, 07:05 AM'],
      ['MFOX Portal', 'Connection Error', '06 Aug 2026, 07:08 AM'],
    ],
  }));
}
```

- [ ] **Step 3: Update `src/__tests__/app.test.jsx`** — in the render helper, after creating the store: `stubApi(); seedTestStore(store);`. Where a test logs in through the UI, either keep the flow (the stub resolves `loginThunk`) or dispatch `setAuthFromServer({...})` directly. Adjust any assertion that relied on `INITIAL_TICKETS` identity to read from the store instead. Remove the `DEMO_USER` assertion in favour of stub-backed login.

- [ ] **Step 4: Run** `npm test` → expect all client tests PASS. Run `npm run test:server` → expect PASS.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.js vitest.server.config.js src/test/hydrateStore.js src/__tests__/app.test.jsx package.json
git commit -m "test: hydrate store from fixtures + split client/server vitest runs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Docs + demo runbook

**Files:**
- Modify: `README.md`
- Create: `docs/DEMO.md`

- [ ] **Step 1: README** — replace the "Getting started" block with the MySQL flow:

```
npm install
cp server/.env.example server/.env   # then edit DB_PASSWORD
npm run seed                          # creates the mahindra_i2p database + data
npm run dev:all                       # API on :3001, web on :5173
```

Add a "Database" section: MySQL 8+/9, database `mahindra_i2p`, tables listed, "re-run `npm run seed` to reset to demo data".

- [ ] **Step 2: `docs/DEMO.md`** — the click-path for the client:

  1. `npm run dev:all`, open the web URL.
  2. Login → Internal Team → `admin` / `admin123` → All Channels.
  3. Invoices page — data is served from MySQL (`SELECT * FROM invoices`).
  4. Open an invoice → advance a stage (Approver Assignment / Booking / Payment).
  5. Inquiry Desk → raise a ticket → switch to Kanban → drag it to In Progress.
  6. Settings → toggle a permission.
  7. In a terminal: `mysql -u root -p mahindra_i2p -e "SELECT id,status FROM tickets ORDER BY id DESC LIMIT 3;"` — show the new row.
  8. Stop the API (`Ctrl+C` in the `dev:all` window), `npm run server` again, reload the browser — every change is still there.
  9. Logout → back at the login screen; browser back button does not re-enter.
  10. Supplier login → pick company + vendor code → supplier view is scoped to that code.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/DEMO.md
git commit -m "docs: mysql setup + client demo runbook

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Real DB + login→logout → Tasks 2–5, 8. ✓
- Everything persists (tickets, table rows, permissions, invoice stages) → Tasks 5, 7. ✓
- MySQL on localhost, `mahindra_i2p`, never touch `duroshox` → Tasks 1–3 (TRUNCATE only lists our tables; `CREATE DATABASE IF NOT EXISTS mahindra_i2p`). ✓
- Credentials only in `server/.env`, git-ignored, `.env.example` committed → Task 1. ✓
- One indirection point for `INVOICE_DATA` → Task 6 (`runtime.js`). ✓
- Hydrate-once + write-through → Tasks 7–8. ✓
- Auth payload matches `authSlice` shape → Task 4 `buildAuthPayload`. ✓
- Session restore on reload / invalidate on logout → Tasks 4, 8. ✓
- 27 existing tests still pass offline → Task 9. ✓
- New server tests (login, bad password, logout, persistence) → Tasks 4, 5. ✓
- Demo runbook → Task 10. ✓
- Identity switcher stays local (no new session) → unchanged `switchIdentity` reducer, noted in spec. ✓

**Placeholder scan:** The dead `rows.forEach(async …)` line in Task 3 Step 2 is explicitly flagged for removal. No TBD/TODO left. All code steps carry real code.

**Type consistency:** `hydrateTickets({ items, seq })`, `hydrateTables(byKey)`, `hydrateSettings({...})`, `setAuthFromServer(payload)`, `api.{get,post,patch,put,setToken,clearToken,hasToken}`, `runtime.{invoices,syncLog}`, `setRuntimeData`, `buildAuthPayload(session, userRow?)`, `toInvoice/toTicket/toSyncRow` — names used consistently across Tasks 4–9. Ticket API shape (`desc` not `description` on the wire) is fixed by `toTicket` and matched in `postComment`/`submitTicket` thunks.

**Known deviation:** `switchIdentity` still mutates local auth state without a server round-trip — intentional per spec's "Known limitations".
