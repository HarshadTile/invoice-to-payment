# Invoice-to-Payment Tracker — Backend

FastAPI service backing the [frontend](../frontend). Invoice data is read
straight from `data/gcp_invoice_data.xlsx`; everything else (login accounts,
tickets, settings, the audit log) lives in a SQL database.

## Requirements

- Python 3.11+
- Either MySQL 8+/9 running locally, **or** no database server at all (use
  SQLite — see below). There's no seeded database or `.env` committed to this
  repo, so a fresh checkout needs both of the one-time steps below before
  anything will show data.

## First-time setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 1. Point the app at a database

Copy `.env.example` to `.env` and set `DATABASE_URL` there — it's read
automatically on startup (`app/core/database.py`) and gitignored, so a real
password never needs to be typed into a terminal or committed anywhere:

```powershell
copy .env.example .env
notepad .env
```

The code falls back to MySQL (`mysql+pymysql://root:root@localhost:3306/mahindra_i2p`)
if `.env` doesn't exist and `DATABASE_URL` isn't set some other way. If you
don't have MySQL, use a local SQLite file instead — no server needed:

```
DATABASE_URL=sqlite:///./data/app.db
```

`data/app.db` is created automatically on first use and is not (and should
not be) committed to git.

To use MySQL, create the database first:

```powershell
mysql -u root -p < sql/create_database.sql
```

(see [sql/create_database.sql](sql/create_database.sql) — it also has an
optional, commented-out section for creating a dedicated app user instead of
using root). Then put your real connection string in `.env`, URL-encoding any
special characters in the password (`@` → `%40`, `:` → `%3A`, etc).

If you'd rather not keep it in a file (e.g. a one-off terminal session), you
can still set `$env:DATABASE_URL = "..."` before running a command instead —
that overrides `.env` for that terminal only.

### 2. Build the schema

```powershell
alembic upgrade head
```

Creates every table (`users`, `tickets`, `settings`, ...) via the migration
in `alembic/versions/`. The app itself no longer creates tables on startup —
this is the one required step on a fresh database. See
[Database migrations](#database-migrations-alembic) below for how this works
and how to add a migration when a model changes.

### 3. Create your first login account

```powershell
python seed_admin.py
```

Creates the `admin` user with the Admin role (HQ / all channels) and a
randomly generated password, printed once to the console — save it before
you lose it. Safe to run again — it does nothing if the username already
exists. Pass your own values (including a password of your choosing) to
create a different account: `python seed_admin.py <username> <password>
<name> <email> [role]`.

### 4. Run it

```powershell
uvicorn app.main:app --reload --port 8000
```

- API: http://127.0.0.1:8000
- Interactive docs: http://127.0.0.1:8000/docs
- Health check: http://127.0.0.1:8000/health

The frontend expects this on port 8000 and proxies `/api/v1` to it — see
[../frontend/README.md](../frontend/README.md) for its own setup, in
particular the `VITE_USE_FASTAPI_INVOICES=true` environment variable it needs
to actually call this backend instead of a different, unrelated server.

## Tests

```powershell
$env:DATABASE_URL = "sqlite:///./data/app.db"
pytest
```

The suite creates its own throwaway accounts (`users_api_admin`,
`users_api_viewer`, `temp_user_*`) directly in whatever database
`DATABASE_URL` points at and doesn't fully clean up after itself. Don't run
it against a database you care about — point it at a scratch SQLite file if
you want to keep your local dev data clean:

```powershell
$env:DATABASE_URL = "sqlite:///./data/test.db"
pytest
```

## Database migrations (Alembic)

Schema is owned entirely by Alembic (`alembic/`) — the app never creates or
alters tables itself. `DATABASE_URL` is read the same way as the app's own
(`.env`, or an explicit `$env:DATABASE_URL` for that terminal); there's
nothing to configure separately in `alembic.ini`.

```powershell
alembic upgrade head        # bring the current database up to date
alembic current             # what revision is this database on?
alembic history             # list all migrations
```

**When you change a model** (add a column, a table, etc.), generate a
migration and commit it alongside the model change:

```powershell
alembic revision --autogenerate -m "add foo to users"
```

Read the generated file in `alembic/versions/` before applying it —
autogenerate is usually right but doesn't always guess renames or data
migrations correctly. Then `alembic upgrade head` to apply it, on every
database (yours, a teammate's, production).

**If a database already had these tables before Alembic was introduced**
(this repo's own dev databases did, created by the old `create_all()`), don't
run the initial migration against it — that would try to create tables that
already exist. Mark it as already up to date instead, without touching its
schema:

```powershell
alembic stamp head
```

**Known drift:** this project's MySQL database (`mahindra_i2p`) predates
Alembic and still has a few tables from an earlier, unrelated Express-based
version of this app (`sessions`, `invoices`, `integrations`,
`ticket_activity`) that no current model defines, plus a couple of
nullable/type mismatches on older columns. `alembic check` will flag these.
They don't affect the app (nothing here reads or writes them), but if you
want a migration that cleans them up, generate one deliberately rather than
blindly applying whatever `--autogenerate` proposes, since it will also
suggest dropping those tables.

## User management and roles

- Accounts, roles and portal (channel) access are managed from the app itself
  — Settings → Users, once signed in as a role with the `manageUsers`
  capability (Admin, by default).
- Every account except Admin must be assigned exactly one portal
  (Msetu/SRM, PO Portal or MFOX Portal); Admin always has access to all of
  them. This is enforced server-side in `app/api/v1/users.py` and
  `app/api/v1/auth.py`, not just hidden in the UI.
- User management actions (create/update/remove/reset password) are written
  to the Settings → Audit Logs table.
