from fastapi import APIRouter, Depends
from typing import Dict, Any, List
from sqlalchemy import false
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timezone

from app.api.v1.auth import get_current_user_token
from app.core.audit import AUDIT_TABLE_KEY
from app.core.database import get_db
from app.core.permissions import has_capability, normalize_matrix
from app.models.ticket import Ticket, TicketComment
from app.models.settings import TableRow, AppSettings
from app.models.sync_log import SyncLog
from app.models.user import User
from app.schemas.sync_log import SyncLogResponse
from collections import defaultdict

router = APIRouter(
    prefix="/workspace",
    tags=["Workspace"],
)


def _serialize_comment(c: TicketComment) -> dict:
    """Turn an ORM TicketComment into a plain dict."""
    return {
        "id": c.id,
        "ticket_id": c.ticket_id,
        "author": c.author or "System",
        "author_id": c.author_id,
        "role": c.role or "system",
        "text": c.text or "",
        "visibility": c.visibility or "PUBLIC",
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _serialize_ticket(t: Ticket) -> dict:
    """
    Build a JSON-safe dict for a single Ticket ORM instance.

    The DB schema stores `assignee` as a plain string and has no
    dedicated `sla`, `allowed_actions`, or `unread` columns, so we
    compute / default those here rather than relying on Pydantic's
    ``model_validate`` (which would crash on the type mismatch).
    """
    # --- assignee (string → object or null) ---
    assignee_obj = None
    if t.assignee_id and t.assignee:
        assignee_obj = {"id": t.assignee_id, "name": t.assignee}
    elif t.assignee:
        assignee_obj = {"id": 0, "name": t.assignee}

    # --- SLA ---
    sla_obj = None
    if t.response_due_at:
        now = datetime.now(timezone.utc)
        due = t.response_due_at if t.response_due_at.tzinfo else t.response_due_at.replace(tzinfo=timezone.utc)
        breached = now > due and t.first_response_at is None
        overdue_minutes = max(0, int((now - due).total_seconds() / 60)) if breached else 0
        sla_obj = {
            "response_due_at": due.isoformat(),
            "breached": breached,
            "overdue_minutes": overdue_minutes,
        }

    # --- comments ---
    comments: List[dict] = []
    if t.comments:
        comments = [_serialize_comment(c) for c in t.comments]

    return {
        "id": t.id,
        "ticket_no": t.no,
        "invoice_id": t.invoice_id,
        "category": t.category or "",
        "priority": t.priority or "MEDIUM",
        "subject": t.subject or t.description or "",
        "description": t.description or "",
        "vendor_code": t.vendor_code,
        "status": t.status or "OPEN",
        "awaiting": t.awaiting or "STAFF",
        "channel": t.channel,
        "fy": t.fy,
        "assignee": assignee_obj,
        "sla": sla_obj,
        "reopen_count": t.reopen_count or 0,
        "row_version": t.row_version or 1,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        "allowed_actions": [],
        "unread": False,
        "comments": comments,
    }


@router.get("")
def get_workspace_data(
    payload: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    
    auth_type = payload.get("auth_type")
    
    # Query tickets based on auth type
    query = db.query(Ticket).options(joinedload(Ticket.comments))
    
    if auth_type == "supplier":
        vcode = payload.get("sub")
        query = query.filter(Ticket.raised_by == vcode)
    
    tickets_db = query.all()
    tickets = [_serialize_ticket(t) for t in tickets_db]
    

    # Query Tables. Suppliers get none of the internal grids; the audit log is Admin-only.
    is_internal = auth_type == "internal"
    can_view_audit = False
    if is_internal:
        caller = db.query(User).filter(User.id == int(payload.get("sub"))).first()
        can_view_audit = bool(caller and has_capability(db, caller, "viewAuditLog"))
    tables_query = db.query(TableRow)
    if not is_internal:
        tables_query = tables_query.filter(false())
    elif not can_view_audit:
        tables_query = tables_query.filter(TableRow.table_key != AUDIT_TABLE_KEY)
    tables_db = tables_query.all()
    tables_dict = defaultdict(list)
    
    # Sort by row_index to reconstruct arrays properly
    tables_db.sort(key=lambda x: x.row_index)
    for row in tables_db:
        tables_dict[row.table_key].append(row.cells_json)
        
    # Query Settings
    settings_db = db.query(AppSettings).filter(AppSettings.id == 1).first()
    settings_dict = {}
    if settings_db and is_internal:
        settings_dict = {
            "roleMatrix": normalize_matrix(settings_db.role_matrix_json),
            "twoFactorOn": settings_db.two_factor,
            "senderEmail": settings_db.sender_email
        }
    

    # Query Sync Log
    sync_logs_db = db.query(SyncLog).all()
    sync_logs = [SyncLogResponse.model_validate(s).model_dump() for s in sync_logs_db]
    
    return {
        "invoices": [],
        "syncLog": sync_logs,
        "tickets": tickets,

        "ticketSeq": 0,
        "tables": dict(tables_dict),
        "settings": settings_dict
    }

