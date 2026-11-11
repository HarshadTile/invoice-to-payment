"""Settings > Audit Logs: the audit trail, filtered, searched and paged on the server.

Needs the viewAuditLog capability. The screen asks for one page at a time (newest first) and the
day's counts; exports stream the matching rows as CSV and are themselves audited.
"""
import csv
import io
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.audit import CATEGORIES, write_audit
from app.core.database import get_db
from app.core.permissions import require_capability
from app.models.audit_log import AuditLog
from app.models.user import User

router = APIRouter(prefix="/audit-logs", tags=["Audit log"])
_viewer = require_capability("viewAuditLog", "You don't have permission to view the audit log.")
MAX_EXPORT_ROWS = 100_000
CHANGE_CATEGORIES = ("users", "suppliers", "settings", "other")


def _utc(value: datetime) -> datetime:
    return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value


def _filtered(db: Session, category: str | None, q: str | None, date_from: date | None, date_to: date | None):
    query = db.query(AuditLog)
    if category and category != "all":
        if category not in CATEGORIES:
            raise HTTPException(status_code=422, detail="Unknown event type.")
        query = query.filter(AuditLog.category == category)
    if date_from:
        query = query.filter(AuditLog.occurred_at >= datetime.combine(date_from, time()))
    if date_to:
        query = query.filter(AuditLog.occurred_at < datetime.combine(date_to + timedelta(days=1), time()))
    needle = (q or "").strip()
    if needle:
        # % and _ are wildcards in LIKE: escape them so they match literally ("audit_user_3").
        escaped = needle.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        like = f"%{escaped}%"
        query = query.filter(or_(*(column.ilike(like, escape="\\") for column in
                                   (AuditLog.actor, AuditLog.action, AuditLog.detail, AuditLog.ip))))
    return query


def _item(row: AuditLog) -> dict:
    return {"id": row.id, "when": row.occurred_at.replace(tzinfo=timezone.utc).isoformat(timespec="seconds"),
            "who": row.actor, "whoType": row.actor_type, "action": row.action, "detail": row.detail or "",
            "category": row.category, "ip": row.ip}


@router.get("", summary="A page of the audit log, newest first, with the counts since `since`")
def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    category: str | None = Query(None, max_length=16),
    q: str | None = Query(None, max_length=100),
    date_from: date | None = None,
    date_to: date | None = None,
    since: datetime | None = Query(None, description="Start of the viewer's day, for the 'today' counts"),
    user: User = Depends(_viewer),
    db: Session = Depends(get_db),
):
    query = _filtered(db, category, q, date_from, date_to)
    total = query.count()
    rows = query.order_by(AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    start = _utc(since) if since else datetime.now(timezone.utc).replace(tzinfo=None, hour=0, minute=0, second=0, microsecond=0)
    counts = dict(db.query(AuditLog.category, func.count(AuditLog.id))
                  .filter(AuditLog.occurred_at >= start).group_by(AuditLog.category).all())
    return {
        "items": [_item(row) for row in rows], "total": total, "page": page, "pageSize": page_size,
        "logTotal": db.query(func.count(AuditLog.id)).scalar() or 0,
        "summary": {"since": start.replace(tzinfo=timezone.utc).isoformat(timespec="seconds"),
                    "total": sum(counts.values()), "signin": counts.get("signin", 0),
                    "failed": counts.get("failed", 0),
                    "changes": sum(counts.get(c, 0) for c in CHANGE_CATEGORIES)},
    }


@router.get("/export", summary="Download the matching audit rows as CSV (newest first)")
def export_audit_logs(
    category: str | None = Query(None, max_length=16),
    q: str | None = Query(None, max_length=100),
    date_from: date | None = None,
    date_to: date | None = None,
    user: User = Depends(_viewer),
    db: Session = Depends(get_db),
):
    query = _filtered(db, category, q, date_from, date_to)
    rows = query.order_by(AuditLog.id.desc()).limit(MAX_EXPORT_ROWS).all()
    write_audit(db, user, "Exported audit log",
                f"{len(rows)} rows; type {category or 'all'}; {date_from or 'start'} to {date_to or 'today'}"
                + (f"; search '{q.strip()}'" if q and q.strip() else ""))
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Time (UTC)", "Event", "Type", "By", "Detail", "IP address"])
    for row in rows:
        # Cells that a spreadsheet would run as a formula are prefixed with ' (CSV injection).
        cells = [row.occurred_at.strftime("%Y-%m-%d %H:%M:%S"), row.action, row.category, row.actor, row.detail or "", row.ip or ""]
        writer.writerow(["'" + c if isinstance(c, str) and c[:1] in ("=", "+", "-", "@") else c for c in cells])
    return StreamingResponse(
        iter(["﻿" + buffer.getvalue()]), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="audit-log-{date.today().isoformat()}.csv"'},
    )
