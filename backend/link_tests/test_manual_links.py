import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

if os.environ.get("I2P_LINK_TEST_ISOLATED") != "1":
    pytest.skip("Run with --noconftest -p link_tests.support for an isolated database", allow_module_level=True)

from app.core import password_reset
from app.core.database import SessionLocal
from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.models.settings import TableRow
from app.models.user import PasswordResetToken, User


@pytest.fixture
def admin_client(monkeypatch):
    def forbidden(**kwargs):
        raise AssertionError("SMTP must never be called")
    monkeypatch.setattr("app.core.email.send_email", forbidden)
    with SessionLocal() as db:
        admin = User(username="admin_" + uuid4().hex, email=uuid4().hex + "@example.com",
                     password_hash=get_password_hash("AdminPass1!"), name="Link Admin", role="Admin", status="Active")
        db.add(admin)
        db.commit()
        headers = {"Authorization": "Bearer " + create_access_token(admin.id, "internal", {"channelScope": "all"})}
    return TestClient(app, headers=headers)


def create(admin_client):
    result = admin_client.post("/api/v1/users/", json={
        "name": "New Person", "email": uuid4().hex + "@example.com",
        "role": "Viewer", "channels": ["msetuSrm"],
    })
    assert result.status_code == 200, result.text
    assert result.headers["cache-control"] == "no-store"
    return result.json()


def raw(link):
    return parse_qs(urlsplit(link["setupLink"]).query)["token"][0]


def consume(token):
    return TestClient(app).post("/api/v1/auth/reset-password", json={"token": token, "password": "MyNewPassword1!"})


def test_link_info_only_reveals_identity_for_valid_unused_links(admin_client):
    account = create(admin_client)
    client = TestClient(app)

    def info(token):
        return client.post('/api/v1/auth/password-link-info', json={'token': token})

    valid = info(raw(account))
    assert valid.status_code == 200
    assert valid.headers['cache-control'] == 'no-store'
    assert valid.json() == {'email': account['email'], 'name': account['name'], 'linkType': 'invite'}
    assert info('unknown-token').status_code == 400
    assert info(password_reset.token_digest(raw(account))).status_code == 400
    assert consume(raw(account)).status_code == 200
    used = info(raw(account))
    assert used.status_code == 400
    assert account['email'] not in used.text
    replacement = admin_client.post(f"/api/v1/users/{account['id']}/reset-password").json()
    assert info(raw(replacement)).json()['linkType'] == 'reset'
    with SessionLocal() as db:
        record = db.query(PasswordResetToken).filter_by(token=password_reset.token_digest(raw(replacement))).one()
        record.expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.commit()
    assert info(raw(replacement)).status_code == 400
    replacement = admin_client.post(f"/api/v1/users/{account['id']}/reset-password").json()
    with SessionLocal() as db:
        db.get(User, account['id']).status = 'Inactive'
        db.commit()
    assert info(raw(replacement)).status_code == 400


def test_manual_invite_is_hashed_private_expiring_and_single_use(admin_client):
    account = create(admin_client)
    assert account["status"] == "Invited"
    assert account["linkType"] == "invite"
    assert account["setupLink"].startswith("http://192.168.1.10:5173/")
    expiry = datetime.fromisoformat(account["expiresAt"])
    assert timedelta(days=6, hours=23) < expiry - datetime.now(timezone.utc) <= timedelta(days=7)
    token = raw(account)
    with SessionLocal() as db:
        record = db.query(PasswordResetToken).filter_by(user_id=account["id"]).one()
        assert record.token == password_reset.token_digest(token)
        assert consume(record.token).status_code == 400  # digest is not a bearer token
        assert all(token not in str(row.cells_json) for row in db.query(TableRow).all())
    assert all("setupLink" not in user for user in admin_client.get("/api/v1/users/").json())
    assert consume(token).status_code == 200
    assert consume(token).status_code == 400
    for identity in (account["email"], account["username"]):
        result = TestClient(app).post("/api/v1/auth/login", json={
            "username": identity, "password": "MyNewPassword1!", "channelScope": "msetuSrm",
        })
        assert result.status_code == 200


def test_replacement_and_email_change_invalidate_old_links(admin_client):
    account = create(admin_client)
    replacement = admin_client.post(f"/api/v1/users/{account['id']}/reset-password")
    assert replacement.status_code == 200
    assert replacement.headers["cache-control"] == "no-store"
    assert consume(raw(account)).status_code == 400
    changed = admin_client.patch(f"/api/v1/users/{account['id']}", json={"email": uuid4().hex + "@example.com"})
    assert changed.status_code == 200
    assert consume(raw(replacement.json())).status_code == 400
    assert consume(raw(changed.json())).status_code == 200
    reset = admin_client.post(f"/api/v1/users/{account['id']}/reset-password").json()
    assert reset["linkType"] == "reset"
    assert timedelta(hours=23, minutes=59) < datetime.fromisoformat(reset["expiresAt"]) - datetime.now(timezone.utc) <= timedelta(hours=24)


