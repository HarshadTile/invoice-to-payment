"""Invoice data sync: status for the app ("data as of"), and "Sync now" for administrators.

The readiness check for monitoring (/health/ready) lives in app/main.py and uses `readiness()`.
"""
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.bigquery_api import use_api
from app.core.database import get_db
from app.core.permissions import has_capability, require_capability
from app.core.rate_limit import rate_limit
from app.models.user import User
from app.repositories import po_portal_invoice, srm_invoice
from app.services import invoice_refresh, sync_status
from app.services.sync_schedule import Schedule

router = APIRouter(prefix="/invoice-sync", tags=["Invoice sync"])
SYNC_NOW_PER_10_MINUTES = 3


def _file_mode_status() -> dict:
    """INVOICE_SOURCE=file: no live sync; the data is as old as the files in backend/data."""
    sources = []
    for name, path in (("srm", srm_invoice.EXCEL_FILE), ("po-portal", po_portal_invoice.CSV_FILE)):
        try:
            as_of = datetime.fromtimestamp(os.path.getmtime(path), timezone.utc).isoformat(timespec="seconds")
        except OSError:
            as_of = None
        sources.append({"source": name, "label": sync_status.LABELS[name], "rows": None, "dataAsOf": as_of,
                        "loadedFrom": "file", "lastAttemptAt": None, "lastSuccessAt": None, "lastSyncOk": True,
                        "consecutiveFailures": 0, "lastError": None})
    return {"live": False, "schedule": "Live sync is off (INVOICE_SOURCE=file)", "running": False,
            "nextSyncAt": None, "sources": sources}


def _stale_after_minutes() -> float:
    try:
        return Schedule.from_env().stale_after_minutes
    except ValueError:
        return 180.0


def _with_summary(status: dict) -> dict:
    stamps = [s["dataAsOf"] for s in status["sources"] if s["dataAsOf"]]
    oldest = min(stamps) if stamps else None
    age = None
    if oldest:
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(oldest)).total_seconds() / 60
    status["dataAsOf"] = oldest
    status["dataAgeMinutes"] = round(age) if age is not None else None
    status["lastSyncOk"] = all(s["lastSyncOk"] for s in status["sources"])
    status["stale"] = bool(status["live"] and (age is None or age > _stale_after_minutes()))
    return status


def current_status(include_error: bool) -> dict:
    return _with_summary(sync_status.snapshot(include_error=include_error) if use_api() else _file_mode_status())


def readiness() -> tuple[int, dict]:
    """For monitoring: 503 while no invoice data is loaded yet; 'degraded' when it is stale or the last
    sync failed. No error text: this endpoint needs no sign-in."""
    status = current_status(include_error=False)
    loaded = not status["live"] or any(s["loadedFrom"] != "none" for s in status["sources"])
    state = "starting" if not loaded else "degraded" if (status["stale"] or not status["lastSyncOk"]) else "ready"
    return (503 if state == "starting" else 200), {
        "status": state, "invoiceSource": "bigquery" if status["live"] else "file",
        "dataAsOf": status["dataAsOf"], "dataAgeMinutes": status["dataAgeMinutes"],
        "lastSyncOk": status["lastSyncOk"], "stale": status["stale"],
    }


@router.get("/status", summary="How fresh the invoice data is, and how the automatic sync is doing")
def sync_status_endpoint(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    if user["auth_type"] != "internal":
        # Suppliers only learn how current the data is.
        status = current_status(include_error=False)
        return {"dataAsOf": status["dataAsOf"], "stale": status["stale"]}
    caller = db.get(User, user["user_id"])
    return current_status(include_error=bool(caller and has_capability(db, caller, "manageConfig")))


@router.post("/run", status_code=202, summary="Start a sync from BigQuery now (Manage Integration Settings)")
def sync_now(user: User = Depends(require_capability("manageConfig", "Only integration managers can start a sync."))):
    rate_limit("invoice-sync-now", "all", limit=SYNC_NOW_PER_10_MINUTES, window_seconds=600)
    outcome = invoice_refresh.request_sync()
    if outcome == "disabled":
        raise HTTPException(status_code=409, detail="Live sync is off: the backend reads invoice files (INVOICE_SOURCE=file).")
    if outcome == "running":
        raise HTTPException(status_code=409, detail="A sync is already running. It usually takes 1-2 minutes.")
    return {"msg": "Sync started. Fresh data appears in 1-2 minutes."}
