from sqlalchemy import BigInteger, Boolean, Column, String, Integer, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(String(16), primary_key=True)
    ticket_sequence = Column(BigInteger, nullable=False, unique=True, autoincrement=True)
    ticket_no = Column(String(20), nullable=True, unique=True)
    invoice_no = Column(String(64), nullable=True, index=True)
    no = Column(String(32))
    category = Column(String(64))
    description = Column(Text)
    status = Column(String(32))
    priority = Column(String(16))
    assignee = Column(String(64))
    raised_by = Column(String(32))
    raised_date = Column(String(32))
    sla_hours = Column(Integer)
    resolved_date = Column(String(32))

    # New columns for Phase 1
    subject = Column(String(150), nullable=True)
    channel = Column(String(32), nullable=True)
    fy = Column(String(9), nullable=True)
    vendor_code = Column(String(32), nullable=True)
    invoice_id = Column(Integer, nullable=True)
    awaiting = Column(String(32), default="STAFF", nullable=False)
    source = Column(String(32), default="SUPPLIER", nullable=False)
    assignee_id = Column(Integer, nullable=True)
    response_due_at = Column(DateTime, nullable=True)
    first_response_at = Column(DateTime, nullable=True)
    sla_started_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    reopen_count = Column(Integer, default=0, nullable=False)
    row_version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    legacy_unlinked = Column(Boolean, default=False, nullable=False)

    comments = relationship("TicketComment", back_populates="ticket", cascade="all, delete-orphan")
    activities = relationship("TicketActivity", back_populates="ticket", cascade="all, delete-orphan")
    attachments = relationship("TicketAttachment", back_populates="ticket", cascade="all, delete-orphan")


class TicketComment(Base):
    __tablename__ = "ticket_comments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticket_id = Column(String(16), ForeignKey("tickets.id"))
    author = Column(String(64))
    author_id = Column(Integer, nullable=True)
    role = Column(String(64))
    visibility = Column(String(16), default="PUBLIC", nullable=False)
    date = Column(String(32))
    text = Column(Text)
    seq = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    ticket = relationship("Ticket", back_populates="comments")
