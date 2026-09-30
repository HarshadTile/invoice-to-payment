from fastapi import HTTPException

# from_status -> to_status -> allowed_actors (mapped by their logical role in this context)
VALID_TRANSITIONS = {
    "OPEN": {
        "IN_PROGRESS": ["CHANNEL_LEAD", "ADMIN"]
    },
    "IN_PROGRESS": {
        "IN_PROGRESS": ["CHANNEL_LEAD", "ADMIN"], # reassign
        "RESOLVED": ["ASSIGNEE", "CHANNEL_LEAD", "ADMIN"]
    },
    "RESOLVED": {
        "CLOSED": ["SUPPLIER", "CHANNEL_LEAD", "ADMIN", "SYSTEM"],
        "IN_PROGRESS": ["SUPPLIER", "CHANNEL_LEAD", "ADMIN"] # reopen
    },
    "CLOSED": {
        "IN_PROGRESS": ["SUPPLIER", "CHANNEL_LEAD", "ADMIN"] # reopen
    }
}

def get_logical_role(user: dict, ticket) -> str:
    """Map the JWT user to one of the logical roles for the state machine."""
    if user.get("authType") == "supplier":
        return "SUPPLIER"
    if user.get("authType") == "system":
        return "SYSTEM"
        
    role = user.get("role", "").upper()
    if role == "ADMIN":
        return "ADMIN"
    if role in ("CHANNEL_LEAD", "CHANNEL LEAD"):
        return "CHANNEL_LEAD"
        
    if ticket and ticket.assignee_id == user.get("id"):
        return "ASSIGNEE"
        
    return "STAFF"

def validate_transition(ticket, new_status: str, user: dict):
    if ticket.status == new_status and new_status != "IN_PROGRESS":
        raise HTTPException(status_code=409, detail={"error": {"code": "INVALID_TRANSITION", "message": f"Ticket is already {new_status}"}})
        
    logical_role = get_logical_role(user, ticket)
    allowed_roles = VALID_TRANSITIONS.get(ticket.status, {}).get(new_status)
    
    if allowed_roles is None:
         raise HTTPException(status_code=409, detail={"error": {"code": "INVALID_TRANSITION", "message": f"Cannot transition from {ticket.status} to {new_status}"}})
         
    if logical_role not in allowed_roles:
         raise HTTPException(status_code=409, detail={"error": {"code": "INVALID_TRANSITION", "message": f"Role {logical_role} cannot transition from {ticket.status} to {new_status}"}})
         
    return True
