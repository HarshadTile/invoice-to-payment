from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Header, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.v1.auth import get_ticket_user
from app.core.audit import write_audit
from app.core.database import get_db
from app.repositories import ticket_repository
from app.schemas.ticket import (
    AssignableUserResponse,
    AttachmentResponse,
    StaffLogEntry,
    SupplierLogEntry,
    TicketActivityResponse,
    TicketAssignRequest,
    TicketBoardResponse,
    TicketCloseRequest,
    TicketCommentCreate,
    TicketCommentResponse,
    TicketCreate,
    TicketPage,
    TicketPatchRequest,
    TicketReopenRequest,
    TicketResolveRequest,
    TicketResponse,
    TicketSummaryResponse,
)
from app.services import attachment_service, ticket_service


router = APIRouter(prefix="/tickets", tags=["Tickets"])


def _audit_actor(user: dict) -> str:
    if user["auth_type"] == "supplier":
        return f"Supplier {user['vendor_code']}"
    return user.get("name") or user.get("email") or f"User #{user.get('id')}"


def _filters(
    status: str | None,
    channel: str | None,
    priority: str | None,
    assignee_id: int | None,
    vendor_code: str | None,
    invoice_no: str | None,
    sla: str | None,
    q: str | None,
    fy: str | None,
    include_closed: bool,
):
    return locals()


@router.get("", response_model=TicketPage)
def list_tickets(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    channel: str | None = None,
    priority: str | None = None,
    assignee_id: int | None = None,
    vendor_code: str | None = None,
    invoice_no: str | None = None,
    sla: str | None = None,
    q: str | None = None,
    fy: str | None = None,
    include_closed: bool = False,
    user: dict = Depends(get_ticket_user),
    db: Session = Depends(get_db),
):
    filters = _filters(status, channel, priority, assignee_id, vendor_code, invoice_no, sla, q, fy, include_closed)
    return ticket_service.list_tickets(db, user, filters, page, page_size)


@router.post("", response_model=TicketResponse, status_code=201)
def create_ticket(
    ticket_in: TicketCreate,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key", max_length=128),
    user: dict = Depends(get_ticket_user),
    db: Session = Depends(get_db),
):
    ticket = ticket_service.create_ticket(db, user, ticket_in, idempotency_key)
    write_audit(
        db,
        _audit_actor(user),
        "Raised query",
        f"{ticket['ticket_no']} on invoice {ticket['invoice']['invoice_no']}",
    )
    return ticket


@router.get("/summary", response_model=TicketSummaryResponse)
def get_summary(
    channel: str | None = None,
    priority: str | None = None,
    vendor_code: str | None = None,
    invoice_no: str | None = None,
    fy: str | None = None,
    user: dict = Depends(get_ticket_user),
    db: Session = Depends(get_db),
):
    return ticket_service.summary(db, user, {"channel": channel, "priority": priority, "vendor_code": vendor_code, "invoice_no": invoice_no, "fy": fy})


@router.get("/board", response_model=TicketBoardResponse)
def get_board(
    channel: str | None = None,
    priority: str | None = None,
    fy: str | None = None,
    user: dict = Depends(get_ticket_user),
    db: Session = Depends(get_db),
):
    return ticket_service.board(db, user, {"channel": channel, "priority": priority, "fy": fy})


@router.get("/assignable-users", response_model=list[AssignableUserResponse])
def get_assignable_users(
    channel: str,
    user: dict = Depends(get_ticket_user),
    db: Session = Depends(get_db),
):
    return ticket_service.assignable_users(db, user, channel)


@router.get("/activity-log", response_model=list[StaffLogEntry])
def get_activity_log(user: dict = Depends(get_ticket_user), db: Session = Depends(get_db)):
    return ticket_service.staff_activity_log(db, user)


@router.get("/supplier-log", response_model=list[SupplierLogEntry])
def get_supplier_log(user: dict = Depends(get_ticket_user), db: Session = Depends(get_db)):
    return ticket_service.supplier_query_log(db, user)


@router.get("/{ticket_id}", response_model=TicketResponse)
def get_ticket(ticket_id: str, user: dict = Depends(get_ticket_user), db: Session = Depends(get_db)):
    return ticket_service.get_ticket(db, user, ticket_id)


