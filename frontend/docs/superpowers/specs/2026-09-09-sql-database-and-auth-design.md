# Mahindra I2P — SQL Database + Real Auth (Demo Readiness)

**Date:** 2026-09-09
**Status:** Approved design, ready for implementation planning

## Goal

Make the app demo-ready for a client by replacing static seed data with a real
SQL database and a genuine login → logout flow. The client should be able to:

- Sign in with real credentials verified against the database.
- Navigate the full application backed by database reads.
- Make changes in the UI (tickets, table rows, permissions, invoice stage moves)
  that **persist across a server restart**.
- Sign out and have the session actually invalidated.

## Non-goals

- No production auth (SSO, real OTP delivery, password reset). Supplier OTP stays
  simulated. Internal login uses a seeded username/password.
- No async rewrite of the ~25 files that currently import `INVOICE_DATA`
  synchronously. We introduce **one** indirection point instead.
- No change to the visual design, routes, role model, or business rules.

## Architecture

New `server/` directory — an Express API backed by a **local MySQL** database
(`mahindra_i2p`), run alongside Vite in development. Target server: MySQL 9.7 on
`localhost:3306` (already installed and running on this machine).

```
server/
  .env             DB_HOST/PORT/USER/PASSWORD/NAME + PORT (git-ignored)
  db.js            mysql2/promise connection pool, reads server/.env via dotenv
  schema.sql       CREATE DATABASE IF NOT EXISTS + all CREATE TABLE statements
  seed.js          creates schema, then idempotent seed FROM the existing src/data/* files
  auth.js          bcrypt password check, session-token creation, requireAuth middleware
  routes/
    auth.js        POST /api/login, POST /api/logout, GET /api/me
    bootstrap.js   GET /api/bootstrap  (invoices + tickets + tables + settings + sync-log)
    invoices.js    GET /api/invoices, PATCH /api/invoices/:no
    tickets.js     GET /api/tickets, POST /api/tickets, POST /api/tickets/:id/comments,
                   PATCH /api/tickets/:id
    tables.js      GET /api/tables/:key, PUT /api/tables/:key
    settings.js    GET /api/settings, PUT /api/settings
  index.js         express app; mounts routes; listens on :3001
  __tests__/       server-side tests (login, bad password, logout, persistence)
```

### Dependencies (new)

- `express` — API server
- `mysql2` — MySQL driver (promise API, connection pooling)
- `dotenv` — load `server/.env`
- `bcryptjs` — password hashing (pure JS, no native build friction on Windows)
- `cors` — allow the Vite dev origin during development
- `concurrently` (dev) — run server + Vite with one command

### Scripts (`package.json`)

```json
"server":  "node server/index.js",
"seed":    "node server/seed.js",
"dev":     "vite",
"dev:all": "concurrently -n api,web -c blue,green \"npm run server\" \"npm run dev\""
```

### Vite proxy (`vite.config.js`)

```js
server: { proxy: { '/api': 'http://localhost:3001' } }
```

## Database schema

MySQL database `mahindra_i2p` on `localhost:3306`. `server/schema.sql` runs
`CREATE DATABASE IF NOT EXISTS mahindra_i2p` then all `CREATE TABLE IF NOT
EXISTS` statements (InnoDB, `utf8mb4`). `seed.js` runs the schema, then fills
every table from the current `src/data/*` content — using `INSERT ... ON
DUPLICATE KEY UPDATE` / `TRUNCATE`-then-insert so re-running is idempotent. The
demo opens with exactly today's data. The existing `duroshox*` databases on this
server are untouched.

