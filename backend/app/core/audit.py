"""The audit log: who did what, when and from where (Settings > Audit Logs).

Every security-relevant event is one row in the `audit_log` table: sign-ins and failed sign-ins,
account, supplier and settings changes. Rows are only ever added; the retention job removes rows
older than AUDIT_RETENTION_DAYS (default 365). Read-only actions are not logged.

To keep the log useful under attack, repeated failures can be throttled: the first one in a
5-minute window is written, later identical ones are counted and summarised on the next row.
"""
import os
import re
import threading
import time
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.user import User

AUDIT_TABLE_KEY = "settings-audit"  # the old storage (table_rows); kept so its table stays read-only
CATEGORIES = ("signin", "failed", "users", "suppliers", "settings", "other")
THROTTLE_SECONDS = 300
_THROTTLE_LIMIT = 10000

# The caller's address for the current request, set by a middleware in app/main.py, so every
# call site gets the IP without passing the request around.
_request_ip: ContextVar[str | None] = ContextVar("audit_request_ip", default=None)
_throttle: dict[str, list] = {}
_throttle_lock = threading.Lock()


def set_request_ip(ip: str | None):
    return _request_ip.set(ip)


def reset_request_ip(token) -> None:
    _request_ip.reset(token)


def current_ip() -> str | None:
    return _request_ip.get()


def category_of(action: str) -> str:
    """Which filter an action belongs to (the same rules the screen used before)."""
    text = (action or "").lower()
    if "fail" in text:
        return "failed"
    if re.search(r"logged (in|out)|login|logout|sign", text):
        return "signin"
    if re.search(r"supplier|vendor", text):
        return "suppliers"
    if re.search(r"user|password|setup link|reset link", text):
        return "users"
    if re.search(r"setting|role|permission|notification|expiry|channel|portal", text):
        return "settings"
    return "other"


def _actor_fields(actor: "User | str") -> tuple[str, str, str | None]:
    if isinstance(actor, User):
        return actor.name or actor.username or f"User #{actor.id}", "user", str(actor.id)
    label = str(actor or "Unknown")
    return label, ("supplier" if label.startswith("Supplier ") else "anonymous"), None


def _throttled(key: str) -> tuple[bool, int]:
    """(skip this one?, how many were skipped since the last row written for this key)."""
    now = time.monotonic()
    with _throttle_lock:
        if len(_throttle) > _THROTTLE_LIMIT:  # keep memory bounded: forget finished windows
            for stale in [k for k, (start, _) in _throttle.items() if now - start >= THROTTLE_SECONDS]:
                del _throttle[stale]
        entry = _throttle.get(key)
        if entry and now - entry[0] < THROTTLE_SECONDS:
            entry[1] += 1
            return True, 0
        skipped = entry[1] if entry else 0
        _throttle[key] = [now, 0]
        return False, skipped


def reset_throttle() -> None:
    """For tests."""
    with _throttle_lock:
        _throttle.clear()


def write_audit(db: Session, actor: "User | str", action: str, detail: str, *, throttle_key: str | None = None):
    """Add one row and commit (callers rely on this commit for their own pending changes).
    `throttle_key`: repeated events with the same key within 5 minutes are counted, not written."""
    if throttle_key:
        skip, skipped = _throttled(throttle_key)
        if skip:
            return
        if skipped:
            detail = f"{detail} (+{skipped} similar in the previous {THROTTLE_SECONDS // 60} minutes, not logged separately)"
    label, actor_type, actor_id = _actor_fields(actor)
    db.add(AuditLog(
        occurred_at=datetime.now(timezone.utc).replace(tzinfo=None), category=category_of(action),
        action=(action or "")[:120], actor=label[:191], actor_type=actor_type, actor_id=actor_id,
        detail=detail or "", ip=(current_ip() or None),
    ))
    db.commit()


def actor_from_token(db: Session, payload: dict) -> "User | str":
    """Who a JWT payload belongs to, for attributing an audit row to the caller."""
    if payload.get("auth_type") == "supplier":
        scope = payload.get("scope") or {}
        return f"Supplier {scope.get('pan') if 'stamp' in scope else payload.get('sub')}"
    user = db.query(User).filter(User.id == int(payload.get("sub"))).first()
    return user or f"User #{payload.get('sub')}"


def retention_days() -> int:
    try:
        return max(30, int(os.getenv("AUDIT_RETENTION_DAYS", "365")))
    except ValueError:
        return 365


def purge_old_entries(db: Session, *, batch: int = 5000) -> int:
    """Remove rows older than the retention period, in small batches so the table never locks for long."""
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=retention_days())
    removed = 0
    while True:
        ids = [row[0] for row in db.query(AuditLog.id).filter(AuditLog.occurred_at < cutoff).limit(batch).all()]
        if not ids:
            return removed
        db.query(AuditLog).filter(AuditLog.id.in_(ids)).delete(synchronize_session=False)
        db.commit()
        removed += len(ids)
