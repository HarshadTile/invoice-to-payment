from sqlalchemy import BigInteger, Column, DateTime, Index, Integer, String, Text

from app.core.database import Base


class AuditLog(Base):
    """One security-relevant event: sign-ins, account and supplier changes, settings changes.
    Append-only (nothing in the app edits or deletes rows, except the retention job), stored
    with a UTC time, the person behind it and the caller's IP address."""
    __tablename__ = "audit_log"
    __table_args__ = (Index("ix_audit_log_category_time", "category", "occurred_at"),)

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    occurred_at = Column(DateTime, nullable=False, index=True)  # UTC
    category = Column(String(16), nullable=False)               # signin | failed | users | suppliers | settings | other
    action = Column(String(120), nullable=False)                 # "Logged in", "Invited user", ...
    actor = Column(String(191), nullable=False)                  # who, as shown on screen
    actor_type = Column(String(16), nullable=False)              # user | supplier | anonymous
    actor_id = Column(String(64), nullable=True)                 # users.id for staff
    detail = Column(Text, nullable=True)
    ip = Column(String(64), nullable=True)
