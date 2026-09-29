# Mahindra I2P — Invoice to Payment Tracker

A complete React + Redux application for tracking supplier invoices end-to-end —
from upload through approval, booking, and payment — across four processing
channels (Msetu/SRM, PO Portal, Manual, MFOX Portal).

Built with Mahindra's brand identity: the red used throughout (`#DD052B`) is
lifted directly from mahindra.com; the logo is used as supplied.

## Getting started

This app is a Vite + React frontend talking to a **FastAPI backend** in
[../backend](../backend) — start that first (see its own README for
first-time setup: creating a database, seeding a login account).

```bash
npm install
cp .env.example .env.local   # then check VITE_USE_FASTAPI_INVOICES=true
npm run dev
```

`.env.local` is required, not optional — without `VITE_USE_FASTAPI_INVOICES=true`
the app tries to call a different, unrelated server for invoices/dashboard
data and renders blank. It's gitignored (one per machine), which is why a
fresh checkout doesn't already have it.

Other scripts:

```bash
npm run build   # production build to /dist
npm run test    # client test suite (Vitest + RTL)
npm run lint    # oxlint
```

### Authentication

Sign in with the account you (or an admin) created via the backend's
`seed_admin.py` or Settings → Users. There's no demo/seed account baked into
this frontend — if login fails, the backend most likely has no accounts yet.
Supplier sign-in accepts any vendor code today (no password); see
[../backend/README.md](../backend/README.md) for details on that and on the
role/portal model.

## Backend

The FastAPI service in [../backend](../backend) owns everything except the
invoice register itself, which it reads directly from an Excel file:

| Data | Source |
|---|---|
| Invoices | `backend/data/gcp_invoice_data.xlsx` (read on request, not cached in a DB) |
| Login accounts, roles, portal access | `users` table |
| Tickets, editable Settings grids, audit log, sync log | SQL tables, written on every change |

The React app loads everything once after login (`GET /v1/workspace` plus a
few FastAPI invoice endpoints) and writes changes straight back, so they
survive a restart. The full endpoint list is in [docs/API.md](docs/API.md) —
note it may describe an earlier prototype's endpoint shapes in places; the
backend's own code and `/docs` (Swagger UI at `http://127.0.0.1:8000/docs`)
are the source of truth.

### Access control (enforced by the API, not just the UI)

- A **supplier** session only ever receives its own vendor code's invoices and
  the tickets on them; internal-only fields (approver IDs, etc.) are stripped
  from what it's sent.
- Internal writes are checked against the role matrix: moving an invoice,
  editing a ticket, and editing the Settings tables need `editRows`; managing
  users needs `manageUsers`.
- Every account is locked to one portal (channel) except Admin, which has all
  of them; this is enforced at login and when an admin assigns a role, not
  just hidden in the UI.

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
