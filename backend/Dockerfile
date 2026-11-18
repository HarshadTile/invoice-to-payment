# Invoice to Payment Tracker - backend (FastAPI) image for Cloud Run.
#
#   docker build -t i2p-backend .
#   docker run -p 8080:8080 --env-file .env i2p-backend          (local try-out)
#
# No secrets or .env inside the image: every setting comes from the environment (Cloud Run variables and
# Secret Manager). The database is external (DATABASE_URL, e.g. Cloud SQL). Database migrations are a
# separate step with this same image:   docker run ... i2p-backend alembic upgrade head
# See docs/deployment.md.

FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8080

WORKDIR /app

# Libraries first, so a code-only change reuses this layer. All have ready-made Linux wheels (no compilers).
COPY requirements.txt .
RUN pip install -r requirements.txt

# Only what runs: the app, the migrations, the in-app manuals and the first-admin script.
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini seed_admin.py ./
COPY manuals ./manuals

# Run as a normal user, not root. The two folders the app writes to are created for it; on Cloud Run
# point INVOICE_CACHE_DIR and TICKET_ATTACHMENT_DIR at a mounted bucket instead, so they survive restarts.
RUN useradd --create-home --uid 10001 app \
    && mkdir -p /app/data/.invoice-cache /app/data/attachments \
    && chown -R app:app /app/data
USER app

EXPOSE 8080

# One process (background jobs and the login limiter live in it), behind Google's load balancer:
# trust its forwarded address/HTTPS headers and don't advertise the server software.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*' --no-server-header"]
