# Project Guide — Mahindra Invoice-to-Payment (I2P) Tracker

Working reference for bug-fix and improvement sessions. Generated from a full scan of the repo on 2026-11-10 (branch `main`, HEAD `f4dd40f`). Companion docs: [backend/README.md](backend/README.md), [frontend/README.md](frontend/README.md), [docs/api-reference.md](docs/api-reference.md), [docs/po-portal-mapping.md](docs/po-portal-mapping.md).

---

## 1. What it is

A web app that lets Mahindra staff and suppliers track a supplier invoice from upload → approval → SAP (MIRO) booking → payment (UTR/clearing), plus an **Inquiry Desk** (ticketing with SLAs) for invoice queries.

Three kinds of users:

| User | Sign-in | Sees |
|---|---|---|
| **Admin / HQ** | username + password | every channel, all settings |
| **Internal team** (Invoice Team L1/L2/L3 + custom roles) | username + password | exactly one assigned portal (channel); pages gated by role capabilities |
| **Supplier** | email + password (managed accounts) — *and a legacy vendor-code login, see Risks* | only their assigned vendor codes' invoices and tickets |

Channels (portals): **Msetu/SRM** (`msetuSrm`), **PO Portal** (`poPortal`), **MFOX Portal** (`mfoxPortal`, disabled by default), and a hidden legacy **Manual** channel. Admins can switch portals on/off in Settings → Integrations.

---

## 2. Tech stack

| Layer | Tech |
|---|---|
| Backend | Python 3.11+ (venv currently on 3.14), FastAPI, SQLAlchemy, Alembic, PyMySQL, pydantic 2, PyJWT, passlib+bcrypt, openpyxl, httpx, truststore |
| Database | MySQL 8/9 (`mahindra_i2p`); SQLite only in isolated tests |
| Frontend | React 19, Redux Toolkit (+ RTK Query), react-router 7, Vite 8, Vitest 5 + Testing Library, oxlint |
| Invoice data | **Not in the DB.** Read from Excel/CSV files (`INVOICE_SOURCE=file`) or the internal BigQuery query API (`INVOICE_SOURCE=api`), held in memory + snapshot cache |
| Email | SMTP (setup/reset links, supplier decisions) sent on a background thread |

---

## 3. Repository layout

```
invoice-to-payment/
├─ backend/
│  ├─ app/
│  │  ├─ main.py            FastAPI app, routers under /api/v1, error handlers, startup jobs
│  │  ├─ api/deps.py        get_current_user (canonical identity), ticket access guard
│  │  ├─ api/v1/            routers: auth, users, suppliers, supplier_requests, invoice,
│  │  │                     workspace, tickets, settings, notifications, sync_log
│  │  ├─ core/              security (JWT/bcrypt), permissions (role matrix), channels,
│  │  │                     bigquery_api, email(+templates), rate_limit, audit, database
│  │  ├─ models/            user, supplier, settings, ticket, ticket_activity, sync_log
│  │  ├─ repositories/      srm_invoice, po_portal_invoice, api_snapshot, workbook_cache,
│  │  │                     ticket_repository
│  │  ├─ services/          business logic (see §5)
│  │  ├─ schemas/           pydantic request/response models
│  │  └─ jobs/ticket_jobs.py  background SLA / housekeeping jobs
│  ├─ alembic/versions/     21 migrations (MySQL-specific; chain has several merge/"restore" fix-ups)
│  ├─ tests/                api/, core/, models/, repositories/, schemas/, services/ (needs MySQL)
│  ├─ isolated_tests/       SQLite-based feature tests (no MySQL needed)
│  ├─ data/                 invoice extracts (all gitignored; local only)
│  ├─ seed_admin.py         creates first Admin (random password printed once)
│  └─ .env.example
├─ frontend/
│  ├─ src/
│  │  ├─ routes/            AppRoutes.jsx (route tree) + ProtectedRoute.jsx guards
│  │  ├─ pages/             one file per screen; pages/settings/, pages/supplier/
│  │  ├─ components/        layout, invoices, modals, common, dashboard, login, audit
│  │  ├─ features/          Redux slices: auth, ui, settings, tables, bootstrap; invoice logic
│  │  ├─ api/               RTK Query APIs (tickets, notifications, invoicesQuery) + fetch client
│  │  ├─ utils/             pure logic: invoiceQuery (search/filter), srm/poPortal workspace,
│  │  │                     fiscalYear, csv/export, notifications, tickets…
│  │  ├─ data/constants.js  channel definitions, stage lists, status chips, role seed
│  │  ├─ test/              apiMock.js, renderApp.jsx, fixtures/
│  │  └─ theme.css (1.8k lines), layout.css, pages/login.css
│  └─ public/user-manual/   4 PDF manuals served to the login Help menu
├─ docs/                    api-reference, po-portal-mapping, gcp field review, demo-script,
│                           testing (manual test-case xlsx + generator), user-manual (docx + builder)
└─ .claude/settings.local.json
```

