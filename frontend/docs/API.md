# API reference

Base URL `/api` (Vite proxies it to the Express server on `:3001`). Every endpoint
except `POST /auth/login` and `GET /health` needs `Authorization: Bearer <token>`.
Errors are `{ "error": "message" }` with the status shown below.

**Roles:** *any* = any signed-in session · *internal* = HQ / Internal Team logins
(not suppliers) · `editRows` / `manageUsers` / `manageConfig` = capability in the
role matrix (Settings → Roles & Permissions).

## Auth — `/api/auth`

| Method & path | Who | Purpose | Errors |
|---|---|---|---|
| `POST /auth/login` | public | Sign in. Body `{ mode:'internal', username, password, channelScope }` (`username` may be the username or the account e-mail; the returned `auth.currentUser.name` is the login ID when signed in by username, the full name when signed in by e-mail) or `{ mode:'supplier', vcode }`. Returns `{ token, auth }`. | 400 missing vendor code · 401 bad credentials / unknown vendor code · 403 non-Admin using All Channels |
| `POST /auth/logout` | any | Ends the session (token stops working immediately). | 401 |
| `GET /auth/me` | any | Current session as `{ auth }` (used to restore a session on reload). | 401 |

## Workspace & dashboard

| Method & path | Who | Purpose |
|---|---|---|
| `GET /workspace` | any | Everything the app loads once after sign-in: invoices, tickets, editable tables, settings, sync log. Suppliers only receive their own vendor code's data. |
| `GET /dashboard/summary` | any | KPI counts + invoices-by-channel + invoices-by-status. Optional `?scope=internalTeam`. |
| `GET /dashboard/latest-invoices?count=5` | any | The newest `count` invoices (1–25, default 6). Optional `?scope=internalTeam`. |

## Invoices — `/api/invoices`

| Method & path | Who | Purpose | Errors |
|---|---|---|---|
| `GET /invoices` | any | Invoices visible to the caller (supplier: own vendor code; Internal Team: its channels). | |
| `PATCH /invoices/:no` | `editRows` | Move an invoice: body `{ status?, utr?, stageIndex? }`. Stage position is re-derived from `status`. | 400 unknown status / empty body · 404 · 403 |

## Tickets (Inquiry Desk) — `/api/tickets`

| Method & path | Who | Purpose | Errors |
|---|---|---|---|
| `GET /tickets` | any | Tickets visible to the caller. | |
| `POST /tickets` | any | Raise a ticket `{ no, category, priority?, desc? }`. Raised-by comes from the session. Returns `{ ticket, seq }`. | 400 · 404 unknown invoice · 403 not your invoice |
| `POST /tickets/:id/comments` | any | Reply `{ author, text }`. A supplier reply reopens a Resolved ticket; an internal reply picks up an Open one. | 400 · 404 · 403 not your ticket |
| `PATCH /tickets/:id` | `editRows` | Change `status`, `priority`, `assignee`, `resolvedDate`, and append `activity` entries. | 404 · 403 |

## Settings & editable tables

| Method & path | Who | Purpose | Errors |
|---|---|---|---|
| `GET /settings` | any | Role matrix, 2FA flag, sender e-mail, integrations. | |
| `PUT /settings` | internal | Body `{ roleMatrix?, twoFactorOn?, senderEmail? }`. `roleMatrix` needs `manageUsers`; `senderEmail` needs `manageConfig`. | 403 |
| `GET /tables/:tableKey` | internal | Rows of an editable grid (`settings-users`, `settings-notifications`, `settings-audit`, channel sub-views). | 403 suppliers |
| `PUT /tables/:tableKey` | `editRows` | Replace the grid's rows `{ rows: [[...], ...] }`. | 403 |

## Health

| Method & path | Who | Purpose |
|---|---|---|
| `GET /health` | public | `{ ok: true }` — liveness check. |

Sessions expire after 12 hours (`SESSION_TTL_HOURS`).
