from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class TicketCommentBase(BaseModel):
    text: str
    visibility: str = "PUBLIC"

class TicketCommentCreate(TicketCommentBase):
    expected_version: Optional[int] = None

class TicketCommentResponse(TicketCommentBase):
    id: int
    ticket_id: str
    author: str
    author_id: Optional[int] = None
    role: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class TicketBase(BaseModel):
    invoice_id: Optional[int] = None
    category: str
    priority: str = "MEDIUM"
    subject: str
    description: str
    vendor_code: Optional[str] = None

class TicketCreate(TicketBase):
    pass

class SlaResponse(BaseModel):
    response_due_at: Optional[datetime] = None
    breached: bool = False
    overdue_minutes: int = 0

class AssigneeResponse(BaseModel):
    id: int
    name: str

class InvoiceResponse(BaseModel):
    id: int
    invoice_no: str
    po_no: str
    amount: str
    status: str

class TicketResponse(TicketBase):
    id: str
    ticket_no: Optional[str] = Field(default=None, alias="no")
    status: str
    awaiting: str
    channel: Optional[str] = None
    fy: Optional[str] = None
    
    assignee: Optional[AssigneeResponse] = None
    sla: Optional[SlaResponse] = None
    
    reopen_count: int
    row_version: int
    created_at: datetime
    updated_at: datetime
    
    allowed_actions: List[str] = []
    unread: bool = False

    comments: List[TicketCommentResponse] = []

    class Config:
        from_attributes = True
        populate_by_name = True

class TicketAssignRequest(BaseModel):
    assignee_id: int
    note: Optional[str] = None
    expected_version: int

class TicketResolveRequest(BaseModel):
    resolution_note: str
    expected_version: int

class TicketReopenRequest(BaseModel):
    reason: str
    expected_version: int

class TicketPatchRequest(BaseModel):
    priority: Optional[str] = None
    category: Optional[str] = None
    expected_version: int
