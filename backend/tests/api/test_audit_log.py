"""The audit log: what is recorded (with IP), throttling of repeated failures, the paged / filtered
API with its counts, CSV export, access rules and retention."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core import audit
from app.core.database import Base, SessionLocal, engine
from app.core.security import get_password_hash
from app.main import app
from app.models.audit_log import AuditLog
from app.models.user import User
from tests.helpers.audit import audit_count, audit_rows

Base.metadata.create_all(bind=engine)
client = TestClient(app)
PASSWORD = "Audit-Test-Pass-71"


@pytest.fixture(autouse=True, scope="module")
def drop_test_users():
    yield
    db = SessionLocal()
    db.query(User).filter(User.username.like("audit_user_%")).delete(synchronize_session=False)
    db.commit()
    db.close()


def _make_user(username, role="Admin", scope="all"):
    db = SessionLocal()
    if not db.query(User).filter(User.username == username).first():
        db.add(User(username=username, password_hash=get_password_hash(PASSWORD), name=username.title(),
                    email=f"{username}@example.com", role=role, channel_scope=scope))
        db.commit()
    db.close()


def _login(username, password=PASSWORD):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


def _admin_headers():
    _make_user("audit_user_admin")
    return {"Authorization": f"Bearer {_login('audit_user_admin').json()['token']}"}


def test_login_logout_and_failed_login_are_audited_with_the_ip():
    _make_user("audit_user_1")
    before = audit_count()
    assert _login("audit_user_1", "wrong-password").status_code == 401
    token = _login("audit_user_1").json()["token"]
    client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})

    new = audit_rows()[before:]
    assert [(who, action, category) for who, action, _, _, category in new] == [
        ("Audit_User_1", "Failed login", "failed"), ("Audit_User_1", "Logged in", "signin"),
        ("Audit_User_1", "Logged out", "signin"),
    ]
    assert all(ip == "testclient" for _, _, _, ip, _ in new)  # the caller's address


def test_failed_login_for_an_unknown_account_is_audited_without_crashing():
    before = audit_count()
    assert _login("nobody_here_xyz", "x").status_code == 401
    assert audit_rows()[before][:2] == ("nobody_here_xyz", "Failed login")


def test_repeated_failures_from_one_address_are_summarised_not_flooded():
    before = audit_count()
    for n in range(8):
        _login(f"nobody_flood_{n}", "x")
    new = audit_rows()[before:]
    assert len(new) == 1  # the first one; the next seven are counted, not written

    # once the 5-minute window has passed, the next failure carries the count
    for state in audit._throttle.values():
        state[0] -= audit.THROTTLE_SECONDS + 1
    _login("nobody_flood_late", "x")
    latest = audit_rows()[-1]
    assert latest[1] == "Failed login" and "+7 similar in the previous 5 minutes" in latest[2]


def test_logout_without_a_token_still_succeeds():
    assert client.post("/api/v1/auth/logout").status_code == 200


def test_the_api_pages_filters_searches_and_counts():
    headers = _admin_headers()
    _make_user("audit_user_3")
    _login("audit_user_3", "wrong-password")
    _login("audit_user_3")

    first = client.get("/api/v1/audit-logs?page_size=2", headers=headers).json()
    assert len(first["items"]) == 2 and first["total"] == first["logTotal"] >= 4
    assert first["items"][0]["id"] > first["items"][1]["id"]  # newest first
    second = client.get("/api/v1/audit-logs?page_size=2&page=2", headers=headers).json()
    assert {i["id"] for i in second["items"]}.isdisjoint({i["id"] for i in first["items"]})

    failed = client.get("/api/v1/audit-logs?category=failed&q=audit_user_3", headers=headers).json()
    assert failed["total"] >= 1 and all(i["category"] == "failed" for i in failed["items"])
    assert all("Audit_User_3" in i["who"] for i in failed["items"])
    assert failed["items"][0]["when"].endswith("+00:00") and failed["items"][0]["ip"] == "testclient"

    summary = first["summary"]
    assert summary["total"] >= summary["signin"] + summary["failed"] and summary["failed"] >= 1
    assert client.get("/api/v1/audit-logs?category=nonsense", headers=headers).status_code == 422


def test_date_filters_use_whole_days():
    headers = _admin_headers()
    today = datetime.now(timezone.utc).date()
    assert client.get(f"/api/v1/audit-logs?date_from={today}&date_to={today}", headers=headers).json()["total"] >= 1
    tomorrow = today + timedelta(days=1)
    assert client.get(f"/api/v1/audit-logs?date_from={tomorrow}", headers=headers).json()["total"] == 0


def test_export_is_csv_safe_and_is_itself_audited():
    headers = _admin_headers()
    _login("=cmd|'/C calc'!A0", "x")  # a username crafted as a spreadsheet formula
    response = client.get("/api/v1/audit-logs/export?category=failed", headers=headers)
    assert response.status_code == 200 and response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    body = response.text
    assert body.splitlines()[0].lstrip("﻿") == "Time (UTC),Event,Type,By,Detail,IP address"
    assert "'=cmd" in body and ",=cmd" not in body
    assert audit_rows()[-1][1] == "Exported audit log"


def test_audit_log_is_never_writable_through_the_tables_api():
    headers = _admin_headers()
    count = audit_count()
    assert client.put("/api/v1/tables/settings-audit", headers=headers, json={"rows": []}).status_code == 403
    assert audit_count() == count
    assert client.put("/api/v1/tables/zz-test-scratch", headers=headers, json={"rows": []}).status_code == 403


def test_retention_removes_only_rows_past_the_limit(monkeypatch):
    monkeypatch.setenv("AUDIT_RETENTION_DAYS", "365")
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    with SessionLocal() as db:
        for days in (400, 366, 10):
            db.add(AuditLog(occurred_at=now - timedelta(days=days), category="other", action=f"retention test {days}",
                            actor="Test", actor_type="anonymous"))
        db.commit()
        assert audit.purge_old_entries(db, batch=1) >= 2
        left = {a for (a,) in db.query(AuditLog.action).filter(AuditLog.action.like("retention test %")).all()}
    assert left == {"retention test 10"}


def test_retention_period_has_a_safe_minimum(monkeypatch):
    monkeypatch.setenv("AUDIT_RETENTION_DAYS", "1")
    assert audit.retention_days() == 30
    monkeypatch.setenv("AUDIT_RETENTION_DAYS", "not a number")
    assert audit.retention_days() == 365
