from datetime import datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.settings import AppSettings, TableRow
from app.models.user import User

AUDIT_TABLE_KEY = "settings-audit"


def write_audit(db: Session, actor: "User | str", action: str, detail: str):
    """Append a row to the Settings > Audit Logs table. That table is read-only in the UI
    and PUT /tables/settings-audit is refused, so appending directly here is the only way
    in. `actor` is a User, or a plain label for events with no account behind them (a
    failed login, a supplier vendor code)."""
    actor_name = actor.name if isinstance(actor, User) else str(actor)
    timestamp = datetime.now().strftime("%d %b %Y, %I:%M:%S %p")
    if db.get_bind().dialect.name == "mysql":
        from sqlalchemy.dialects.mysql import insert
        from app.core.permissions import DEFAULT_ROLE_MATRIX

        # Serialize audit appends across workers using the singleton settings row.
        # Locking only the last audit row can deadlock against the next insert's
        # gap lock. This upsert also works before the first settings save, without
        # overwriting any existing configuration. The lock lasts until commit.
        statement = insert(AppSettings).values(
            id=1, role_matrix_json=DEFAULT_ROLE_MATRIX, two_factor=False,
            sender_email="i2ptracker@company.com",
            invite_link_expiry_minutes=10080, reset_link_expiry_minutes=1440,
        )
        db.execute(statement.on_duplicate_key_update(id=AppSettings.id))
    for attempt in range(10):
        try:
            # A competing audit insert must not roll back a pending account/token
            # change. Retry just the audit row inside a savepoint.
            with db.begin_nested():
                # A locking read sees the latest committed row on MySQL even
                # when earlier permission queries established a repeatable-read
                # snapshot. A plain MAX() can keep retrying the same stale index.
                last_row = db.query(TableRow.row_index).filter(
                    TableRow.table_key == AUDIT_TABLE_KEY
                ).order_by(TableRow.row_index.desc()).with_for_update().first()
                last_index = last_row[0] if last_row else None
                next_index = 0 if last_index is None else last_index + 1
                db.add(TableRow(
                    table_key=AUDIT_TABLE_KEY,
                    row_index=next_index,
                    cells_json=[timestamp, actor_name, action, detail],
                ))
                db.flush()
        except IntegrityError:
            if attempt == 9:
                raise
            continue
        db.commit()
        return


def actor_from_token(db: Session, payload: dict) -> "User | str":
    """Who a JWT payload belongs to, for attributing an audit row to the caller."""
    if payload.get("auth_type") == "supplier":
        return f"Supplier {payload.get('sub')}"
    user = db.query(User).filter(User.id == int(payload.get("sub"))).first()
    return user or f"User #{payload.get('sub')}"

