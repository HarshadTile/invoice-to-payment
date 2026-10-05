PUBLIC_ACTIONS = (
    "reply", "note", "assign", "reassign", "change_priority", "resolve",
    "close", "reopen", "attach_public", "attach_internal",
)


def authorize(user: dict, ticket, action: str) -> bool:
    if ticket.legacy_unlinked:
        return action == "view"

    if user["auth_type"] == "supplier":
        if ticket.vendor_code not in user["vendor_codes"]:
            return False
        if action == "view":
            return True
        if action in ("reply", "attach_public"):
            return ticket.status in ("OPEN", "IN_PROGRESS")
        if action in ("close", "reopen"):
            return ticket.status == "RESOLVED"
        return False

    role = user["ticket_role"]
    is_assignee = ticket.assignee_id == user["user_id"]
    can_manage = role == "ADMIN" or (
        role == "CHANNEL_LEAD" and ticket.channel in user["allowed_channels"]
    )
    if action == "view":
        return can_manage or is_assignee
    if action == "assign":
        return can_manage and ticket.status == "OPEN"
    if action == "reassign":
        return can_manage and ticket.status == "IN_PROGRESS"
    if action == "change_priority":
        return can_manage and ticket.status not in ("RESOLVED", "CLOSED")
    if action in ("note", "attach_internal"):
        return (can_manage or is_assignee) and ticket.status != "CLOSED"
    if action in ("reply", "attach_public", "resolve"):
        return is_assignee and ticket.status == "IN_PROGRESS"
    return False


def can_create(user: dict, channel: str) -> bool:
    if user["auth_type"] == "supplier":
        return True
    return user["ticket_role"] == "ADMIN" or (
        user["ticket_role"] == "CHANNEL_LEAD" and channel in user["allowed_channels"]
    )


def get_allowed_actions(user: dict, ticket) -> list[str]:
    return [action for action in PUBLIC_ACTIONS if authorize(user, ticket, action)]