---

## 4. How to run

**Backend** (`backend/`)
```powershell
.\.venv\Scripts\Activate.ps1
copy .env.example .env          # set DATABASE_URL, SMTP_*, FRONTEND_URL, INVOICE_SOURCE
alembic upgrade head            # schema is owned by Alembic only
python seed_admin.py            # first Admin
uvicorn app.main:app --reload --port 8000     # docs at /docs, health at /health
```

**Frontend** (`frontend/`)
```bash
npm install
cp .env.example .env.local      # VITE_USE_FASTAPI_INVOICES=true is REQUIRED
npm run dev                     # http://localhost:5173, proxies /api/v1 -> 127.0.0.1:8000
npm run test | npm run lint | npm run build
```

**Tests**
- Frontend: `npx vitest run` → **58 files / 343 tests pass** (~60 s).
- Backend isolated (no MySQL): command in backend README → **72 passed, 1 skipped**.
- Full backend suite (`pytest`) drops/recreates the fixed MySQL DB `mahindra_i2p_test` — only run when that DB is disposable. *Not run in this scan.*
- Lint: `npx oxlint` currently reports warnings only (unused imports/vars, e.g. `RolesTab.jsx`, `LoginPage.jsx`).

---

## 5. Backend architecture

**Request flow:** router (`api/v1`) → `deps.get_current_user` (verifies JWT, re-loads user/supplier from DB every request) → service → repository/model. Errors are normalised to `{"error": {"code", "message"}}` in `main.py`.

**Auth & identity**
- JWT HS256, 7-day expiry (`core/security.py`). `auth_type` is `internal` or `supplier`.
- Internal tokens carry a `channelScope`; `get_current_user` re-checks it against the user's allowed channels each request.
- Managed supplier accounts: email+password, lockout after failed attempts, setup/reset one-time tokens (`supplier_setup_tokens`).
- Password setup/reset links for users: `password_reset_tokens`, configurable expiry (30 min … 7 days).

**Authorization**
- `core/permissions.py`: editable role→capability matrix stored in `settings.role_matrix_json`. Capabilities: `importExport, createTrace, manageConfig, manageUsers, manageRoles, viewAuditLog, manageSuppliers, viewSupplierVisibility, viewReports, viewLogs`. Admin always keeps `manageUsers/Config/Roles/Suppliers`.
- Ticket access is a separate axis: `ticket_role` ∈ ADMIN / CHANNEL_LEAD / ASSIGNEE (+ per-user `user_channel_access`). Internal users without a ticket role get 403 on Inquiry Desk.
- Supplier scoping is applied server-side from the token's vendor codes; deleted ("Entry Deleted") invoices are hidden from suppliers.

**Invoice data pipeline**
- `repositories/srm_invoice.py` / `po_portal_invoice.py` map raw rows → status + API shape. Status precedence is documented in api-reference.md and po-portal-mapping.md.
- File mode: workbook parsed once per process, compressed JSON snapshot in `data/.invoice-cache/` validated by SHA-256.
- API mode: parallel paged `SELECT`s to the BigQuery API, snapshot for fast restarts, `services/invoice_refresh.py` refreshes hourly in the background (`INVOICE_REFRESH_MINUTES`).
- `services/invoice_index.py` + `invoice_query.py` do filtering/paging/summary server-side; `invoice_export.py` exports.
- `InvoiceSourceError` → HTTP 503 `SOURCE_UNAVAILABLE`.

**Tickets (Inquiry Desk):** `ticket_service.py` (largest file, 675 lines) + `ticket_state_machine.py`, `sla_service.py`, `ticket_permissions.py`, `attachment_service.py`, optimistic `row_version`, idempotency key on create; `jobs/ticket_jobs.py` runs SLA jobs on startup.

**Suppliers:** `supplier_service.py`, `vendor_directory.py` (search vendors from invoice data), `api/v1/supplier_requests.py` (public "request an account" + vendor-code change requests with approve/reject workflow and match report).