| Table | Columns (summary) |
|---|---|
| `users` | id INT AI PK, username VARCHAR UNIQUE, password_hash, name, email, role, dept, title, status |
| `sessions` | token CHAR(36) PK, user_id INT NULL FK, auth_type ENUM('internal','supplier'), scope_json JSON, supplier_json JSON, created_at DATETIME |
| `invoices` | no VARCHAR PK, vcode, vendor, channel, po, amount, status, utr, date, short_pay_reason TEXT, stage_index INT |
| `tickets` | id VARCHAR PK, no, category, description TEXT, status, priority, assignee, raised_by, raised_date, sla_hours INT, resolved_date |
| `ticket_comments` | id INT AI PK, ticket_id VARCHAR FK, author, role, date, text TEXT |
| `ticket_activity` | id INT AI PK, ticket_id VARCHAR FK, date, text TEXT |
| `table_rows` | table_key VARCHAR, row_index INT, cells_json JSON — PRIMARY KEY (table_key, row_index); backs Users / Notification Rules / Audit editable tables |
| `settings` | id TINYINT PK (always 1), role_matrix_json JSON, two_factor TINYINT, sender_email VARCHAR |
| `sync_log` | id INT AI PK, channel, time, status, records INT, msg TEXT |
| `integrations` | id INT AI PK, name, status, last_sync |

`ticket_comments` / `ticket_activity` have `ON DELETE CASCADE` FKs to `tickets`.
`sessions.user_id` is `ON DELETE SET NULL` (supplier sessions have no user row).

`stage_index` on `invoices` is new: it lets Approver Assignment / SAP Booking /
Payment & UTR stage moves persist. Seed value derived from current `status` via
the existing `VIEW_MILESTONE` / stage logic in `utils/businessLogic.js`.

### Stays as code (config, not data)

`src/data/constants.js` is unchanged — `CHANNELS`, `CHANNEL_STAGES`,
`VIEW_COLUMNS`, `VIEW_MILESTONE`, `STATUS_CHIP`, `ROLE_MATRIX` (shape/defaults),
`TICKET_CATEGORIES`, `TICKET_PRIORITIES`, `APPROVER_POOL`, etc. These are
application configuration, not records.

`src/data/invoices.js` and `src/data/tickets.js` remain in the repo but are
**only** consumed by `server/seed.js` after this change (plus test fixtures).

## Client integration — hydrate-once, then write-through

### One indirection point

New `src/data/runtime.js`:

```js
// Mutable runtime dataset, filled by hydrate() after login.
export const runtime = { invoices: [], syncLog: [] };
export function setRuntimeData({ invoices, syncLog }) { /* assign in place */ }
```

`utils/businessLogic.js`, `features/invoices/selectors.js`,
`features/tickets/ticketsSlice.js`, and the modal components that currently do
`import { INVOICE_DATA } from '../data/invoices'` switch to
`import { runtime } from '.../data/runtime'` and read `runtime.invoices`.
Same for `SYNC_LOG` → `runtime.syncLog`. This is a mechanical
find-and-replace across ~25 files, but there is exactly one source array.

### API client

New `src/api/client.js`: a `fetch` wrapper that

- prefixes `/api`,
- attaches `Authorization: Bearer <token>` from `localStorage.getItem('i2p_token')`,
- throws on non-2xx with the server's error message,
- exposes `get`, `post`, `patch`, `put`.

### Bootstrap

After a successful login (and on app mount if a token exists), the app calls
`GET /api/bootstrap`. The response is dispatched into the store via new
`hydrate` reducers:

- `tickets/hydrate` → replaces `items` + `seq`
- `tables/hydrate` → fills `byKey`
- `settings/hydrate` → role matrix, 2FA, sender email, integrations
- `setRuntimeData()` → invoices + sync log into `runtime.js`

A small `<Bootstrapper>` component (rendered inside the authed route tree) runs
this on mount and shows a lightweight loading state until hydration completes.

### Write-through

Each existing mutating action becomes a thunk that updates Redux **and** the
API. Pattern:

```js
export const postComment = (payload) => async (dispatch) => {
  dispatch(ticketsSlice.actions.postComment(payload));      // instant UI
  await api.post(`/tickets/${payload.id}/comments`, payload); // persist
};
```

The pure reducers stay (renamed to `*Local` where a thunk shadows the name) so
the existing tests keep exercising them directly. Covered mutations:

