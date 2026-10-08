from pydantic import BaseModel
from typing import List, Optional

class TicketCommentBase(BaseModel):
    author: str
    role: str
    date: str
    text: str
    seq: int

class TicketCommentCreate(TicketCommentBase):
    pass

class TicketCommentResponse(TicketCommentBase):
    id: int
    ticket_id: str

    class Config:
        from_attributes = True

class TicketBase(BaseModel):
    no: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee: Optional[str] = None
    raised_by: Optional[str] = None
    raised_date: Optional[str] = None
    sla_hours: Optional[int] = None
    resolved_date: Optional[str] = None

class TicketCreate(TicketBase):
    id: str
    no: str

class TicketResponse(TicketBase):
    id: str
    comments: List[TicketCommentResponse] = []

    class Config:
        from_attributes = True
