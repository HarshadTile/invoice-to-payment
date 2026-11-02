import logging

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.core.bigquery_api import InvoiceSourceError, use_api
from app.core.email import wait_for_outgoing_email
from app.api.v1.invoice import router as invoice_router
from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.suppliers import router as suppliers_router
from app.api.v1.supplier_requests import router as supplier_requests_router
from app.api.v1.workspace import router as workspace_router
from app.api.v1.tickets import router as tickets_router
from app.api.v1.settings import router as settings_router
from app.api.v1.sync_log import router as sync_log_router
from app.api.v1.notifications import router as notifications_router
from app.jobs.ticket_jobs import start_jobs, stop_jobs

# Schema is owned by Alembic now (see alembic/), not created here. Run
# `alembic upgrade head` before starting the app for the first time on a
# fresh database, and after pulling any change that adds a migration.

app = FastAPI(title="M&M Invoice-to-Payment Tracker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=1)
 
app.include_router(invoice_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users_router, prefix="/api/v1/users", tags=["users"])
app.include_router(suppliers_router, prefix="/api/v1/suppliers", tags=["suppliers"])
app.include_router(supplier_requests_router, prefix="/api/v1/supplier-requests", tags=["supplier requests"])
app.include_router(workspace_router, prefix="/api/v1")
app.include_router(tickets_router, prefix="/api/v1")
app.include_router(settings_router, prefix="/api/v1")
app.include_router(sync_log_router, prefix="/api/v1")
app.include_router(notifications_router, prefix="/api/v1")


@app.exception_handler(HTTPException)
async def http_exception_handler(_request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        body = exc.detail
    else:
        code = "NOT_FOUND" if exc.status_code == 404 else "FORBIDDEN" if exc.status_code == 403 else "REQUEST_ERROR"
        body = {"error": {"code": code, "message": str(exc.detail)}}
    return JSONResponse(status_code=exc.status_code, content=body, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "VALIDATION_ERROR", "message": "Request validation failed.", "details": exc.errors()}},
    )


@app.exception_handler(InvoiceSourceError)
async def invoice_source_exception_handler(_request, exc: InvoiceSourceError):
    logging.getLogger("app.bigquery").error("Invoice source unavailable: %s", exc)
    return JSONResponse(
        status_code=503,
        content={"error": {"code": "SOURCE_UNAVAILABLE", "message": "Invoice data source is unavailable. Try again shortly."}},
    )


@app.on_event("startup")
def start_ticket_jobs():
    start_jobs()
    # Load the invoices (from the last snapshot when there is one, in seconds) before the first click,
    # then keep them fresh from BigQuery in the background.
    if use_api():
        from app.services import invoice_refresh
        invoice_refresh.start()


@app.on_event("shutdown")
def stop_ticket_jobs():
    stop_jobs()
    if use_api():
        from app.services import invoice_refresh
        invoice_refresh.stop()
    # Emails are sent in the background; let any still queued go out before the process ends.
    wait_for_outgoing_email(timeout=20)

@app.get("/health")
def health_check():
    return {"status": "ok"}
