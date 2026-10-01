from datetime import datetime

from sqlalchemy.orm import Session

from app.models.settings import TableRow
from app.models.user import User


def write_audit(db: Session, actor: User, action: str, detail: str):
    """Append a row to the Settings > Audit Logs table. That table is read-only in the UI
    and never rewritten wholesale by the frontend, so appending directly here is safe."""
    next_index = db.query(TableRow).filter(TableRow.table_key == "settings-audit").count()
    timestamp = datetime.utcnow().strftime("%d %b %Y, %I:%M %p")
    db.add(TableRow(
        table_key="settings-audit", row_index=next_index,
        cells_json=[timestamp, actor.name, action, detail],
    ))
    db.commit()