- Tickets: `submitTicket`, `postComment`, `setStatus`, `moveStatus`,
  `setPriority`, `setAssignee`
- Tables: `setRows`, `addRow`, `updateRow`, `deleteRow`, `toggleNotifRule`
- Settings: `togglePermission`, `toggleTwoFactor`
- Invoices: stage/status moves from `StageSimpleModal` → `PATCH /api/invoices/:no`

Failure handling for the demo: on API error, push a toast
("Couldn't save — retry") and leave the optimistic state. No rollback logic;
acceptable for a demo, noted as a known limitation.

## Auth flow (end to end)

1. **Login page** → `POST /api/login`
   - internal: `{ mode: 'internal', username, password, channelScope }`
   - supplier: `{ mode: 'supplier', company, vcode, phone }` (OTP simulated —
     any phone accepted)
2. **Server**
   - internal: look up `users` by username, `bcrypt.compare` the password
     (seeded `admin` / `admin123`). On success, insert a `sessions` row with
     `auth_type='internal'`, `scope_json={ channelScope, role }`.
   - supplier: no password; insert a `sessions` row with `auth_type='supplier'`,
     `supplier_json={ company, pan, vcode }`.
   - respond `{ token, auth }` where `auth` is the exact shape `authSlice`
     needs (`authType`, `channelScope`, `role`, `supplierQuery`, `supplierPAN`,
     `supplierLoginVcode`, `currentUser`).
3. **Client** stores `token` in `localStorage`, dispatches `authSlice` state,
   calls bootstrap, routes to `/app/invoices` or `/supplier/home`.
4. **Reload** → app mount reads `localStorage` token, calls `GET /api/me`.
   Valid → rehydrate auth + bootstrap. Missing/invalid → `ProtectedRoute`
   redirects to `/login`.
5. **Identity switcher** (Topbar) keeps working on local state only — it does
   not create a new session (documented: it's a demo convenience that re-scopes
   the current session view).
6. **Logout** → `POST /api/logout` deletes the `sessions` row, client clears
   `localStorage`, resets auth slice, `RedirectIfLoggedIn`/`ProtectedRoute`
   send the user to `/login`.

## Testing

### Existing suite (`src/__tests__/app.test.jsx`, 27 tests)

Runs without the server. A new test helper seeds the store: dispatch `hydrate`
actions with fixture data (imported from `src/data/*`) and call
`setRuntimeData()` before rendering. The `msw` route is not needed because
thunks are the only thing hitting `fetch`, and tests can dispatch the `*Local`
reducers directly or stub `api`. Assertions and flows are otherwise unchanged.

### New server tests (`server/__tests__/`)

- `POST /api/login` with correct creds → 200 + token
- `POST /api/login` with wrong password → 401, no session row
- `GET /api/me` with valid / invalid token
- `POST /api/logout` → session row gone, subsequent `/api/me` → 401
- `POST /api/tickets` then re-open DB → ticket present (persistence)
- `PATCH /api/invoices/:no` stage move survives reconnect

### Manual demo checklist

`npm run seed && npm run dev:all`, then: login as admin → see invoices from DB →
raise a ticket → drag it on the Kanban board → toggle a permission → restart
`npm run server` → reload → all changes still there → logout → redirected to
login → back button does not re-enter the app.

## Known limitations (acceptable for demo)

- Optimistic writes with no rollback on API failure (toast only).
- Sessions never expire server-side (deleted only on logout).
- Supplier OTP is not sent or verified.
- Identity switcher re-scopes locally without a new session.

## Rollout notes

- Repo is now under git; pushed to `origin/frontend`.
- `server/.env` added to `.gitignore`. A committed `server/.env.example` documents
  the required keys with placeholder values.
- MySQL must be running before `npm run seed` / `npm run server`. Connection
  target: `localhost:3306`, database `mahindra_i2p` (created by the seed script).
- `mysql2` and `bcryptjs` are pure JS — no native build step on Windows.
- If the seed cannot connect, it exits with a clear message pointing at
  `server/.env`.
