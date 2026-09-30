from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.ticket import Ticket
from app.models.ticket_activity import SlaPolicy

def compute_due_at(start: datetime, minutes: int, business_hours: bool = False) -> datetime:
    """
    Computes the due date based on minutes.
    In v1, business_hours is ignored (runs 24x7).
    """
    return start + timedelta(minutes=minutes)

def get_policy_minutes(db: Session, channel: str, priority: str) -> int:
    # First try channel-specific, then default (channel=None)
    policy = db.query(SlaPolicy).filter(
        SlaPolicy.priority == priority,
        SlaPolicy.channel == channel,
        SlaPolicy.active == True
    ).first()
    
    if not policy:
        policy = db.query(SlaPolicy).filter(
            SlaPolicy.priority == priority,
            SlaPolicy.channel.is_(None),
            SlaPolicy.active == True
        ).first()
        
    # fallback default if somehow no policy exists
    return policy.response_minutes if policy else 1440

def handle_sla_event(db: Session, ticket: Ticket, event: str):
    """
    Adjusts SLA fields based on events.
    Events: 'CREATED', 'REPLY_STAFF', 'REPLY_SUPPLIER', 'RESOLVED', 'REOPENED', 'CLOSED', 'PRIORITY_CHANGED'
    """
    now = datetime.utcnow()
    
    if event == 'CREATED':
        minutes = get_policy_minutes(db, ticket.channel, ticket.priority)
        ticket.awaiting = 'STAFF'
        ticket.response_due_at = compute_due_at(now, minutes)
        
    elif event == 'REPLY_STAFF':
        ticket.awaiting = 'SUPPLIER'
        ticket.response_due_at = None
        if not ticket.first_response_at:
            ticket.first_response_at = now
            
    elif event == 'REPLY_SUPPLIER':
        if ticket.status in ('OPEN', 'IN_PROGRESS'):
            minutes = get_policy_minutes(db, ticket.channel, ticket.priority)
            ticket.awaiting = 'STAFF'
            ticket.response_due_at = compute_due_at(now, minutes)
            
    elif event == 'INTERNAL_NOTE':
        pass # does not stop the clock
        
    elif event == 'RESOLVED':
        ticket.awaiting = 'SUPPLIER'
        ticket.response_due_at = None
        
    elif event == 'REOPENED':
        minutes = get_policy_minutes(db, ticket.channel, ticket.priority)
        ticket.awaiting = 'STAFF'
        ticket.response_due_at = compute_due_at(now, minutes)
        
    elif event == 'CLOSED':
        ticket.awaiting = 'NONE'
        ticket.response_due_at = None
        
    elif event == 'PRIORITY_CHANGED':
        if ticket.awaiting == 'STAFF' and ticket.response_due_at:
            # Recompute from current time
            minutes = get_policy_minutes(db, ticket.channel, ticket.priority)
            ticket.response_due_at = compute_due_at(now, minutes)