**Other:** notifications (per-user, ticket-scoped + supplier request alerts), audit log (`core/audit.py`, Settings → Audit Logs), generic editable tables (`table_rows`, `/tables/{key}`), in-memory rate limiter for public supplier endpoints.

### Database tables (current models)
`users`, `user_channel_access`, `otp_codes` (legacy), `password_reset_tokens`, `suppliers`, `supplier_vendor_codes`, `supplier_setup_tokens`, `supplier_access_requests`, `settings` (role matrix, link expiries, channel availability), `table_rows`, `tickets`, `ticket_comments`, `ticket_activity`/attachments, `sync_log`, plus audit-log storage.

---

## 6. Frontend architecture

- **Bootstrap:** `features/bootstrap/Bootstrapper` + `hydrateThunks` load `/load-workspace-data` (settings, tables, roles) after login; RTK Query (`api/`) handles tickets, notifications and server-paged invoices (`invoicesQueryApi`, `useServerInvoiceTable`).
- **State:** slices `auth`, `ui`, `settings`, `tables` + three RTK Query reducers (`store.js`).
- **Routing** (`routes/AppRoutes.jsx`): public (`/login`, `/forgot-password`, `/reset-password`, `/supplier/setup`, `/supplier/request-access`); internal `/app/*` guarded by `RequireInternal` → `RequireCapability` / `RequireHQ` / `RequireOwnChannel` / `RequireTicketAccess`; supplier `/supplier/*` guarded by `RequireSupplier`.
- **Key screens:** Invoice Tracking (channel workspaces: `SrmWorkspace`, `PoPortalWorkspace`), Search Invoice, Supplier Visibility, Vendor Code page, Inquiry Desk (list + board + `TicketDetailPage`), Reports, Global Logs, Settings (Users / Roles / Integrations / Audit Logs), Suppliers management, Notifications, Profile; supplier Dashboard / My Invoices / Logs / Tickets.
- **Business logic lives in `utils/` and `features/invoices/`** as pure functions with co-located `*.test.js` files; full-app tests in `src/__tests__/app/` use `test/apiMock.js`.
- **Env switches:** `VITE_USE_FASTAPI_INVOICES` (required), `VITE_DISABLE_AUTH` (dev-only auth bypass — `AUTH_BYPASS`).

---

## 7. Current working-tree state (uncommitted)

11 modified files + untracked `.vscode/`, `docs/demo-script.md`, `frontend/src/utils/notifications.test.js`, `backend/data/tbl_dw_inv_paymt_PO_PORTAL.xlsx`. Theme: supplier access-request notifications (`notification_service.py`, `supplier_requests.py`, `suppliers.py`, `supplier_service.py`, `NotificationsPage.jsx`, `notifications.js`) and a `ColumnChart` / `theme.css` tweak. Both test suites pass with these changes. Review/commit them deliberately before starting new work.

Recent history (79 commits): supplier dashboard "Total Invoices" tile amount removal ×3, login Help dropdown, BigQuery server-side loading, supplier access requests, SRM/PO Portal mapping.

---

## 8. Findings — candidate bugs & improvements

Severity: 🔴 security/correctness, 🟠 reliability/maintainability, 🟡 polish. Not yet verified by fixing; each needs confirmation when picked up.

### 🔴 Security
1. ~~Hard-coded JWT secret~~ — **Fixed (branch `security/pre-vapt`):** key now comes from `JWT_SECRET_KEY`; startup fails if missing/placeholder/<32 chars.
2. ~~Passwordless supplier login~~ — **Fixed:** `/auth/supplier/login` removed; old vendor-code tokens are rejected with 401.
3. ~~CORS `*` with credentials~~ — **Fixed:** explicit origin list (`FRONTEND_URL` + `CORS_ORIGINS`), credentials off, limited methods/headers.
4. ~~Rate limiter trusts `X-Forwarded-For`; no login rate limit/lockout~~ — **Fixed (step 3):** IP from the connection only (uvicorn `--proxy-headers` behind a proxy), per-IP login limit, 5-strike/15-min lockout for staff, generic failure reply (no account enumeration, constant timing).
5. ~~7-day non-revocable tokens~~ — **Fixed (step 3):** 8-hour tokens (`ACCESS_TOKEN_EXPIRE_MINUTES`); logout and password reset end sessions server-side (`session_version`); every request re-checks the account, so a **deactivated user is cut off at once** (previously invoice endpoints accepted their token until expiry). `/docs` off unless `ENABLE_API_DOCS=true`; security headers on all API responses.
6. **`VITE_DISABLE_AUTH`** bypass exists in production code paths (`AUTH_BYPASS`); make sure it's stripped/ignored in production builds.

