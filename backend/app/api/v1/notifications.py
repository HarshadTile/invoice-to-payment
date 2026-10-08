from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.core.database import get_db
from app.schemas.common import UTCDateTime
from app.models.ticket import Ticket
from app.models.ticket_activity import Notification, SlaPolicy
from app.services.notification_service import recipient_filter


router = APIRouter(tags=["Notifications"])


class NotificationOut(BaseModel):
    id: int
    ticket_id: str | None
    type: str
    payload: dict[str, Any] | None
    ticket_no: str | None = None
    subject: str | None = None
    read_at: UTCDateTime | None
    created_at: UTCDateTime


def _scoped_notifications(db: Session, user: dict):
    query = recipient_filter(
        db.query(Notification).join(Ticket, Ticket.id == Notification.ticket_id),
        user,
    ).filter(Ticket.legacy_unlinked.is_(False))
    if user["auth_type"] == "supplier":
        return query.filter(Ticket.vendor_code == user["vendor_code"])
    if user["ticket_role"] == "ADMIN":
        return query
    if user["ticket_role"] == "CHANNEL_LEAD":
        return query.filter(Ticket.channel.in_(user["allowed_channels"]))
    return query.filter(Ticket.assignee_id == user["user_id"])


def _notification_out(db: Session, notification: Notification):
    ticket = db.get(Ticket, notification.ticket_id)
    return {
        "id": notification.id,
        "ticket_id": notification.ticket_id,
        "type": notification.type,
        "payload": notification.payload,
        "ticket_no": ticket.ticket_no if ticket else None,
        "subject": ticket.subject if ticket else None,
        "read_at": notification.read_at,
        "created_at": notification.created_at,
    }


class SlaPolicyIn(BaseModel):
    channel: str | None = None
    priority: str
    response_minutes: int = Field(gt=0)
    business_hours: bool = False
    active: bool = True


@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(
    unread: bool = False,
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = _scoped_notifications(db, user)
    if unread:
        query = query.filter(Notification.read_at.is_(None))
    rows = (
        query.order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [_notification_out(db, item) for item in rows]


@router.get("/notifications/unread-count")
def unread_notification_count(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Exact number of unread notifications, however many there are (the list is paged)."""
    count = _scoped_notifications(db, user).filter(Notification.read_at.is_(None)).count()
    return {"unread": count}


@router.post("/notifications/read-all")
def read_all_notifications(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = _scoped_notifications(db, user).filter(Notification.read_at.is_(None)).all()
    now = datetime.utcnow()
    for notification in rows:
        notification.read_at = now
    db.commit()
    return {"read": len(rows)}


@router.post("/notifications/{notification_id}/read")
def read_notification(
    notification_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notification = _scoped_notifications(db, user).filter(Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Notification not found."}})
    notification.read_at = datetime.utcnow()
    db.commit()
    return {"read": True}


@router.post("/notifications/ticket/{ticket_id}/read")
def read_ticket_notifications(
    ticket_id: str,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Opening a query clears this person's notifications about it."""
    rows = (
        _scoped_notifications(db, user)
        .filter(Notification.ticket_id == ticket_id, Notification.read_at.is_(None))
        .all()
    )
    now = datetime.utcnow()
    for notification in rows:
        notification.read_at = now
    db.commit()
    return {"read": len(rows)}


def _require_admin(user: dict):
    if user["auth_type"] != "internal" or user["ticket_role"] != "ADMIN":
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Admin access required."}})


@router.get("/admin/sla-policies")
def list_sla_policies(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_admin(user)
    return db.query(SlaPolicy).order_by(SlaPolicy.channel, SlaPolicy.priority).all()


@router.put("/admin/sla-policies")
def replace_sla_policies(
    policies: list[SlaPolicyIn],
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(user)
    for item in policies:
        policy = db.query(SlaPolicy).filter_by(channel=item.channel, priority=item.priority.upper()).first()
        if not policy:
            policy = SlaPolicy(channel=item.channel, priority=item.priority.upper())
            db.add(policy)
        policy.response_minutes = item.response_minutes
        policy.business_hours = item.business_hours
        policy.active = item.active
    db.commit()
    return {"updated": len(policies)}
