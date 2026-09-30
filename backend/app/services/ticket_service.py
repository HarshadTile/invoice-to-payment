import uuid
from datetime import datetime
from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException

from app.models.ticket import Ticket, TicketComment
from app.models.user import User
from app.repositories import ticket_repository
from app.services.ticket_permissions import authorize, get_allowed_actions
from app.services.ticket_state_machine import validate_transition
from app.services.sla_service import handle_sla_event

def _check_version(ticket: Ticket, expected_version: int):
    if expected_version and ticket.row_version != expected_version:
        raise HTTPException(status_code=409, detail={"error": {"code": "VERSION_CONFLICT", "message": "Ticket has been updated by another user."}})

def _increment_version(ticket: Ticket):
    ticket.row_version += 1

def list_tickets(db: Session, user: dict, filters: dict = None):
    query = ticket_repository.scoped_query(db, user)
    # Apply filters if provided
    if filters:
        if filters.get("status"):
            query = query.filter(Ticket.status == filters["status"])
        if filters.get("channel"):
            query = query.filter(Ticket.channel == filters["channel"])
        if filters.get("priority"):
            query = query.filter(Ticket.priority == filters["priority"])
            
    tickets = query.options(joinedload(Ticket.comments)).order_by(Ticket.created_at.desc()).all()
    return [_format_ticket_response(db, user, t) for t in tickets]

def get_ticket(db: Session, user: dict, ticket_id: str):
    ticket = ticket_repository.get_ticket_or_404(db, user, ticket_id)
    if not authorize(user, ticket, "view"):
        raise HTTPException(status_code=403, detail="Not authorized to view this ticket")
    return _format_ticket_response(db, user, ticket)

def create_ticket(db: Session, user: dict, ticket_in, idempotency_key: str = None):
    auth_type = user.get("authType")
    vendor_code = ticket_in.vendor_code
    channel = "UNKNOWN"
    
    if idempotency_key:
        from app.models.ticket_activity import TicketActivity
        from sqlalchemy import cast
        from sqlalchemy.dialects.mysql import JSON
        # Check if we already processed this key
        # SQLite / generic JSON path might be tricky, so let's just do a basic text search or assume meta_data has it
        # Assuming JSON meta_data format: {"idempotency_key": "xxx"}
        # For a production DB we'd use JSON extracts, but let's do a simple filter for now
        existing = db.query(TicketActivity).filter(
            TicketActivity.event == "CREATED",
            TicketActivity.actor_id == (user.get("id") if auth_type == "internal" else None)
        ).all()
        for ex in existing:
            if ex.meta_data and ex.meta_data.get("idempotency_key") == idempotency_key:
                return get_ticket(db, user, ex.ticket_id)
                
    if auth_type == "supplier":
        vendor_code = user.get("vcode")
    elif auth_type == "internal":
        if not vendor_code:
            raise HTTPException(status_code=422, detail="vendor_code required for internal staff creating tickets")
            
    # For now, default channel if we don't look up invoice
    # In a real app we'd look up the Invoice by invoice_id and set the channel and fy
    
    ticket_id = uuid.uuid4().hex[:16]
    
    new_ticket = Ticket(
        id=ticket_id,
        category=ticket_in.category,
        priority=ticket_in.priority,
        subject=ticket_in.subject,
        description=ticket_in.description,
        invoice_id=ticket_in.invoice_id,
        vendor_code=vendor_code,
        channel=channel,
        fy="2026-27",
        status="OPEN",
        source="SUPPLIER" if auth_type == "supplier" else "INTERNAL",
        raised_by=user.get("vcode") if auth_type == "supplier" else str(user.get("id")),
        assignee="",
        raised_date=datetime.utcnow().strftime("%Y-%m-%d"),
        sla_hours=24,
        resolved_date=""
    )
    
    new_ticket.no = f"QRY-{new_ticket.id[:6].upper()}"
    
    handle_sla_event(db, new_ticket, "CREATED")
    db.add(new_ticket)
    
    actor_id = user.get("id") if auth_type == "internal" else None
    
    meta = {}
    if idempotency_key:
        meta["idempotency_key"] = idempotency_key
        
    ticket_repository.add_activity(db, new_ticket.id, actor_id, "CREATED", meta_data=meta)
    
    db.commit()
    db.refresh(new_ticket)
    
    return _format_ticket_response(db, user, new_ticket)

