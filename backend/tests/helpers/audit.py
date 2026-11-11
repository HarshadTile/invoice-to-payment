"""Reading the audit log in tests."""
from app.core.database import SessionLocal
from app.models.audit_log import AuditLog


def audit_rows() -> list[tuple]:
    """Every audit row, oldest first, as (who, action, detail, ip, category)."""
    with SessionLocal() as db:
        return [(r.actor, r.action, r.detail, r.ip, r.category) for r in db.query(AuditLog).order_by(AuditLog.id).all()]


def audit_count() -> int:
    with SessionLocal() as db:
        return db.query(AuditLog).count()
