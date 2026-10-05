from fastapi import HTTPException


TRANSITIONS = {
    ("OPEN", "assign"): "IN_PROGRESS",
    ("IN_PROGRESS", "reassign"): "IN_PROGRESS",
    ("IN_PROGRESS", "resolve"): "RESOLVED",
    ("RESOLVED", "reopen"): "IN_PROGRESS",
    ("RESOLVED", "close"): "CLOSED",
    ("RESOLVED", "auto_close"): "CLOSED",
}


def transition(ticket, action: str) -> str:
    target = TRANSITIONS.get((ticket.status, action))
    if not target:
        raise HTTPException(
            status_code=409,
            detail={
                "error": {
                    "code": "INVALID_TRANSITION",
                    "message": f"Cannot {action} a ticket in {ticket.status}.",
                }
            },
        )
    return target