### 🟠 Reliability / correctness
7. **`datetime.utcnow()` used in 45 places** (deprecated in 3.12+, naive datetimes). Migrate to timezone-aware UTC; watch token-expiry comparisons.
8. **Deprecated FastAPI `@app.on_event`** in `main.py` — switch to `lifespan`.
9. **Docs out of date:** `frontend/README.md` still says supplier sign-in has "no password", lists a `features/tickets/` slice (replaced by RTK Query in `api/ticketsApi.js`), describes a "live identity switcher" and `src/data` seed data, none of which match the current code; `backend/README.md` and `docs/po-portal-mapping.md` say PO Portal reads a `.csv` but an untracked `.xlsx` was added beside it; README references `data/tbl_dw_inv_paymt_SRM.xlsx` (gitignored — fresh clones can't run file mode).
10. **`vite.config.js` still proxies `/api` → `localhost:3001`** (the old Express server). Dead config; any call without the `/v1` prefix silently fails.
11. **`requirements.txt` hygiene:** unpinned `sqlalchemy`, `pymysql`, `pyjwt`, `email-validator`; test deps (`pytest`) mixed with runtime; blank line + mixed encoding. Pin versions.
12. **Migration chain is messy** (merge, "restore", "reconcile legacy" revisions; MySQL-only SQL). A fresh `alembic upgrade head` on a blank DB should be verified end-to-end and `alembic check` drift (legacy `sessions`, `invoices`, `integrations` tables) cleaned up deliberately.
13. **Tests depend on MySQL by default** (`pytest` drops a fixed DB). Make the SQLite isolated path the default or add CI config so tests can't hit a real DB.
14. **Large in-memory dataset per process** — multi-worker deployment would duplicate memory and refresh jobs, and the rate limiter wouldn't be shared. Document single-worker constraint or externalise.
15. ~~Generated/real data in the repo~~ — **Done:** `gcp_invoice_data.xlsx` (old test data) removed from git; all extracts incl. `PO_PORTAL.xlsx` are now gitignored.

### 🟡 Frontend polish
16. **Lint warnings:** unused imports/variables in `RolesTab.jsx` (`Search`, `Users`, `navigate`, `capLabel`, `granted`), `LoginPage.jsx` (`notify`), and fast-refresh warnings in `InvoiceFilterBar.jsx`, `SupplierRequestPage.jsx`.
17. **`theme.css` is a single 1,849-line stylesheet** — hard to maintain; consider splitting per feature.
18. **Test speed:** jsdom is re-created per file (156 s of 60 s wall); Vitest suggests `pool: 'vmThreads'` / `isolate: false`.
19. **Dead/legacy code to confirm and remove:** hidden "Manual" channel stages/views in `constants.js`, `otp_codes` model, legacy `Deleted` status aliases, compatibility-alias routes hidden from OpenAPI, `/app/sync-log` redirect (Sync Log page removed but backend `sync_log` router/model remain).
20. **Recent churn:** the supplier "Total Invoices" tile was edited 3 times in 3 commits — worth confirming the intended final design (amount removed / "No amount on record").

### Suggested priority order
1. Items 1–3 (secret, passwordless supplier login, CORS) — small changes, big risk reduction.
2. Item 4–5 (login rate limit / token lifetime).
3. Commit or discard the current working-tree changes (§7).
4. Items 7–8, 11, 13 (maintenance).
5. Doc refresh (9, 10) and lint cleanup (16).

---

## 9. Conventions observed
- Backend: thin routers, logic in `services/`, DB access in repositories/models; errors as `HTTPException` with `{"error":{code,message}}` bodies; every state-changing admin action writes an audit row.
- Frontend: pure logic in `utils/`, selectors via `createSelector`, tests co-located (`X.test.js`, `X.aspect.test.jsx`), no demo accounts baked in.
- Commits: short imperative subject lines, one concern each (see `git log`).
- Windows/PowerShell dev environment; MySQL local; Alembic owns schema changes (generate a migration with every model change).

## 10. Open questions for the owner
- Is the passwordless vendor-code supplier login still required by anyone (demo/UAT)?
- Deployment target (single process vs multiple workers; HTTPS domain for `FRONTEND_URL`)?
- Should MFOX Portal and Manual channels be built out or removed?
