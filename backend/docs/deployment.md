# Deployment (GCP Cloud Run)

For the CI/CD team. Two images, two Cloud Run services, one external database:

| Service | Image built from | Serves |
|---|---|---|
| Backend (FastAPI) | `backend/Dockerfile` | `/api/*`, `/health`, `/health/ready` |
| Frontend (React) | `frontend/Dockerfile` (+ `frontend/nginx.conf`) | everything else (the web app) |
| Database | not in Docker: **Cloud SQL for MySQL 8** | reached through `DATABASE_URL` |

The HTTPS load balancer sends **`/api/*` to the backend** and **everything else to the frontend**, on
one address. The frontend calls `/api/...` on its own address, so without that rule it can't work
(nginx answers `/api/*` with a 404 "NOT_ROUTED" to make a missing rule obvious).

## 1. Build

```bash
docker build -t <region>-docker.pkg.dev/<project>/<repo>/i2p-backend:<version>  backend/
docker build -t <region>-docker.pkg.dev/<project>/<repo>/i2p-frontend:<version> frontend/
```
- Backend: `python:3.14-slim`, all libraries install from ready-made wheels (no compilers). ~250 MB.
- Frontend: built with `node:24-alpine`, served by `nginxinc/nginx-unprivileged:1.27-alpine` (non-root,
  port 8080). ~50 MB. `VITE_USE_FASTAPI_INVOICES=true` is baked in at build time (build arg, default true).
- Neither image contains secrets or `.env` (see each `.dockerignore`). Pin base-image digests in CI if
  your policy requires it.

## 2. Database migrations (before each new backend version takes traffic)

Same backend image, different command, run once per deployment (e.g. a Cloud Run Job):
```bash
alembic upgrade head
```
It only applies what is new; with nothing new it does nothing. It is not in the container's start
command, so restarts and scaling never run it.

First deployment only, to create the first administrator (then change its password in the app):
```bash
python seed_admin.py <username> <password>
```

## 3. Backend service settings

| Cloud Run setting | Value | Why |
|---|---|---|
| Port | 8080 | the image listens on `$PORT` |
| Instances | **min 1, max 1** | background jobs (ticket SLA, email queue, invoice sync) and the sign-in rate limit live in the process |
| CPU | **always allocated** | those jobs run between requests |
| Memory | 2–4 GiB (4 GiB recommended) | invoice data is held in memory (~0.4–1 GB, more briefly during a sync) |
| Execution environment | gen2 | needed for the Cloud Storage volume mount |
| Startup probe | HTTP `GET /health` | the process is up in seconds |
| Request timeout | 300 s | large Excel exports |
| Ingress | internal + load balancer | only reachable through the load balancer |

**Volume**: mount the Cloud Storage bucket (e.g. at `/mnt/i2p-data`) and set
`INVOICE_CACHE_DIR=/mnt/i2p-data/invoice-cache` and `TICKET_ATTACHMENT_DIR=/mnt/i2p-data/attachments`.
The container's own disk is wiped on every restart; without the bucket, ticket attachments are lost and
every restart re-reads all invoices from BigQuery (1–2 minutes). The image runs as uid 10001: mount the
bucket so that user can write (gcsfuse mount options `uid=10001,gid=10001`).

**Readiness**: `/health/ready` answers 503 `"starting"` until the invoice data is loaded, then 200
`"ready"`. Normally seconds (from the saved data in the bucket). After a release that changes how
invoices are read, the saved data no longer matches and the first start reads BigQuery once (1–2 min).
Use it for monitoring/alerts (anything but `"ready"`), not as the startup probe.

### Settings files per environment

| `APP_ENV` | File read (if it exists) | Template in git |
|---|---|---|
| not set / `local` | `backend/.env` | `.env.example` |
| `dev` | `backend/.env.dev` | `.env.dev.example` |
| `uat` | `backend/.env.uat` | `.env.uat.example` |
| `prod` | `backend/.env.prod` | `.env.prod.example` |

The real files hold passwords, so they are gitignored and never in the image; only the templates are
committed. On Cloud Run set `APP_ENV` and the variables below on the service: a real variable always
wins over a file, so no file is needed there. Each template lists that environment's values (its own
SMTP server and sender, address, sync, bucket paths) with the secrets left empty.

### Environment variables

Secrets come from **Secret Manager**, the rest are plain variables.

