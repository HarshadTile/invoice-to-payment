from sqlalchemy import Column, String, Integer, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(String(16), primary_key=True)
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

    comments = relationship("TicketComment", back_populates="ticket", cascade="all, delete")


class TicketComment(Base):
    __tablename__ = "ticket_comments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticket_id = Column(String(16), ForeignKey("tickets.id"))
    author = Column(String(64))
    role = Column(String(64))
    date = Column(String(32))
    text = Column(Text)
    seq = Column(Integer)

    ticket = relationship("Ticket", back_populates="comments")
