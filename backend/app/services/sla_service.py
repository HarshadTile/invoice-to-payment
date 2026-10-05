from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.ticket_activity import SlaPolicy


DEFAULT_MINUTES = {"HIGH": 240, "MEDIUM": 1440, "LOW": 2880}


def compute_due_at(start: datetime, minutes: int, business_hours: bool = False) -> datetime:
    # Business-hours calendars are intentionally deferred; the interface is stable for later.
    return start + timedelta(minutes=minutes)


def get_policy(db: Session, channel: str | None, priority: str) -> tuple[int, bool]:
    policy = None
    if channel:
        policy = db.query(SlaPolicy).filter_by(channel=channel, priority=priority, active=True).first()
    if not policy:
        policy = db.query(SlaPolicy).filter(
            SlaPolicy.channel.is_(None),
            SlaPolicy.priority == priority,
            SlaPolicy.active.is_(True),
        ).first()
    if policy:
        return policy.response_minutes, policy.business_hours
    return DEFAULT_MINUTES.get(priority, 1440), False


def start_clock(db: Session, channel: str | None, priority: str, now: datetime | None = None) -> dict:
    now = now or datetime.utcnow()
    minutes, business_hours = get_policy(db, channel, priority)
    return {
        "awaiting": "STAFF",
        "sla_started_at": now,
        "response_due_at": compute_due_at(now, minutes, business_hours),
    }


def staff_replied(ticket, now: datetime | None = None) -> dict:
    now = now or datetime.utcnow()
    values = {"awaiting": "SUPPLIER", "sla_started_at": None, "response_due_at": None}
    if not ticket.first_response_at:
        values["first_response_at"] = now
    return values


def supplier_replied(db: Session, ticket, now: datetime | None = None) -> dict:
    return start_clock(db, ticket.channel, ticket.priority, now)


def resolved(now: datetime | None = None) -> dict:
    now = now or datetime.utcnow()
    return {
        "status": "RESOLVED",
        "awaiting": "SUPPLIER",
        "sla_started_at": None,
        "response_due_at": None,
        "resolved_at": now,
        "resolved_date": now.strftime("%Y-%m-%d"),
    }


def closed(now: datetime | None = None) -> dict:
    now = now or datetime.utcnow()
    return {
        "status": "CLOSED",
        "awaiting": "NONE",
        "sla_started_at": None,
        "response_due_at": None,
        "closed_at": now,
    }


def priority_changed(db: Session, ticket, priority: str) -> dict:
    if ticket.awaiting != "STAFF" or not ticket.sla_started_at:
        return {"priority": priority}
    minutes, business_hours = get_policy(db, ticket.channel, priority)
    return {
        "priority": priority,
        "response_due_at": compute_due_at(ticket.sla_started_at, minutes, business_hours),
    }
