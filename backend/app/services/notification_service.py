from sqlalchemy.orm import Session

from app.models.ticket_activity import Notification
from app.models.user import User, UserChannelAccess


def add_for_user(db: Session, user_id: int, ticket_id: str, event_type: str, payload: dict | None = None):
    db.add(Notification(user_id=user_id, ticket_id=ticket_id, type=event_type, payload=payload))


def add_for_supplier(db: Session, vendor_code: str, ticket_id: str, event_type: str, payload: dict | None = None):
    db.add(
        Notification(
            recipient_key=f"supplier:{vendor_code}",
            ticket_id=ticket_id,
            type=event_type,
            payload=payload,
        )
    )


def oversight_user_ids(db: Session, channel: str) -> set[int]:
    admin_ids = {
        user_id
        for (user_id,) in db.query(User.id)
        .filter(
            User.status == "Active",
            User.ticket_role == "ADMIN",
        )
        .all()
    }
    channel_lead_ids = {
        user_id
        for (user_id,) in (
            db.query(User.id)
            .join(UserChannelAccess, UserChannelAccess.user_id == User.id)
            .filter(
                User.status == "Active",
                User.ticket_role == "CHANNEL_LEAD",
                UserChannelAccess.channel == channel,
            )
            .all()
        )
    }
    return admin_ids | channel_lead_ids


def add_for_oversight_team(
    db: Session,
    channel: str,
    ticket_id: str,
    event_type: str,
    payload: dict | None = None,
    exclude_user_ids: set[int] | None = None,
):
    excluded = exclude_user_ids or set()
    for user_id in oversight_user_ids(db, channel) - excluded:
        add_for_user(db, user_id, ticket_id, event_type, payload)

def recipient_filter(query, user: dict):
    if user["auth_type"] == "supplier":
        return query.filter(Notification.recipient_key == f"supplier:{user['vendor_code']}")
    return query.filter(Notification.user_id == user["user_id"])
