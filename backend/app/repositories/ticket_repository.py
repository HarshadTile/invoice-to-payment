from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models.ticket import Ticket, TicketComment
from app.models.ticket_activity import (
    TicketActivity,
    TicketAttachment,
    TicketIdempotency,
    TicketRead,
)


def scoped_query(db: Session, user: dict):
    # Pre-production/demo records remain in the database for audit and recovery,
    # but never participate in the operational ticket desk.
    query = db.query(Ticket).filter(Ticket.legacy_unlinked.is_(False))
    if user["auth_type"] == "supplier":
        return query.filter(Ticket.vendor_code.in_(user["vendor_codes"]))

    role = user["ticket_role"]
    if role == "ADMIN":
        return query
    if role == "CHANNEL_LEAD":
        channels = user["allowed_channels"]
        if user.get("channel_scope") and user["channel_scope"] != "all":
            channels = [user["channel_scope"]]
        return query.filter(Ticket.channel.in_(channels))
    return query.filter(Ticket.assignee_id == user["user_id"])


def get_ticket_or_404(db: Session, user: dict, ticket_id: str) -> Ticket:
    ticket = scoped_query(db, user).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "NOT_FOUND", "message": "Ticket not found."}},
        )
    return ticket


def apply_filters(query, filters: dict):
    if filters.get("status"):
        statuses = [value.strip().upper() for value in filters["status"].split(",")]
        query = query.filter(Ticket.status.in_(statuses))
    elif not filters.get("include_closed"):
        query = query.filter(Ticket.status != "CLOSED")
    if filters.get("channel"):
        query = query.filter(Ticket.channel == filters["channel"])
    if filters.get("priority"):
        query = query.filter(Ticket.priority == filters["priority"].upper())
    if filters.get("assignee_id") is not None:
        query = query.filter(Ticket.assignee_id == filters["assignee_id"])
    if filters.get("vendor_code"):
        query = query.filter(Ticket.vendor_code == filters["vendor_code"])
    if filters.get("invoice_no"):
        query = query.filter(Ticket.invoice_no == filters["invoice_no"])
    if filters.get("fy") and filters["fy"] != "all":
        query = query.filter(Ticket.fy == filters["fy"])
    if filters.get("sla") == "breached":
        query = query.filter(
            Ticket.awaiting == "STAFF",
            Ticket.status.in_(("OPEN", "IN_PROGRESS")),
            Ticket.response_due_at < datetime.utcnow(),
        )
    if filters.get("q"):
        term = f"%{filters['q'].strip()}%"
        query = query.filter(
            or_(
                Ticket.ticket_no.like(term),
                Ticket.subject.like(term),
                Ticket.description.like(term),
                Ticket.invoice_no.like(term),
                Ticket.vendor_code.like(term),
            )
        )
    return query


def comments_for(db: Session, user: dict, ticket_id: str, after_id: int | None = None):
    query = db.query(TicketComment).filter(TicketComment.ticket_id == ticket_id)
    if user["auth_type"] == "supplier":
        query = query.filter(TicketComment.visibility == "PUBLIC")
    if after_id is not None:
        query = query.filter(TicketComment.id > after_id)
    return query.order_by(TicketComment.id.asc()).all()


def attachments_for(db: Session, user: dict, ticket_id: str):
    query = db.query(TicketAttachment).filter(TicketAttachment.ticket_id == ticket_id)
    if user["auth_type"] == "supplier":
        query = query.filter(TicketAttachment.visibility == "PUBLIC")
    return query.order_by(TicketAttachment.id.asc()).all()


def attachment_or_404(db: Session, user: dict, ticket_id: str, attachment_id: int):
    get_ticket_or_404(db, user, ticket_id)
    query = db.query(TicketAttachment).filter(
        TicketAttachment.id == attachment_id,
        TicketAttachment.ticket_id == ticket_id,
    )
    if user["auth_type"] == "supplier":
        query = query.filter(TicketAttachment.visibility == "PUBLIC")
    attachment = query.first()
    if not attachment:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "NOT_FOUND", "message": "Attachment not found."}},
        )
    return attachment


def activity_for(db: Session, ticket_id: str):
    return (
        db.query(TicketActivity)
        .filter(TicketActivity.ticket_id == ticket_id)
        .order_by(TicketActivity.id.asc())
        .all()
    )


def add_activity(
    db: Session,
    ticket_id: str,
    actor_id: int | None,
    event: str,
    meta_data: dict | None = None,
):
    db.add(
        TicketActivity(
            ticket_id=ticket_id,
            actor_id=actor_id,
            event=event,
            meta_data=meta_data,
        )
    )


def actor_key(user: dict) -> str:
    if user["auth_type"] == "supplier":
        return f"supplier:{user['vendor_code']}"
    return f"user:{user['user_id']}"


def find_idempotent_ticket(db: Session, user: dict, key: str):
    record = db.get(TicketIdempotency, (actor_key(user), key))
    if not record:
        return None
    return get_ticket_or_404(db, user, record.ticket_id)


def unread_for(db: Session, user: dict, ticket: Ticket) -> bool:
    if user["auth_type"] == "supplier":
        return False
    read = db.get(TicketRead, (ticket.id, user["user_id"]))
    return not read or read.last_read_at < ticket.updated_at
