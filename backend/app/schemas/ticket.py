from datetime import datetime
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator


Priority = Literal["LOW", "MEDIUM", "HIGH"]
Visibility = Literal["PUBLIC", "INTERNAL"]


class TicketCreate(BaseModel):
    invoice_no: str = Field(min_length=1, max_length=64)
    category: str = Field(min_length=1, max_length=64)
    priority: Priority = "MEDIUM"
    subject: str = Field(min_length=1, max_length=150)
    description: str = Field(min_length=1, max_length=5000)

    @field_validator("invoice_no", "category", "subject", "description")
    @classmethod
    def trim_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class VersionedRequest(BaseModel):
    expected_version: int = Field(ge=1)


class TicketCommentCreate(VersionedRequest):
    body: str = Field(min_length=1, max_length=5000, validation_alias=AliasChoices("body", "text"))
    visibility: Visibility = "PUBLIC"

    @field_validator("body")
    @classmethod
    def trim_body(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class TicketAssignRequest(VersionedRequest):
    assignee_id: int = Field(gt=0)
    note: str | None = Field(default=None, max_length=5000)


class TicketResolveRequest(VersionedRequest):
    resolution_note: str = Field(min_length=1, max_length=5000)


class TicketReopenRequest(VersionedRequest):
    reason: str = Field(min_length=1, max_length=5000)


class TicketCloseRequest(VersionedRequest):
    pass


class TicketPatchRequest(VersionedRequest):
    priority: Priority | None = None
    category: str | None = Field(default=None, min_length=1, max_length=64)


class TicketCommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ticket_id: str
    author: str
    author_id: int | None = None
    author_role: str
    visibility: Visibility
    body: str
    created_at: datetime


class AssigneeResponse(BaseModel):
    id: int | None = None
    name: str | None = None
    team: str | None = None


class InvoiceSummary(BaseModel):
    invoice_no: str
    po_no: str | None = None
    amount: str | None = None
    status: str | None = None


class SlaResponse(BaseModel):
    response_due_at: datetime | None = None
    reply_expected_by: datetime | None = None
    breached: bool = False
    overdue_minutes: int = 0


class AttachmentResponse(BaseModel):
    id: int
    comment_id: int | None = None
    original_name: str
    mime_type: str
    size_bytes: int
    visibility: Visibility
    created_at: datetime


class TicketResponse(BaseModel):
    id: str
    ticket_no: str
    invoice_no: str | None
    invoice: InvoiceSummary | None = None
    channel: str | None
    fy: str | None
    vendor_code: str | None
    category: str
    priority: Priority
    subject: str
    description: str
    status: str
    awaiting: str
    source: str
    assignee: AssigneeResponse | None = None
    sla: SlaResponse
    unread: bool = False
    reopen_count: int
    row_version: int
    legacy_unlinked: bool = False
    allowed_actions: list[str]
    comments: list[TicketCommentResponse] = []
    attachments: list[AttachmentResponse] = []
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None = None
    closed_at: datetime | None = None


class TicketPage(BaseModel):
    items: list[TicketResponse]
    page: int
    page_size: int
    total: int


class TicketSummaryResponse(BaseModel):
    open: int
    in_progress: int
    sla_breached: int
    resolved_closed: int


class TicketBoardResponse(BaseModel):
    open: list[TicketResponse]
    in_progress: list[TicketResponse]
    resolved: list[TicketResponse]
    closed: list[TicketResponse]


class TicketActivityResponse(BaseModel):
    id: int
    event: str
    actor_id: int | None
    meta: dict[str, Any] | None = None
    created_at: datetime


class AssignableUserResponse(BaseModel):
    id: int
    name: str
    role: str