def test_inactive_and_expired_links_are_rejected(admin_client):
    account = create(admin_client)
    with SessionLocal() as db:
        record = db.query(PasswordResetToken).filter_by(user_id=account["id"]).one()
        record.expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.commit()
    assert consume(raw(account)).status_code == 400
    replacement = admin_client.post(f"/api/v1/users/{account['id']}/reset-password").json()
    with SessionLocal() as db:
        db.get(User, account["id"]).status = "Inactive"
        db.commit()
    assert consume(raw(replacement)).status_code == 400
    assert admin_client.post(f"/api/v1/users/{account['id']}/reset-password").status_code == 400


def test_only_one_concurrent_submission_succeeds(admin_client):
    account = create(admin_client)
    token = raw(account)
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(consume, [token, token]))
    assert sorted(result.status_code for result in results) == [200, 400]


def test_failure_does_not_leave_a_half_created_account(admin_client, monkeypatch):
    monkeypatch.setattr(password_reset, "FRONTEND_URL", "not-a-url")
    email = uuid4().hex + "@example.com"
    response = admin_client.post("/api/v1/users/", json={"name": "Test", "email": email, "role": "Admin"})
    assert response.status_code == 503
    with SessionLocal() as db:
        assert db.query(User).filter_by(email=email).count() == 0


def test_public_recovery_never_reveals_links_or_accounts(admin_client):
    account = create(admin_client)
    public = TestClient(app)
    assert public.post(f"/api/v1/users/{account['id']}/reset-password").status_code in (401, 403)
    replies = [public.post("/api/v1/auth/forgot-password", json={"email": email}).json()
               for email in (account["email"], "unknown@example.com")]
    assert replies[0] == replies[1] == {"msg": "Contact your administrator to request a password reset link."}


def test_unexpired_legacy_link_still_works(admin_client):
    account = create(admin_client)
    token = "legacy_" + uuid4().hex
    with SessionLocal() as db:
        db.add(PasswordResetToken(token=token, user_id=account["id"], expires_at=datetime.utcnow() + timedelta(minutes=5)))
        db.commit()
    assert consume(token).status_code == 200
    assert consume(raw(account)).status_code == 400


def test_audit_retry_preserves_pending_user_changes(monkeypatch):
    from sqlalchemy.exc import IntegrityError
    from app.core.audit import write_audit

    with SessionLocal() as db:
        name = "pending_" + uuid4().hex
        db.add(User(username=name, email=name + "@example.com", name="Pending User",
                    password_hash=get_password_hash("Placeholder1!"), role="Viewer", status="Invited"))
        original_flush = db.flush
        failed_once = False

        def flush(*args, **kwargs):
            nonlocal failed_once
            audit_pending = any(isinstance(row, TableRow) for row in db.new)
            original_flush(*args, **kwargs)
            if audit_pending and not failed_once:
                failed_once = True
                raise IntegrityError("simulated audit index collision", {}, Exception("collision"))

        monkeypatch.setattr(db, "flush", flush)
        write_audit(db, "Test", "Created user", name)
        assert failed_once
        assert db.query(User).filter_by(username=name).count() == 1
        assert db.query(TableRow).filter(TableRow.cells_json.contains(name)).count() == 1


def test_mysql_concurrent_audit_appends_from_stale_snapshots():
    from threading import Barrier
    from app.core.audit import AUDIT_TABLE_KEY, write_audit
    from app.core.database import engine
    if engine.dialect.name != 'mysql':
        pytest.skip('Checks MySQL repeatable-read locking')
    with SessionLocal() as db:
        db.query(TableRow).filter_by(table_key=AUDIT_TABLE_KEY).delete()
        db.commit()
    barrier = Barrier(5)
    label = uuid4().hex

    def append(index):
        with SessionLocal() as db:
            # Establish a snapshot before competing writers start appending.
            db.query(TableRow).filter_by(table_key=AUDIT_TABLE_KEY).all()
            barrier.wait(timeout=10)
            write_audit(db, 'Concurrency test', 'Concurrent audit', f'{label}:{index}')

    with ThreadPoolExecutor(max_workers=5) as pool:
        list(pool.map(append, range(5)))
    with SessionLocal() as db:
        rows = db.query(TableRow).filter_by(table_key=AUDIT_TABLE_KEY).all()
        assert len(rows) == 5
        assert {row.cells_json[3] for row in rows} == {f'{label}:{index}' for index in range(5)}
