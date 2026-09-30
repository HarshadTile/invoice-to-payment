from sqlalchemy.orm import Session
from app.models.ticket import Ticket
from app.models.ticket_activity import TicketActivity
from fastapi import HTTPException

def scoped_query(db: Session, user: dict):
    """
    Returns a SQLAlchemy query for Tickets, correctly scoped to the user's role and identity.
    """
    query = db.query(Ticket)
    
    auth_type = user.get("authType")
    if auth_type == "supplier":
        vcode = user.get("vcode")
        if not vcode:
            raise HTTPException(status_code=403, detail="Supplier session missing vendor code")
        return query.filter(Ticket.vendor_code == vcode)
        
    elif auth_type == "internal":
        role = user.get("role", "").upper()
        scope = user.get("channelScope", "all")
        
        if role == "ADMIN" or scope == "all":
            return query
            
        scope_mapping = {
            "msetusrm": "MSETU_SRM",
            "poportal": "PO_PORTAL",
            "manual": "MANUAL",
            "mfoxportal": "MFOX"
        }
        channel_enum = scope_mapping.get(scope.lower(), scope.upper())
        return query.filter(Ticket.channel == channel_enum)
        
    raise HTTPException(status_code=403, detail="Unknown auth type")

def get_ticket_or_404(db: Session, user: dict, ticket_id: str) -> Ticket:
    ticket = scoped_query(db, user).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Ticket not found or access denied"}})
    return ticket

def add_activity(db: Session, ticket_id: str, actor_id: int, event: str, meta_data: dict = None):
    activity = TicketActivity(
        ticket_id=ticket_id,
        actor_id=actor_id,
        event=event,
        meta_data=meta_data
    )
    db.add(activity)
