from datetime import datetime

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.settings import TableRow
from app.models.user import User

AUDIT_TABLE_KEY = "settings-audit"


def write_audit(db: Session, actor: "User | str", action: str, detail: str):
    """Append a row to the Settings > Audit Logs table. That table is read-only in the UI
    and PUT /tables/settings-audit is refused, so appending directly here is the only way
    in. `actor` is a User, or a plain label for events with no account behind them (a
    failed login, a supplier vendor code)."""
    actor_name = actor.name if isinstance(actor, User) else str(actor)
    timestamp = datetime.now().strftime("%d %b %Y, %I:%M:%S %p")
    for attempt in range(10):
        last_index = db.query(func.max(TableRow.row_index)).filter(
            TableRow.table_key == AUDIT_TABLE_KEY
        ).scalar()
        next_index = 0 if last_index is None else last_index + 1
        db.add(TableRow(
            table_key=AUDIT_TABLE_KEY,
            row_index=next_index,
            cells_json=[timestamp, actor_name, action, detail],
        ))
        try:
            db.commit()
            return
        except IntegrityError:
            db.rollback()
            if attempt == 9:
                raise


def actor_from_token(db: Session, payload: dict) -> "User | str":
    """Who a JWT payload belongs to, for attributing an audit row to the caller."""
    if payload.get("auth_type") == "supplier":
        return f"Supplier {payload.get('sub')}"
    user = db.query(User).filter(User.id == int(payload.get("sub"))).first()
    return user or f"User #{payload.get('sub')}"