@router.get("/{ticket_id}/comments", response_model=list[TicketCommentResponse])
def get_comments(
    ticket_id: str,
    after_id: int | None = Query(None, ge=0),
    user: dict = Depends(get_ticket_user),
    db: Session = Depends(get_db),
):
    return ticket_service.get_comments(db, user, ticket_id, after_id)

@router.post("/{ticket_id}/comments", response_model=TicketResponse)
def add_comment(
    ticket_id: str,
    comment_in: TicketCommentCreate,
    user: dict = Depends(get_ticket_user),
    db: Session = Depends(get_db),
):
    ticket = ticket_service.add_comment(db, user, ticket_id, comment_in)
    write_audit(
        db,
        _audit_actor(user),
        "Commented on query",
        f"{ticket['ticket_no']} on invoice {ticket['invoice']['invoice_no']}",
    )
    return ticket


@router.post("/{ticket_id}/assign", response_model=TicketResponse)
def assign_ticket(
    ticket_id: str,
    assign_in: TicketAssignRequest,
    user: dict = Depends(get_ticket_user),
    db: Session = Depends(get_db),
):
    return ticket_service.assign_ticket(db, user, ticket_id, assign_in)


@router.patch("/{ticket_id}", response_model=TicketResponse)
def patch_ticket(
    ticket_id: str,
    patch_in: TicketPatchRequest,
    user: dict = Depends(get_ticket_user),
    db: Session = Depends(get_db),
):
    return ticket_service.patch_ticket(db, user, ticket_id, patch_in)


@router.post("/{ticket_id}/resolve", response_model=TicketResponse)
def resolve_ticket(
    ticket_id: str,
    resolve_in: TicketResolveRequest,
    user: dict = Depends(get_ticket_user),
    db: Session = Depends(get_db),
):
    return ticket_service.resolve_ticket(db, user, ticket_id, resolve_in)


@router.post("/{ticket_id}/close", response_model=TicketResponse)
def close_ticket(
    ticket_id: str,
    close_in: TicketCloseRequest,
    user: dict = Depends(get_ticket_user),
    db: Session = Depends(get_db),
):
    return ticket_service.close_ticket(db, user, ticket_id, close_in)


@router.post("/{ticket_id}/reopen", response_model=TicketResponse)
def reopen_ticket(
    ticket_id: str,
    reopen_in: TicketReopenRequest,
    user: dict = Depends(get_ticket_user),
    db: Session = Depends(get_db),
):
    return ticket_service.reopen_ticket(db, user, ticket_id, reopen_in)


@router.post("/{ticket_id}/read")
def mark_read(ticket_id: str, user: dict = Depends(get_ticket_user), db: Session = Depends(get_db)):
    return ticket_service.mark_read(db, user, ticket_id)


@router.get("/{ticket_id}/activity", response_model=list[TicketActivityResponse])
def get_activity(ticket_id: str, user: dict = Depends(get_ticket_user), db: Session = Depends(get_db)):
    return ticket_service.get_activity(db, user, ticket_id)


@router.post("/{ticket_id}/attachments", response_model=AttachmentResponse, status_code=201)
async def upload_attachment(
    ticket_id: str,
    file: UploadFile = File(...),
    visibility: Literal["PUBLIC", "INTERNAL"] = Form("PUBLIC"),
    expected_version: int = Form(...),
    comment_id: int | None = Form(None),
    user: dict = Depends(get_ticket_user),
    db: Session = Depends(get_db),
):
    return await ticket_service.upload_attachment(db, user, ticket_id, file, visibility, expected_version, comment_id)


@router.get("/{ticket_id}/attachments/{attachment_id}")
def download_attachment(
    ticket_id: str,
    attachment_id: int,
    user: dict = Depends(get_ticket_user),
    db: Session = Depends(get_db),
):
    attachment = ticket_repository.attachment_or_404(db, user, ticket_id, attachment_id)
    path = attachment_service.stored_path(attachment)
    return FileResponse(path, media_type=attachment.mime_type, filename=attachment.original_name)
