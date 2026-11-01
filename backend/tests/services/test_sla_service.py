"""SLA clock for supplier queries: policies, due times and clock changes on replies."""
from datetime import datetime, timedelta
from types import SimpleNamespace

from app.core.database import SessionLocal
from app.models.ticket_activity import SlaPolicy
from app.services import sla_service

NOW = datetime(2026, 11, 1, 10, 0)


def test_due_time_adds_the_response_minutes():
    assert sla_service.compute_due_at(NOW, 240) == NOW + timedelta(hours=4)


def test_global_policies_and_fallback_defaults():
    with SessionLocal() as db:
        assert sla_service.get_policy(db, "msetuSrm", "HIGH") == (240, False)
        assert sla_service.get_policy(db, None, "LOW") == (2880, False)
        assert sla_service.get_policy(db, "poPortal", "UNKNOWN") == (1440, False)


def test_a_channel_policy_overrides_the_global_one():
    with SessionLocal() as db:
        policy = SlaPolicy(channel="poPortal", priority="HIGH", response_minutes=60, business_hours=False, active=True)
        db.add(policy)
        db.commit()
        try:
            assert sla_service.get_policy(db, "poPortal", "HIGH") == (60, False)
            assert sla_service.get_policy(db, "msetuSrm", "HIGH") == (240, False)
        finally:
            db.delete(policy)
            db.commit()


def test_start_clock_waits_for_staff():
    with SessionLocal() as db:
        values = sla_service.start_clock(db, "msetuSrm", "MEDIUM", NOW)
    assert values == {"awaiting": "STAFF", "sla_started_at": NOW, "response_due_at": NOW + timedelta(days=1)}


def test_staff_reply_stops_the_clock_and_records_first_response_once():
    first = sla_service.staff_replied(SimpleNamespace(first_response_at=None), NOW)
    assert first["awaiting"] == "SUPPLIER" and first["response_due_at"] is None and first["first_response_at"] == NOW
    later = sla_service.staff_replied(SimpleNamespace(first_response_at=NOW), NOW + timedelta(hours=1))
    assert "first_response_at" not in later


def test_supplier_reply_restarts_the_clock():
    with SessionLocal() as db:
        values = sla_service.supplier_replied(db, SimpleNamespace(channel="msetuSrm", priority="HIGH"), NOW)
    assert values["awaiting"] == "STAFF" and values["response_due_at"] == NOW + timedelta(hours=4)


def test_resolving_clears_the_clock():
    values = sla_service.resolved(NOW)
    assert values["status"] == "RESOLVED" and values["resolved_at"] == NOW
    assert values["response_due_at"] is None and values["sla_started_at"] is None
