# Mahindra I2P — Invoice to Payment Tracker

A complete React + Redux application for tracking supplier invoices end-to-end —
from upload through approval, booking, and payment — across four processing
channels (Msetu/SRM, PO Portal, Manual, MFOX Portal).

Built with Mahindra's brand identity: the red used throughout (`#DD052B`) is
lifted directly from mahindra.com; the logo is used as supplied.

## Getting started

Requires a local **MySQL 8+/9** server running on `localhost:3306`.

```bash
npm install
cp server/.env.example server/.env     # then edit DB_PASSWORD to match your MySQL
npm run seed                           # creates the `mahindra_i2p` database + demo data
npm run dev:all                        # API on :3001 + Vite web app together
```

Other scripts:

```bash
npm run server       # API only
npm run dev          # web only (expects the API already running)
npm run build        # production build to /dist
npm run test         # client test suite (Vitest + RTL)
npm run test:server  # server test suite (local MySQL, separate `mahindra_i2p_test` database — demo data is never touched)
npm run lint         # oxlint
```

### Authentication and data provisioning

The seed command creates the schema and clears application tables. It does not
insert demo invoices, tickets, or settings. For local development only, it
creates one temporary administrator account: `admin` / `admin@123`. This
account can select either All Channels or Internal Team. Provision real
internal users and supplier/vendor records through your deployment or data
import process before production use. Supplier access has no password in this
prototype; the vendor code must already exist in FastAPI and is resolved
server-side.

## Database

A small Express API (`server/`) owns a MySQL database, `mahindra_i2p`:

| Table | Holds |
|---|---|
| `users`, `sessions` | login accounts (bcrypt) and active bearer-token sessions |
| `invoices` | the invoice register, plus `stage_index` for stage moves |
| `tickets`, `ticket_comments`, `ticket_activity` | the inquiry desk |
| `table_rows` | the editable Settings grids (users, notification rules, audit) |
| `settings`, `sync_log`, `integrations` | role matrix, 2FA, sync history, connectors |

The React app loads everything once after login (`GET /api/workspace`) and every
in-app change (raise a ticket, drag a Kanban card, toggle a permission, advance
an invoice stage) is written straight back to MySQL, so it survives a restart.
Re-run `npm run seed` at any time to reset to the demo dataset.

The full endpoint list is in [docs/API.md](docs/API.md).

### Access control (enforced by the API, not just the UI)

- Sessions are bearer tokens that expire after 12 hours (`SESSION_TTL_HOURS`).
- A **supplier** session only ever receives its own vendor code's invoices and the
  tickets on them; it can raise tickets and reply on those, and nothing else.
- Internal writes are checked against the role matrix stored in the database:
  moving an invoice, editing a ticket, and editing the Settings tables need
  `editRows`; changing the role matrix needs `manageUsers`.
- The Internal Team scope is applied server-side to the dashboard aggregates too.
- The top-bar identity switcher is still a demo convenience: it only re-scopes the
  *view*. The server keeps enforcing the permissions of the session you signed in with.

## What's in it

- **3 login contexts**: HQ/Admin (sees everything), Internal Team (scoped to
  three of the four channels, no Manual, no HQ-only pages), and Supplier
  (scoped to exactly one vendor code — never a sibling code under the same PAN).
- **Invoice tracking** across 4 channels, each with its own real stage list,
  sub-views (Approver Assignment, SAP Booking, Payment & UTR, etc.), search,
  and history.
- **Supplier Visibility**: browse any supplier's vendor codes and see every
  invoice against each one, individually or consolidated.
- **Stage moves**: open any invoice (Invoice Tracking → click the invoice number)
  and use *Move to next stage* to step it Uploaded → Pending Approval → Approved →
  Booked → Payment Due → Paid (Paid asks for the UTR). Saved to MySQL immediately.
- **Inquiry Desk**: a full ticketing system with SLA tracking, list and Kanban
  board views (drag a card to change its status), threaded replies, and a
  complete activity audit log.
- **Reports, Sync Log, and a global Logs/History audit trail** with CSV export.
- **Settings**: role/permission matrix, user management, notification rules,
  audit logs, integration status — all with proper role-based access control.
- **Live identity switcher** in the top bar: flip between HQ, Internal Team,
  or any supplier vendor code without logging out, and every page instantly
  re-scopes.

## Architecture

```
src/
  data/            Static seed data (invoices, tickets, channel definitions)
  utils/           Pure business logic (stage progress, SLA breach, PAN/vendor
                    code identity, CSV export) — framework-agnostic, unit-testable
  app/store.js     Redux store configuration
  features/
    auth/          Login/logout/identity-switch slice + role-permission selector
    tickets/       Full ticket lifecycle slice (create, comment, status, assignee)
    tables/        Generic editable-table slice (used by Users, Notifications, etc.)
    settings/      Role permission matrix slice
    ui/            Navigation, modals, toasts, filters, search, pagination
  components/      Reusable UI: layout (Sidebar/Topbar), tables, charts, modals
  pages/           One file per route
  routes/          React Router route tree + role-based route guards
```

State management follows standard Redux Toolkit conventions: one slice per
domain, memoized selectors (`createSelector`) wherever a selector derives a
new array, and all business rules live in plain, tested functions under
`utils/` rather than inside components.

## Testing

`src/__tests__/app.test.jsx` exercises the application end-to-end with
React Testing Library: both login flows, every navigation destination for
every role, every modal, ticket creation and replies, the Kanban board,
identity switching, permission toggles, user CRUD, invoice stage moves, and
route guards. The server suite (`npm run test:server`) covers login/logout,
session expiry, per-role and per-supplier access control, persistence and
concurrent ticket creation.

## Notes on scope

This app fixes one issue found while reviewing the reference prototype it was
built from: that prototype had extensive code for a "single-channel-scoped"
internal login that was never actually reachable through any UI control. That
dead code path has been removed here; the only two internal scopes — *All
Channels* and *Internal Team* — are the ones the login screen and identity
switcher actually offer, and both are fully wired and tested.
