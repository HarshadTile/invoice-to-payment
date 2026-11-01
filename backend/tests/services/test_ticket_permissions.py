"""Who may do what on a query, by role, channel, assignment and status."""
from types import SimpleNamespace

import pytest

from app.services.ticket_permissions import authorize, can_create, get_allowed_actions


def ticket(status="IN_PROGRESS", channel="msetuSrm", assignee_id=7, vendor_code="V100", legacy=False):
    return SimpleNamespace(status=status, channel=channel, assignee_id=assignee_id,
                           vendor_code=vendor_code, legacy_unlinked=legacy)


def staff(role, user_id=1, channels=("msetuSrm",)):
    return {"auth_type": "internal", "ticket_role": role, "user_id": user_id, "allowed_channels": list(channels)}


SUPPLIER = {"auth_type": "supplier", "vendor_codes": ["V100"], "user_id": None}


def test_only_suppliers_raise_queries():
    assert can_create(SUPPLIER, "msetuSrm")
    for role in ("ADMIN", "CHANNEL_LEAD", "ASSIGNEE"):
        assert not can_create(staff(role), "msetuSrm")


def test_supplier_sees_only_own_vendor_codes():
    assert authorize(SUPPLIER, ticket(), "view")
    assert not authorize(SUPPLIER, ticket(vendor_code="V999"), "view")


@pytest.mark.parametrize("status,reply,close", [
    ("OPEN", True, False), ("IN_PROGRESS", True, False), ("RESOLVED", False, True), ("CLOSED", False, False),
])
def test_supplier_reply_and_close_depend_on_status(status, reply, close):
    t = ticket(status=status)
    assert authorize(SUPPLIER, t, "reply") is reply
    assert authorize(SUPPLIER, t, "attach_public") is reply
    assert authorize(SUPPLIER, t, "close") is close
    assert authorize(SUPPLIER, t, "reopen") is close
    for action in ("assign", "note", "resolve", "change_priority", "attach_internal"):
        assert not authorize(SUPPLIER, t, action)


def test_channel_lead_manages_only_own_channel():
    lead = staff("CHANNEL_LEAD", channels=("poPortal",))
    assert authorize(lead, ticket(status="OPEN", channel="poPortal"), "assign")
    assert not authorize(lead, ticket(status="OPEN", channel="msetuSrm"), "view")
    assert not authorize(lead, ticket(status="OPEN", channel="msetuSrm"), "assign")


def test_admin_manages_every_channel():
    admin = staff("ADMIN", channels=())
    for channel in ("msetuSrm", "poPortal", "mfoxPortal"):
        assert authorize(admin, ticket(status="OPEN", channel=channel), "assign")


@pytest.mark.parametrize("status,assign,reassign,priority", [
    ("OPEN", True, False, True), ("IN_PROGRESS", False, True, True),
    ("RESOLVED", False, False, False), ("CLOSED", False, False, False),
])
def test_manager_actions_by_status(status, assign, reassign, priority):
    lead = staff("CHANNEL_LEAD")
    t = ticket(status=status)
    assert authorize(lead, t, "assign") is assign
    assert authorize(lead, t, "reassign") is reassign
    assert authorize(lead, t, "change_priority") is priority


def test_only_the_assignee_replies_and_resolves():
    lead, assignee, other = staff("CHANNEL_LEAD", 1), staff("ASSIGNEE", 7), staff("ASSIGNEE", 8)
    t = ticket(status="IN_PROGRESS", assignee_id=7)
    assert authorize(assignee, t, "reply") and authorize(assignee, t, "resolve")
    assert not authorize(lead, t, "reply") and not authorize(lead, t, "resolve")
    assert not authorize(other, t, "view")
    assert not authorize(assignee, ticket(status="OPEN", assignee_id=7), "resolve")


def test_internal_notes_until_closed():
    lead = staff("CHANNEL_LEAD")
    assert authorize(lead, ticket(status="RESOLVED"), "note")
    assert not authorize(lead, ticket(status="CLOSED"), "note")


def test_no_ticket_role_gets_nothing():
    nobody = staff("NO_ACCESS", user_id=99)
    assert get_allowed_actions(nobody, ticket(status="OPEN")) == []
    assert not authorize(nobody, ticket(), "view")


def test_legacy_unlinked_tickets_are_view_only():
    admin = staff("ADMIN")
    t = ticket(status="OPEN", legacy=True)
    assert authorize(admin, t, "view")
    assert get_allowed_actions(admin, t) == []
