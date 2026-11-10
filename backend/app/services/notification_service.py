from sqlalchemy.orm import Session

from app.models.ticket_activity import Notification
from app.models.user import User, UserChannelAccess, ticket_admin_clause


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


def _account_key(supplier_id: int) -> str:
    return f"supplier-account:{supplier_id}"


def add_for_supplier_account(db: Session, supplier_id: int, event_type: str, payload: dict | None = None):
    """For events about the account itself. Keyed by account, because a notification keyed by
    vendor code would disappear when that code is removed from the account."""
    db.add(Notification(recipient_key=_account_key(supplier_id), type=event_type, payload=payload))


def delete_for_supplier_account(db: Session, supplier_id: int) -> None:
    db.query(Notification).filter(Notification.recipient_key == _account_key(supplier_id)).delete(synchronize_session=False)


def oversight_user_ids(db: Session, channel: str) -> set[int]:
    admin_ids = {
        user_id
        for (user_id,) in db.query(User.id)
        .filter(
            User.status == "Active",
            ticket_admin_clause(),
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
        keys = [f"supplier:{c}" for c in user["vendor_codes"]]
        if user.get("supplier_id"):
            keys.append(_account_key(user["supplier_id"]))
        return query.filter(Notification.recipient_key.in_(keys))
    return query.filter(Notification.user_id == user["user_id"])


def supplier_manager_ids(db: Session, channels) -> set[int]:
    """Active internal users whose role may manage suppliers. Admins always; other managers
    when the request's vendor codes are in one of their channels (or the channels aren't known)."""
    if isinstance(channels, str):
        channels = [channels]
    wanted = set(channels or [])
    from app.core.permissions import load_role_matrix

    matrix = load_role_matrix(db)
    roles = [role for role, caps in matrix.items() if caps.get("manageSuppliers")]
    if not roles:
        return set()
    ids = set()
    for user in db.query(User).filter(User.status == "Active", User.role.in_(roles)).all():
        if user.role == "Admin" or not wanted:
            ids.add(user.id)
            continue
        # The same channels Supplier Management shows this user (see suppliers._visible).
        channels = {membership.channel for membership in user.ticket_channels}
        if user.channel_scope and user.channel_scope != "all":
            channels.add(user.channel_scope)
        if wanted & channels:
            ids.add(user.id)
    return ids


def add_for_supplier_managers(db: Session, channels, event_type: str, payload: dict) -> None:
    for user_id in supplier_manager_ids(db, channels):
        add_for_user(db, user_id, None, event_type, payload)