def add_comment(db: Session, user: dict, ticket_id: str, comment_in):
    ticket = ticket_repository.get_ticket_or_404(db, user, ticket_id)
    
    if comment_in.visibility == "INTERNAL":
        if not authorize(user, ticket, "internal_note"):
            raise HTTPException(status_code=403, detail="Not authorized to add internal notes")
    else:
        if not authorize(user, ticket, "reply"):
            raise HTTPException(status_code=403, detail="Not authorized to reply")
            
    _check_version(ticket, getattr(comment_in, 'expected_version', None))
    
    auth_type = user.get("authType")
    
    if comment_in.visibility == "PUBLIC":
        event = "REPLY_SUPPLIER" if auth_type == "supplier" else "REPLY_STAFF"
        handle_sla_event(db, ticket, event)
        activity_event = "REPLIED"
    else:
        handle_sla_event(db, ticket, "INTERNAL_NOTE")
        activity_event = "NOTE_ADDED"
        
    author_name = user.get("company", "Supplier") if auth_type == "supplier" else user.get("name", "Staff")
    author_id = user.get("id") if auth_type == "internal" else None
    
    new_comment = TicketComment(
        ticket_id=ticket.id,
        text=comment_in.text,
        visibility=comment_in.visibility,
        author=author_name,
        author_id=author_id,
        role=user.get("role", "Supplier") if auth_type == "internal" else "Supplier",
        date=datetime.utcnow().strftime("%Y-%m-%d"),
        seq=0
    )
    
    db.add(new_comment)
    _increment_version(ticket)
    ticket_repository.add_activity(db, ticket.id, author_id, activity_event)
    
    db.commit()
    return _format_ticket_response(db, user, ticket)

def assign_ticket(db: Session, user: dict, ticket_id: str, assign_in):
    ticket = ticket_repository.get_ticket_or_404(db, user, ticket_id)
    if not authorize(user, ticket, "assign"):
        raise HTTPException(status_code=403, detail="Not authorized to assign")
        
    _check_version(ticket, assign_in.expected_version)
    validate_transition(ticket, "IN_PROGRESS", user)
    
    ticket.assignee_id = assign_in.assignee_id
    if ticket.status == "OPEN":
        ticket.status = "IN_PROGRESS"
        
    author_id = user.get("id")
    
    if assign_in.note:
        db.add(TicketComment(
            ticket_id=ticket.id,
            text=assign_in.note,
            visibility="INTERNAL",
            author=user.get("name"),
            author_id=author_id,
            role=user.get("role"),
            date=datetime.utcnow().strftime("%Y-%m-%d"),
            seq=0
        ))
        
    _increment_version(ticket)
    ticket_repository.add_activity(db, ticket.id, author_id, "ASSIGNED", {"assignee_id": assign_in.assignee_id})
    db.commit()
    return _format_ticket_response(db, user, ticket)

def resolve_ticket(db: Session, user: dict, ticket_id: str, resolve_in):
    ticket = ticket_repository.get_ticket_or_404(db, user, ticket_id)
    if not authorize(user, ticket, "resolve"):
        raise HTTPException(status_code=403, detail="Not authorized to resolve")
        
    _check_version(ticket, resolve_in.expected_version)
    validate_transition(ticket, "RESOLVED", user)
    
    ticket.status = "RESOLVED"
    handle_sla_event(db, ticket, "RESOLVED")
    
    author_id = user.get("id")
    
    db.add(TicketComment(
        ticket_id=ticket.id,
        text=resolve_in.resolution_note,
        visibility="PUBLIC",
        author=user.get("name"),
        author_id=author_id,
        role=user.get("role"),
        date=datetime.utcnow().strftime("%Y-%m-%d"),
        seq=0
    ))
    
    _increment_version(ticket)
    ticket_repository.add_activity(db, ticket.id, author_id, "RESOLVED")
    db.commit()
    return _format_ticket_response(db, user, ticket)

