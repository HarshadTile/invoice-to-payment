import math
import uuid
from datetime import date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import case, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.ticket import Ticket, TicketComment
from app.models.ticket_activity import TicketIdempotency, TicketRead
from app.models.user import User, UserChannelAccess
from app.repositories import ticket_repository
from app.services import notification_service, sla_service
from app.services import attachment_service
from app.services.ticket_permissions import authorize, can_create, get_allowed_actions
from app.services.ticket_state_machine import transition
from app.services.invoice import get_gcp_invoice_response


CREATE_LIMIT_PER_HOUR = 10
COMMENT_LIMIT_PER_HOUR = 30


def _error(status_code: int, code: str, message: str):
    raise HTTPException(status_code=status_code, detail={"error": {"code": code, "message": message}})


def _require_action(user: dict, ticket: Ticket, action: str):
    if not authorize(user, ticket, action):
        _error(403, "FORBIDDEN", f"You cannot {action.replace('_', ' ')} this ticket.")


def _actor_id(user: dict) -> int | None:
    return user["user_id"] if user["auth_type"] == "internal" else None


def _author_role(user: dict) -> str:
    return user["ticket_role"] if user["auth_type"] == "internal" else "SUPPLIER"


def _fy_from_invoice(invoice) -> str:
    year = invoice.sap.fiscal_year
    if year:
        # SAP stores the fiscal year by its ending calendar year. For example,
        # 2027 represents the Indian financial year 2026-27.
        start_year = year - 1
        return f"{start_year}-{str(year)[-2:]}"
    invoice_date = invoice.invoice_date or date.today()
    start = invoice_date.year if invoice_date.month >= 4 else invoice_date.year - 1
    return f"{start}-{str(start + 1)[-2:]}"


def _invoice_context(invoice_no: str) -> dict:
    invoice = get_gcp_invoice_response(invoice_no)
    if not invoice:
        _error(422, "VALIDATION_ERROR", "The selected invoice does not exist.")
    return {
        "invoice": invoice,
        "invoice_no": invoice.invoice_number,
        "vendor_code": invoice.supplier.vendor_code,
        "channel": "msetuSrm",
        "fy": _fy_from_invoice(invoice),
    }


def _check_creation_rate(db: Session, user: dict):
    since = datetime.utcnow() - timedelta(hours=1)
    query = db.query(func.count(Ticket.id)).filter(Ticket.created_at >= since)
    if user["auth_type"] == "supplier":
        query = query.filter(Ticket.vendor_code == user["vendor_code"], Ticket.source == "SUPPLIER")
    else:
        query = query.filter(Ticket.raised_by == str(user["user_id"]), Ticket.source == "INTERNAL")
    if query.scalar() >= CREATE_LIMIT_PER_HOUR:
        _error(429, "RATE_LIMITED", "Ticket creation limit reached. Try again later.")


def _check_comment_rate(db: Session, user: dict):
    since = datetime.utcnow() - timedelta(hours=1)
    query = db.query(func.count(TicketComment.id)).filter(TicketComment.created_at >= since)
    if user["auth_type"] == "internal":
        query = query.filter(TicketComment.author_id == user["user_id"])
    else:
        query = query.filter(TicketComment.role == "SUPPLIER", TicketComment.author == user["name"])
    if query.scalar() >= COMMENT_LIMIT_PER_HOUR:
        _error(429, "RATE_LIMITED", "Comment limit reached. Try again later.")


def _atomic_update(db: Session, ticket: Ticket, expected_version: int, values: dict) -> Ticket:
    values = {**values, "updated_at": datetime.utcnow(), "row_version": Ticket.row_version + 1}
    result = db.execute(
        update(Ticket)
        .where(Ticket.id == ticket.id, Ticket.row_version == expected_version)
        .values(**values)
    )
    if result.rowcount != 1:
        _error(409, "VERSION_CONFLICT", "This query changed while you were viewing it.")
    db.flush()
    db.expire(ticket)
    return ticket


