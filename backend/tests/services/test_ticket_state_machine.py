"""Query (ticket) status transitions: the only allowed moves, and a 409 for everything else."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.services.ticket_state_machine import TRANSITIONS, transition

STATUSES = ("OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED")
ACTIONS = ("assign", "reassign", "resolve", "reopen", "close", "auto_close")


@pytest.mark.parametrize("status,action,target", [
    ("OPEN", "assign", "IN_PROGRESS"),
    ("IN_PROGRESS", "reassign", "IN_PROGRESS"),
    ("IN_PROGRESS", "resolve", "RESOLVED"),
    ("RESOLVED", "reopen", "IN_PROGRESS"),
    ("RESOLVED", "close", "CLOSED"),
    ("RESOLVED", "auto_close", "CLOSED"),
])
def test_allowed_transitions(status, action, target):
    assert transition(SimpleNamespace(status=status), action) == target


@pytest.mark.parametrize("status,action", [
    (status, action) for status in STATUSES for action in ACTIONS if (status, action) not in TRANSITIONS
])
def test_every_other_transition_is_rejected_with_409(status, action):
    with pytest.raises(HTTPException) as error:
        transition(SimpleNamespace(status=status), action)
    assert error.value.status_code == 409
    assert error.value.detail["error"]["code"] == "INVALID_TRANSITION"


def test_closed_is_final():
    assert not [action for (status, action) in TRANSITIONS if status == "CLOSED"]