def close_ticket(db: Session, user: dict, ticket_id: str):
    ticket = ticket_repository.get_ticket_or_404(db, user, ticket_id)
    if not authorize(user, ticket, "close"):
        raise HTTPException(status_code=403, detail="Not authorized to close")
        
    validate_transition(ticket, "CLOSED", user)
    
    ticket.status = "CLOSED"
    ticket.closed_at = datetime.utcnow()
    handle_sla_event(db, ticket, "CLOSED")
    
    author_id = user.get("id") if user.get("authType") == "internal" else None
    
    _increment_version(ticket)
    ticket_repository.add_activity(db, ticket.id, author_id, "CLOSED")
    db.commit()
    return _format_ticket_response(db, user, ticket)

def reopen_ticket(db: Session, user: dict, ticket_id: str, reopen_in):
    ticket = ticket_repository.get_ticket_or_404(db, user, ticket_id)
    if not authorize(user, ticket, "reopen"):
        raise HTTPException(status_code=403, detail="Not authorized to reopen")
        
    _check_version(ticket, getattr(reopen_in, 'expected_version', None))
    validate_transition(ticket, "IN_PROGRESS", user)
    
    ticket.status = "IN_PROGRESS"
    ticket.reopen_count += 1
    handle_sla_event(db, ticket, "REOPENED")
    
    auth_type = user.get("authType")
    author_name = user.get("company", "Supplier") if auth_type == "supplier" else user.get("name", "Staff")
    author_id = user.get("id") if auth_type == "internal" else None
    
    db.add(TicketComment(
        ticket_id=ticket.id,
        text=reopen_in.reason,
        visibility="PUBLIC",
        author=author_name,
        author_id=author_id,
        role=user.get("role", "Supplier") if auth_type == "internal" else "Supplier",
        date=datetime.utcnow().strftime("%Y-%m-%d"),
        seq=0
    ))
    
    _increment_version(ticket)
    ticket_repository.add_activity(db, ticket.id, author_id, "REOPENED")
    db.commit()
    return _format_ticket_response(db, user, ticket)

def _format_ticket_response(db: Session, user: dict, ticket: Ticket):
    allowed = get_allowed_actions(user, ticket)
    
    now = datetime.utcnow()
    breached = False
    overdue_minutes = 0
    if ticket.awaiting == 'STAFF' and ticket.status in ('OPEN', 'IN_PROGRESS') and ticket.response_due_at:
        if now > ticket.response_due_at:
            breached = True
            overdue_minutes = int((now - ticket.response_due_at).total_seconds() / 60)
            
    assignee = None
    if ticket.assignee_id:
        if user.get("authType") == "supplier":
            assignee = {"id": 0, "name": f"{ticket.channel} Team" if ticket.channel else "Support Team"}
        else:
            u = db.query(User).filter(User.id == ticket.assignee_id).first()
            if u:
                assignee = {"id": u.id, "name": u.name}
                
    filtered_comments = []
    for c in ticket.comments:
        if user.get("authType") == "supplier" and c.visibility != "PUBLIC":
            continue
        c_dict = c.__dict__.copy()
        filtered_comments.append(c_dict)

    res = ticket.__dict__.copy()
    res['comments'] = filtered_comments
    res['allowed_actions'] = allowed
    res['sla'] = {
        "response_due_at": ticket.response_due_at,
        "breached": breached,
        "overdue_minutes": overdue_minutes
    }
    res['assignee'] = assignee
    return res
