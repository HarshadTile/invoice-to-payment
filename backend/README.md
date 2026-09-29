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

To use MySQL, create the database first (`CREATE DATABASE mahindra_i2p;`)
and put your real connection string in `.env`, URL-encoding any special
characters in the password (`@` → `%40`, `:` → `%3A`, etc).

If you'd rather not keep it in a file (e.g. a one-off terminal session), you
can still set `$env:DATABASE_URL = "..."` before running a command instead —
that overrides `.env` for that terminal only.

### 2. Create your first login account

```powershell
python seed_admin.py
```

Creates `admin` / `admin123` with the Admin role (HQ / all channels). Safe to
run again — it does nothing if the username already exists. Pass your own
values to create a different account: `python seed_admin.py <username>
<password> <name> <email> [role]`.

### 3. Run it

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