| Variable | Secret | Value / note |
|---|---|---|
| `DATABASE_URL` | yes | `mysql+pymysql://<user>:<password>@<cloud-sql-private-ip>:3306/<db>` (URL-encode `@ : /` in the password) |
| `JWT_SECRET_KEY` | yes | random, ≥32 chars, one per environment (`python -c "import secrets; print(secrets.token_urlsafe(48))"`); the app refuses to start without it |
| `BIGQUERY_API_TOKEN` | yes | bearer token of the BigQuery query API |
| `SMTP_PASSWORD` | yes | company SMTP |
| `BIGQUERY_API_URL` | no | BigQuery query API address |
| `INVOICE_SOURCE` | no | `api` |
| `INVOICE_AUTO_SYNC` | no | `true` (approved by the GCP team, 18 Nov 2026), with `INVOICE_SYNC_TIMES=08:00` and `INVOICE_SYNC_UTC_OFFSET=+05:30`: daily at 8:00 am IST, an hour after their 6-7 am table load |
| `INVOICE_CACHE_DIR` | no | on the bucket, see above |
| `TICKET_ATTACHMENT_DIR` | no | on the bucket, see above |
| `FRONTEND_URL` | no | the public address, e.g. `https://i2p.example.com` (used in email links and CORS) |
| `CORS_ORIGINS` | no | not needed when frontend and API share the load balancer address |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_USE_TLS`, `EMAIL_FROM`, `EMAIL_FROM_NAME` | no | company SMTP (not a personal mailbox) |
| `ENABLE_API_DOCS` | no | leave unset (off) on servers |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | optional, default 480 |
| `LOGIN_ATTEMPTS_PER_IP` | no | optional, default 30 per 5 minutes |
| `AUDIT_RETENTION_DAYS` | no | optional, default 365 |
| `SUPPLIER_PASSWORD_MAX_AGE_DAYS`, `SUPPLIER_PASSWORD_REMINDER_DAYS` | no | optional, default 90 and 5: supplier password expiry (0 = off) and the reminder email that many days before |
| `INVOICE_STALE_AFTER_MINUTES`, `BIGQUERY_PAGE_SIZE`, `BIGQUERY_TIMEOUT`, `BIGQUERY_WORKERS`, `AUTO_CLOSE_DAYS` | no | optional tuning, defaults are fine |
| `SSO_TOKEN_DECRYPT_SECRET` | yes | CC Services decrypt key for **this** environment (from the CC Services team) |
| `SSO_ENABLED`, `SSO_LOGIN_URL`, `SSO_CC_SERVICES_LEGACY_ENABLED` | no | staff single sign-on; `SSO_LOGIN_URL` carries our app id and `env=DEV/UAT/PROD` |
| `SSO_CALLBACK_PATH` | no | default `/api/v1/auth/sso/callback`; register `FRONTEND_URL` + this path with CC Services |
| `SSO_TOKEN_PARAM`, `SSO_STATE_PARAM`, `SSO_TOKEN_KEY_ENCODING`, `SSO_TOKEN_MAX_AGE_SECONDS`, `SSO_*_FIELDS`, `SSO_COOKIE_SAMESITE` | no | optional, see `.env.example` |

Single sign-on is described in `app/services/sso_service.py`. SSO only signs in people who already
have an Active account here (matched by username = employee ID, then email); password login stays
available as a fallback.

Outbound network: the backend needs Cloud SQL (private IP, via Serverless VPC Access), the BigQuery
API host (HTTPS) and the SMTP server.

## 4. Frontend service settings

| Cloud Run setting | Value |
|---|---|
| Port | 8080 |
| Instances | min 0–1, max 2 (static files only) |
| Memory / CPU | 512 MiB / 1 vCPU is plenty |
| Startup probe | HTTP `GET /healthz` |
| Ingress | internal + load balancer |

nginx sends the security headers (CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, no server version),
caches `/assets/*` for a year (file names change on every build) and never caches `index.html`.
Any unknown path returns the app (`index.html`), so deep links like `/app/invoices` work on reload.

## 5. Checks after a deployment

1. `GET https://<address>/healthz` → `ok` (frontend) and `GET https://<address>/api/v1/auth/portal-availability` → JSON (routing to the backend works).
2. Backend `GET /health/ready` → `"ready"` (1–2 min on a first start).
3. Sign in, open Invoice Tracking, export to Excel, open a manual.
4. Response headers include `strict-transport-security` and no `server` version.
