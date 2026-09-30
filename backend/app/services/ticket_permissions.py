def authorize(user: dict, ticket, action: str) -> bool:
    """
    user dictionary comes from the parsed JWT.
    format: 
      - Supplier: {"authType": "supplier", "vcode": "...", "company": "..."}
      - Internal: {"authType": "internal", "id": 1, "role": "Admin"|"CHANNEL_LEAD"|"ASSIGNEE", "channelScope": "all"|"msetuSrm"|...}
    
    ticket is the SQLAlchemy Ticket model.
    """
    auth_type = user.get("authType")
    
    # 1. Supplier Role
    if auth_type == "supplier":
        vendor_code = user.get("vcode")
        
        # Suppliers can only access tickets for their vendor_code
        if ticket and ticket.vendor_code != vendor_code:
            return False
            
        if action == "raise_ticket":
            return True
        elif action == "view":
            return True
        elif action == "assign":
            return False
        elif action == "reply":
            return True
        elif action == "internal_note":
            return False
        elif action == "view_internal":
            return False
        elif action == "change_priority":
            return False
        elif action == "resolve":
            return False
        elif action == "close":
            return ticket.status == "RESOLVED"
        elif action == "reopen":
            return ticket.status in ("RESOLVED", "CLOSED") # SLA service checks the 7 days rule later
        return False
        
    # 2. Internal Roles
    if auth_type == "internal":
        role = user.get("role", "").upper()
        scope = user.get("channelScope", "all")
        user_id = user.get("id")
        
        # Scope Check
        # Internal users can only access tickets if they have 'all' scope or their scope matches the ticket channel
        # Let's assume channelScope maps closely. In reality, we match ticket.channel
        # For simplicity, if scope != 'all', it must match
        if ticket and scope != "all":
            # Just basic mapping check, can be refined based on actual channel strings
            if scope.lower() not in (ticket.channel or "").lower().replace('_', ''):
                return False
                
        is_assignee = (ticket and ticket.assignee_id == user_id)
        is_lead = (role in ("CHANNEL_LEAD", "CHANNEL LEAD"))
        is_admin = (role == "ADMIN")
        
        if action == "raise_ticket":
            # Internal can raise on behalf of supplier
            return True
        elif action == "view":
            if is_admin or is_lead:
                return True
            return is_assignee
        elif action == "assign":
            return is_lead or is_admin
        elif action == "reply":
            return is_assignee or is_lead or is_admin
        elif action == "internal_note":
            return is_assignee or is_lead or is_admin
        elif action == "view_internal":
            return is_assignee or is_lead or is_admin
        elif action == "change_priority":
            return is_assignee or is_lead or is_admin
        elif action == "resolve":
            return is_assignee or is_lead or is_admin
        elif action == "close":
            return is_lead or is_admin
        elif action == "reopen":
            return is_lead or is_admin

    return False

def get_allowed_actions(user: dict, ticket) -> list:
    """Returns a list of actions allowed for this user on this ticket."""
    actions = ["view", "assign", "reply", "internal_note", "view_internal", "change_priority", "resolve", "close", "reopen"]
    return [a for a in actions if authorize(user, ticket, a)]