def _add_comment(db: Session, user: dict, ticket: Ticket, body: str, visibility: str) -> TicketComment:
    comment = TicketComment(
        ticket_id=ticket.id,
        author=user["name"],
        author_id=_actor_id(user),
        role=_author_role(user),
        visibility=visibility,
        date=datetime.utcnow().strftime("%Y-%m-%d"),
        text=body.strip(),
        seq=0,
    )
    db.add(comment)
    db.flush()
    return comment


def _serialize_comment(comment: TicketComment) -> dict:
    return {
        "id": comment.id,
        "ticket_id": comment.ticket_id,
        "author": comment.author,
        "author_id": comment.author_id,
        "author_role": comment.role.upper().replace(" ", "_"),
        "visibility": comment.visibility,
        "body": comment.text,
        "created_at": comment.created_at,
    }


def _serialize_attachment(attachment) -> dict:
    return {
        "id": attachment.id,
        "comment_id": attachment.comment_id,
        "original_name": attachment.original_name,
        "mime_type": attachment.mime_type,
        "size_bytes": attachment.size_bytes,
        "visibility": attachment.visibility,
        "created_at": attachment.created_at,
    }


def _invoice_summary(ticket: Ticket):
    if not ticket.invoice_no:
        return None
    invoice = get_gcp_invoice_response(ticket.invoice_no)
    if not invoice:
        return {"invoice_no": ticket.invoice_no}
    amount = invoice.sap.cash_discount_base or invoice.sap.amount_local_currency or invoice.sap.amount
    return {
        "invoice_no": invoice.invoice_number,
        "po_no": invoice.purchase_order.po_number,
        "amount": str(amount) if amount is not None else None,
        "status": invoice.overall_status,
    }


