from types import SimpleNamespace

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
    # Queries are raised by suppliers about their own invoices. The internal team answers and
    # manages them; it never opens one (so there is no staff-created ticket to look after).
    return user["auth_type"] == "supplier"


def get_allowed_actions(user: dict, ticket) -> list[str]:
    return [action for action in PUBLIC_ACTIONS if authorize(user, ticket, action)]


# ---- Reference table for the Roles & Permissions page --------------------------------
# Built by asking authorize() itself, so what admins read there can't drift from what the
# ticket endpoints actually enforce.

_STATUSES = ("OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED")
_STATUS_LABEL = {"OPEN": "Open", "IN_PROGRESS": "In progress", "RESOLVED": "Resolved", "CLOSED": "Closed"}
_ACTION_LABEL = {
    "view": "View ticket",
    "assign": "Assign a ticket",
    "reassign": "Reassign a ticket",
    "change_priority": "Change priority",
    "note": "Add an internal note",
    "reply": "Reply to the supplier",
    "resolve": "Mark resolved",
    "close": "Close ticket",
    "reopen": "Reopen ticket",
}
_ROLE_COLUMNS = (
    ("ADMIN", "Admin"),
    ("CHANNEL_LEAD", "Channel Lead"),
    ("ASSIGNEE", "Assignee"),
    ("SUPPLIER", "Supplier"),
)


def _allowed_statuses(user: dict, action: str, assigned_to_user: bool) -> list[str]:
    allowed = []
    for status in _STATUSES:
        ticket = SimpleNamespace(
            legacy_unlinked=False, vendor_code="VENDOR", channel="channel",
            status=status, assignee_id=user.get("user_id") if assigned_to_user else None,
        )
        if authorize(user, ticket, action):
            allowed.append(status)
    return allowed


def _describe(statuses: list[str]) -> str:
    if not statuses:
        return ""
    if len(statuses) == len(_STATUSES):
        return "Always"
    return ", ".join(_STATUS_LABEL[s] for s in statuses)


def permission_matrix() -> dict:
    """{"roles": [...], "rows": [{"action", "cells": [{"text", "ifAssigned"}]}]}. For each ticket
    role and action: the ticket statuses the action is allowed in, and (for the statuses that
    only open up once the ticket is assigned to that person) those separately."""
    users = {
        "ADMIN": {"auth_type": "internal", "ticket_role": "ADMIN", "user_id": 1, "allowed_channels": ["channel"], "vendor_codes": []},
        "CHANNEL_LEAD": {"auth_type": "internal", "ticket_role": "CHANNEL_LEAD", "user_id": 1, "allowed_channels": ["channel"], "vendor_codes": []},
        "ASSIGNEE": {"auth_type": "internal", "ticket_role": "ASSIGNEE", "user_id": 1, "allowed_channels": ["channel"], "vendor_codes": []},
        "SUPPLIER": {"auth_type": "supplier", "ticket_role": None, "user_id": None, "allowed_channels": [], "vendor_codes": ["VENDOR"]},
    }
    rows = []
    for action, label in _ACTION_LABEL.items():
        cells = []
        for key, _ in _ROLE_COLUMNS:
            user = users[key]
            base = _allowed_statuses(user, action, assigned_to_user=False)
            assigned = _allowed_statuses(user, action, assigned_to_user=True)
            only_when_assigned = [s for s in assigned if s not in base]
            cells.append({"text": _describe(base), "ifAssigned": _describe(only_when_assigned)})
        rows.append({"action": label, "cells": cells})
    return {"roles": [name for _, name in _ROLE_COLUMNS], "rows": rows}
