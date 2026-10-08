from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List
from datetime import datetime

from app.api.v1.auth import get_current_user_token
from app.core.database import get_db
from app.models.ticket import Ticket, TicketComment
from app.schemas.ticket import TicketResponse, TicketCreate, TicketCommentCreate

router = APIRouter(
    prefix="/tickets",
    tags=["Tickets"],
)

@router.get("", response_model=List[TicketResponse])
def get_tickets(
    payload: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    query = db.query(Ticket).options(joinedload(Ticket.comments))
    if payload.get("auth_type") == "supplier":
        query = query.filter(Ticket.raised_by == payload.get("sub"))
    return query.all()

@router.post("", response_model=TicketResponse)
def create_ticket(
    ticket_in: TicketCreate,
    payload: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    new_ticket = Ticket(**ticket_in.model_dump())
    db.add(new_ticket)
    db.commit()
    db.refresh(new_ticket)
    return new_ticket

@router.post("/{ticket_id}/comments", response_model=TicketResponse)
def add_comment(
    ticket_id: str,
    comment_in: TicketCommentCreate,
    payload: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
        
    new_comment = TicketComment(**comment_in.model_dump(), ticket_id=ticket_id)
    db.add(new_comment)
    
    # Simple logic to update status if HQ replies
    if payload.get("auth_type") == "internal" and ticket.status != "Resolved":
        ticket.status = "In Progress"
        
    db.commit()
    
    # Reload ticket with comments
    ticket = db.query(Ticket).options(joinedload(Ticket.comments)).filter(Ticket.id == ticket_id).first()
    return ticket