def format_ticket(db: Session, user: dict, ticket: Ticket, include_thread: bool = True) -> dict:
    now = datetime.utcnow()
    breached = bool(
        ticket.awaiting == "STAFF"
        and ticket.status in ("OPEN", "IN_PROGRESS")
        and ticket.response_due_at
        and ticket.response_due_at < now
    )
    overdue = int((now - ticket.response_due_at).total_seconds() // 60) if breached else 0
    assignee = None
    if ticket.assignee_id:
        if user["auth_type"] == "supplier":
            assignee = {"team": "Msetu / SRM team"}
        else:
            target = db.get(User, ticket.assignee_id)
            if target:
                assignee = {"id": target.id, "name": target.name}
    comments = ticket_repository.comments_for(db, user, ticket.id) if include_thread else []
    attachments = ticket_repository.attachments_for(db, user, ticket.id) if include_thread else []
    due_at = ticket.response_due_at
    return {
        "id": ticket.id,
        "ticket_no": ticket.ticket_no or ticket.no or ticket.id,
        "invoice_no": ticket.invoice_no,
        "invoice": _invoice_summary(ticket),
        "channel": ticket.channel,
        "fy": ticket.fy,
        "vendor_code": ticket.vendor_code,
        "category": ticket.category,
        "priority": (ticket.priority or "MEDIUM").upper(),
        "subject": ticket.subject or ticket.category,
        "description": ticket.description,
        "status": ticket.status.upper().replace(" ", "_"),
        "awaiting": ticket.awaiting,
        "source": ticket.source,
        "assignee": assignee,
        "sla": {
            "response_due_at": due_at if user["auth_type"] == "internal" else None,
            "reply_expected_by": due_at if user["auth_type"] == "supplier" else None,
            "breached": breached,
            "overdue_minutes": overdue,
        },
        "unread": ticket_repository.unread_for(db, user, ticket),
        "reopen_count": ticket.reopen_count,
        "row_version": ticket.row_version,
        "legacy_unlinked": ticket.legacy_unlinked,
        "allowed_actions": get_allowed_actions(user, ticket),
        "comments": [_serialize_comment(comment) for comment in comments],
        "attachments": [_serialize_attachment(item) for item in attachments],
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
        "resolved_at": ticket.resolved_at,
        "closed_at": ticket.closed_at,
    }


def list_tickets(db: Session, user: dict, filters: dict, page: int, page_size: int):
    query = ticket_repository.apply_filters(ticket_repository.scoped_query(db, user), filters)
    total = query.count()
    rows = query.order_by(Ticket.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [format_ticket(db, user, ticket, include_thread=False) for ticket in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


def get_ticket(db: Session, user: dict, ticket_id: str):
    ticket = ticket_repository.get_ticket_or_404(db, user, ticket_id)
    _require_action(user, ticket, "view")
    return format_ticket(db, user, ticket)


def create_ticket(db: Session, user: dict, ticket_in, idempotency_key: str | None = None):
    if idempotency_key:
        existing = ticket_repository.find_idempotent_ticket(db, user, idempotency_key)
        if existing:
            return format_ticket(db, user, existing)
    _check_creation_rate(db, user)
    context = _invoice_context(ticket_in.invoice_no)
    if user["auth_type"] == "supplier" and context["vendor_code"] != user["vendor_code"]:
        _error(404, "NOT_FOUND", "Invoice not found.")
    if not can_create(user, context["channel"]):
        _error(403, "FORBIDDEN", "You cannot create tickets for this channel.")

    now = datetime.utcnow()
    ticket = Ticket(
        id=uuid.uuid4().hex[:16],
        no=context["invoice_no"],
        invoice_no=context["invoice_no"],
        category=ticket_in.category,
        priority=ticket_in.priority,
        subject=ticket_in.subject,
        description=ticket_in.description,
        vendor_code=context["vendor_code"],
        channel=context["channel"],
        fy=context["fy"],
        status="OPEN",
        awaiting="STAFF",
        source="SUPPLIER" if user["auth_type"] == "supplier" else "INTERNAL",
        raised_by=user["vendor_code"] if user["auth_type"] == "supplier" else str(user["user_id"]),
        assignee="",
        raised_date=now.strftime("%Y-%m-%d"),
        sla_hours=math.ceil(sla_service.get_policy(db, context["channel"], ticket_in.priority)[0] / 60),
        legacy_unlinked=False,
    )
    for key, value in sla_service.start_clock(db, context["channel"], ticket_in.priority, now).items():
        setattr(ticket, key, value)
    db.add(ticket)
    try:
        db.flush()
        ticket.ticket_sequence = db.execute(
            select(Ticket.ticket_sequence).where(Ticket.id == ticket.id)
        ).scalar_one()
        ticket.ticket_no = f"QRY-{ticket.ticket_sequence:06d}"
        ticket_repository.add_activity(db, ticket.id, _actor_id(user), "CREATED", {"actor_key": ticket_repository.actor_key(user)})
        if idempotency_key:
            db.add(TicketIdempotency(actor_key=ticket_repository.actor_key(user), idempotency_key=idempotency_key, ticket_id=ticket.id))
        notification_service.add_for_oversight_team(db, ticket.channel, ticket.id, "TICKET_CREATED", {"ticket_no": ticket.ticket_no})
        db.commit()
    except IntegrityError:
        db.rollback()
        if idempotency_key:
            existing = ticket_repository.find_idempotent_ticket(db, user, idempotency_key)
            if existing:
                return format_ticket(db, user, existing)
        raise
    db.refresh(ticket)
    return format_ticket(db, user, ticket)


def add_comment(db: Session, user: dict, ticket_id: str, comment_in):
    ticket = ticket_repository.get_ticket_or_404(db, user, ticket_id)
    action = "note" if comment_in.visibility == "INTERNAL" else "reply"
    _require_action(user, ticket, action)
    _check_comment_rate(db, user)
    values = {}
    event = "NOTE_ADDED"
    if comment_in.visibility == "PUBLIC":
        event = "REPLIED"
        values = (
            sla_service.supplier_replied(db, ticket)
            if user["auth_type"] == "supplier"
            else sla_service.staff_replied(ticket)
        )
    _atomic_update(db, ticket, comment_in.expected_version, values)
    comment = _add_comment(db, user, ticket, comment_in.body, comment_in.visibility)
    ticket_repository.add_activity(db, ticket.id, _actor_id(user), event, {"comment_id": comment.id, "visibility": comment_in.visibility})
    if comment_in.visibility == "PUBLIC":
        if user["auth_type"] == "supplier":
            if ticket.assignee_id:
                notification_service.add_for_user(db, ticket.assignee_id, ticket.id, "SUPPLIER_REPLIED")
            else:
                notification_service.add_for_oversight_team(db, ticket.channel, ticket.id, "SUPPLIER_REPLIED")
        else:
            notification_service.add_for_supplier(db, ticket.vendor_code, ticket.id, "STAFF_REPLIED")
    db.commit()
    db.refresh(ticket)
    return format_ticket(db, user, ticket)


def assign_ticket(db: Session, user: dict, ticket_id: str, assign_in):
    ticket = ticket_repository.get_ticket_or_404(db, user, ticket_id)
    action = "assign" if ticket.status == "OPEN" else "reassign"
    _require_action(user, ticket, action)
    target_status = transition(ticket, action)
    assignee = db.get(User, assign_in.assignee_id)
    if not assignee or assignee.status != "Active":
        _error(422, "VALIDATION_ERROR", "The selected assignee is not active.")
    eligible = assignee.ticket_role in ("ASSIGNEE", "CHANNEL_LEAD", "ADMIN")
    has_channel = assignee.ticket_role == "ADMIN" or any(m.channel == ticket.channel for m in assignee.ticket_channels)
    if not eligible or not has_channel:
        _error(422, "VALIDATION_ERROR", "The selected user cannot be assigned in this channel.")
    old_assignee = ticket.assignee_id
    _atomic_update(db, ticket, assign_in.expected_version, {"assignee_id": assignee.id, "assignee": assignee.name, "status": target_status})
    if assign_in.note and assign_in.note.strip():
        _add_comment(db, user, ticket, assign_in.note, "INTERNAL")
    ticket_repository.add_activity(db, ticket.id, user["user_id"], "ASSIGNED" if action == "assign" else "REASSIGNED", {"from": old_assignee, "to": assignee.id})
    notification_service.add_for_user(db, assignee.id, ticket.id, "TICKET_ASSIGNED")
    notification_service.add_for_supplier(db, ticket.vendor_code, ticket.id, "TICKET_ASSIGNED")
    db.commit()
    db.refresh(ticket)
    return format_ticket(db, user, ticket)


def patch_ticket(db: Session, user: dict, ticket_id: str, patch_in):
    ticket = ticket_repository.get_ticket_or_404(db, user, ticket_id)
    _require_action(user, ticket, "change_priority")
    values = {}
    meta = {}
    if patch_in.priority and patch_in.priority != ticket.priority:
        values.update(sla_service.priority_changed(db, ticket, patch_in.priority))
        meta["priority"] = {"from": ticket.priority, "to": patch_in.priority}
    if patch_in.category and patch_in.category.strip() != ticket.category:
        values["category"] = patch_in.category.strip()
        meta["category"] = {"from": ticket.category, "to": patch_in.category.strip()}
    if not values:
        return format_ticket(db, user, ticket)
    _atomic_update(db, ticket, patch_in.expected_version, values)
    ticket_repository.add_activity(db, ticket.id, user["user_id"], "TICKET_UPDATED", meta)
    db.commit()
    db.refresh(ticket)
    return format_ticket(db, user, ticket)


def resolve_ticket(db: Session, user: dict, ticket_id: str, resolve_in):
    ticket = ticket_repository.get_ticket_or_404(db, user, ticket_id)
    _require_action(user, ticket, "resolve")
    transition(ticket, "resolve")
    _atomic_update(db, ticket, resolve_in.expected_version, sla_service.resolved())
    comment = _add_comment(db, user, ticket, resolve_in.resolution_note, "PUBLIC")
    ticket_repository.add_activity(db, ticket.id, user["user_id"], "RESOLVED", {"comment_id": comment.id})
    notification_service.add_for_supplier(db, ticket.vendor_code, ticket.id, "TICKET_RESOLVED")
    db.commit()
    db.refresh(ticket)
    return format_ticket(db, user, ticket)


def close_ticket(db: Session, user: dict, ticket_id: str, close_in):
    ticket = ticket_repository.get_ticket_or_404(db, user, ticket_id)
    _require_action(user, ticket, "close")
    transition(ticket, "close")
    _atomic_update(db, ticket, close_in.expected_version, sla_service.closed())
    ticket_repository.add_activity(db, ticket.id, _actor_id(user), "CLOSED")
    if ticket.assignee_id:
        notification_service.add_for_user(db, ticket.assignee_id, ticket.id, "TICKET_CLOSED")
    db.commit()
    db.refresh(ticket)
    return format_ticket(db, user, ticket)


def reopen_ticket(db: Session, user: dict, ticket_id: str, reopen_in):
    ticket = ticket_repository.get_ticket_or_404(db, user, ticket_id)
    _require_action(user, ticket, "reopen")
    transition(ticket, "reopen")
    values = {"status": "IN_PROGRESS", "resolved_at": None, "resolved_date": None, "reopen_count": ticket.reopen_count + 1}
    values.update(sla_service.start_clock(db, ticket.channel, ticket.priority))
    _atomic_update(db, ticket, reopen_in.expected_version, values)
    comment = _add_comment(db, user, ticket, reopen_in.reason, "PUBLIC")
    ticket_repository.add_activity(db, ticket.id, _actor_id(user), "REOPENED", {"comment_id": comment.id})
    if ticket.assignee_id:
        notification_service.add_for_user(db, ticket.assignee_id, ticket.id, "TICKET_REOPENED")
    notification_service.add_for_oversight_team(
        db,
        ticket.channel,
        ticket.id,
        "TICKET_REOPENED",
        exclude_user_ids={ticket.assignee_id} if ticket.assignee_id else None,
    )
    db.commit()
    db.refresh(ticket)
    return format_ticket(db, user, ticket)


def get_comments(db: Session, user: dict, ticket_id: str, after_id: int | None):
    ticket = ticket_repository.get_ticket_or_404(db, user, ticket_id)
    _require_action(user, ticket, "view")
    return [_serialize_comment(item) for item in ticket_repository.comments_for(db, user, ticket_id, after_id)]


def get_activity(db: Session, user: dict, ticket_id: str):
    ticket = ticket_repository.get_ticket_or_404(db, user, ticket_id)
    if user["auth_type"] != "internal":
        _error(403, "FORBIDDEN", "Activity history is internal only.")
    return [{"id": item.id, "event": item.event, "actor_id": item.actor_id, "meta": item.meta_data, "created_at": item.created_at} for item in ticket_repository.activity_for(db, ticket.id)]


def mark_read(db: Session, user: dict, ticket_id: str):
    ticket = ticket_repository.get_ticket_or_404(db, user, ticket_id)
    if user["auth_type"] == "supplier":
        return {"read": True}
    read = db.get(TicketRead, (ticket.id, user["user_id"]))
    if not read:
        read = TicketRead(ticket_id=ticket.id, user_id=user["user_id"], last_read_at=datetime.utcnow())
        db.add(read)
    else:
        read.last_read_at = datetime.utcnow()
    db.commit()
    return {"read": True}


def summary(db: Session, user: dict, filters: dict):
    query = ticket_repository.apply_filters(ticket_repository.scoped_query(db, user), {**filters, "include_closed": True})
    rows = query.with_entities(
        func.sum(case((Ticket.status == "OPEN", 1), else_=0)),
        func.sum(case((Ticket.status == "IN_PROGRESS", 1), else_=0)),
        func.sum(case((Ticket.status.in_(("RESOLVED", "CLOSED")), 1), else_=0)),
        func.sum(case((
            (Ticket.awaiting == "STAFF") & Ticket.status.in_(("OPEN", "IN_PROGRESS")) & (Ticket.response_due_at < datetime.utcnow()),
            1,
        ), else_=0)),
    ).one()
    return {"open": int(rows[0] or 0), "in_progress": int(rows[1] or 0), "resolved_closed": int(rows[2] or 0), "sla_breached": int(rows[3] or 0)}


def board(db: Session, user: dict, filters: dict):
    if user["auth_type"] != "internal":
        _error(403, "FORBIDDEN", "The board is internal only.")
    query = ticket_repository.apply_filters(ticket_repository.scoped_query(db, user), {**filters, "include_closed": True})
    result = {"open": [], "in_progress": [], "resolved": [], "closed": []}
    for ticket in query.order_by(Ticket.updated_at.desc()).all():
        result[ticket.status.lower()].append(format_ticket(db, user, ticket, include_thread=False))
    return result


def assignable_users(db: Session, user: dict, channel: str):
    if user["auth_type"] != "internal" or user["ticket_role"] not in ("ADMIN", "CHANNEL_LEAD"):
        _error(403, "FORBIDDEN", "You cannot view assignable users.")
    if user["ticket_role"] == "CHANNEL_LEAD" and channel not in user["allowed_channels"]:
        _error(403, "FORBIDDEN", "This channel is outside your scope.")
    users = (
        db.query(User)
        .outerjoin(UserChannelAccess, UserChannelAccess.user_id == User.id)
        .filter(
            User.status == "Active",
            User.ticket_role.in_(("ASSIGNEE", "CHANNEL_LEAD", "ADMIN")),
            (User.ticket_role == "ADMIN") | (UserChannelAccess.channel == channel),
        )
        .distinct()
        .order_by(User.name)
        .all()
    )
    return [{"id": item.id, "name": item.name, "role": item.ticket_role or item.role} for item in users]


async def upload_attachment(
    db: Session,
    user: dict,
    ticket_id: str,
    upload,
    visibility: str,
    expected_version: int,
    comment_id: int | None = None,
):
    ticket = ticket_repository.get_ticket_or_404(db, user, ticket_id)
    action = "attach_internal" if visibility == "INTERNAL" else "attach_public"
    _require_action(user, ticket, action)
    if comment_id is not None:
        comment = db.query(TicketComment).filter_by(id=comment_id, ticket_id=ticket.id).first()
        if not comment:
            _error(422, "VALIDATION_ERROR", "The attachment comment does not exist.")
    existing_count = db.query(func.count()).select_from(attachment_service.TicketAttachment).filter(
        attachment_service.TicketAttachment.ticket_id == ticket.id,
        attachment_service.TicketAttachment.comment_id == comment_id,
    ).scalar()
    if existing_count >= attachment_service.MAX_FILES_PER_COMMENT:
        _error(422, "VALIDATION_ERROR", "A message can have at most five attachments.")
    _atomic_update(db, ticket, expected_version, {})
    attachment = await attachment_service.store_upload(
        db,
        ticket.id,
        comment_id,
        _actor_id(user),
        ticket_repository.actor_key(user),
        visibility,
        upload,
    )
    db.flush()
    ticket_repository.add_activity(db, ticket.id, _actor_id(user), "ATTACHMENT_ADDED", {"attachment_id": attachment.id, "visibility": visibility})
    db.commit()
    return _serialize_attachment(attachment)
