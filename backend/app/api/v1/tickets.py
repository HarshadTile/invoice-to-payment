from fastapi import APIRouter, Depends, Query, Header
from sqlalchemy.orm import Session
from typing import List, Optional

from app.api.v1.auth import get_current_user_token
from app.core.database import get_db
from app.schemas.ticket import TicketResponse, TicketCreate, TicketCommentCreate, TicketAssignRequest, TicketResolveRequest, TicketReopenRequest, TicketPatchRequest
from app.services import ticket_service

router = APIRouter(
    tags=["Tickets"],
)

@router.get("/tickets", response_model=List[TicketResponse])
def get_tickets(
    status: Optional[str] = Query(None),
    channel: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    payload: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    filters = {"status": status, "channel": channel, "priority": priority}
    return ticket_service.list_tickets(db, payload, filters)

@router.post("/tickets", response_model=TicketResponse)
def create_ticket(
    ticket_in: TicketCreate,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    payload: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    return ticket_service.create_ticket(db, payload, ticket_in, idempotency_key)

@router.get("/tickets/{ticket_id}", response_model=TicketResponse)
def get_ticket(
    ticket_id: str,
    payload: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    return ticket_service.get_ticket(db, payload, ticket_id)

@router.post("/tickets/{ticket_id}/comments", response_model=TicketResponse)
def add_comment(
    ticket_id: str,
    comment_in: TicketCommentCreate,
    payload: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    return ticket_service.add_comment(db, payload, ticket_id, comment_in)

@router.post("/tickets/{ticket_id}/assign", response_model=TicketResponse)
def assign_ticket(
    ticket_id: str,
    assign_in: TicketAssignRequest,
    payload: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    return ticket_service.assign_ticket(db, payload, ticket_id, assign_in)

@router.post("/tickets/{ticket_id}/resolve", response_model=TicketResponse)
def resolve_ticket(
    ticket_id: str,
    resolve_in: TicketResolveRequest,
    payload: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    return ticket_service.resolve_ticket(db, payload, ticket_id, resolve_in)

@router.post("/tickets/{ticket_id}/close", response_model=TicketResponse)
def close_ticket(
    ticket_id: str,
    payload: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    return ticket_service.close_ticket(db, payload, ticket_id)

@router.post("/tickets/{ticket_id}/reopen", response_model=TicketResponse)
def reopen_ticket(
    ticket_id: str,
    reopen_in: TicketReopenRequest,
    payload: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    return ticket_service.reopen_ticket(db, payload, ticket_id, reopen_in)
