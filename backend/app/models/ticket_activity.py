from sqlalchemy import Column, String, Integer, Text, ForeignKey, DateTime, Boolean, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class TicketActivity(Base):
    __tablename__ = "ticket_activity"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticket_id = Column(String(16), ForeignKey("tickets.id"), nullable=False, index=True)
    actor_id = Column(Integer, nullable=True) # NULL for system
    event = Column(String(40), nullable=False)
    meta_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    ticket = relationship("Ticket", back_populates="activities")

class TicketAttachment(Base):
    __tablename__ = "ticket_attachments"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    ticket_id = Column(String(16), ForeignKey("tickets.id"), nullable=False, index=True)
    comment_id = Column(Integer, ForeignKey("ticket_comments.id"), nullable=True)
    uploaded_by = Column(Integer, nullable=False)
    original_name = Column(String(255), nullable=False)
    stored_key = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    visibility = Column(String(16), default="PUBLIC", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class SlaPolicy(Base):
    __tablename__ = "sla_policies"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    channel = Column(String(20), nullable=True)
    priority = Column(String(16), nullable=False)
    response_minutes = Column(Integer, nullable=False)
    business_hours = Column(Boolean, default=False, nullable=False)
    active = Column(Boolean, default=True, nullable=False)

class TicketRead(Base):
    __tablename__ = "ticket_reads"
    
    ticket_id = Column(String(16), ForeignKey("tickets.id"), primary_key=True, nullable=False)
    user_id = Column(Integer, primary_key=True, nullable=False)
    last_read_at = Column(DateTime, nullable=False)

class Notification(Base):
    __tablename__ = "notifications"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    ticket_id = Column(String(16), ForeignKey("tickets.id"), nullable=True)
    type = Column(String(40), nullable=False)
    payload = Column(JSON, nullable=True)
    read_at = Column(DateTime, nullable=True)
    emailed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
