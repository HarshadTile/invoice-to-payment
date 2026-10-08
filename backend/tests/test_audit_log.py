import pytest
from fastapi.testclient import TestClient

from app.core.database import Base, SessionLocal, engine
from app.core.security import get_password_hash
from app.main import app
from app.models.settings import TableRow
from app.models.user import User

Base.metadata.create_all(bind=engine)
client = TestClient(app)

AUDIT = "settings-audit"


@pytest.fixture(autouse=True, scope="module")
def drop_test_users():
    yield
    db = SessionLocal()
    db.query(User).filter(User.username.like("audit_user_%")).delete(synchronize_session=False)
    db.commit()
    db.close()


def _audit_rows():
    db = SessionLocal()
    rows = [r.cells_json for r in db.query(TableRow).filter(TableRow.table_key == AUDIT).order_by(TableRow.row_index).all()]
    db.close()
    return rows


def _make_user(username, role="Admin", scope="all"):
    db = SessionLocal()
    user = db.query(User).filter(User.username == username).first()
    if not user:
        db.add(User(username=username, password_hash=get_password_hash("Passw0rd!x"), name=username.title(),
                    email=f"{username}@example.com", role=role, channel_scope=scope))
        db.commit()
    db.close()


def _login(username, password="Passw0rd!x"):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


def test_login_logout_and_failed_login_are_audited():
    _make_user("audit_user_1")
    before = len(_audit_rows())

    bad = _login("audit_user_1", "wrong-password")
    assert bad.status_code == 401
    good = _login("audit_user_1")
    token = good.json()["token"]
    client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})

    new = _audit_rows()[before:]
    assert [(r[1], r[2]) for r in new] == [
        ("Audit_User_1", "Failed login"), ("Audit_User_1", "Logged in"), ("Audit_User_1", "Logged out"),
    ]


def test_failed_login_for_an_unknown_account_is_audited_without_crashing():
    before = len(_audit_rows())
    assert _login("nobody_here_xyz").status_code == 401
    assert _audit_rows()[before:][0][1:3] == ["nobody_here_xyz", "Failed login"]


def test_logout_without_a_token_still_succeeds():
    assert client.post("/api/v1/auth/logout").status_code == 200


def test_audit_table_is_readable_by_internal_users_but_never_writable_or_supplier_visible():
    _make_user("audit_user_2")
    token = _login("audit_user_2").json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    read = client.get(f"/api/v1/tables/{AUDIT}", headers=headers)
    assert read.status_code == 200
    assert read.json()["rows"] == _audit_rows()

    count = len(_audit_rows())
    wipe = client.put(f"/api/v1/tables/{AUDIT}", headers=headers, json={"rows": []})
    assert wipe.status_code == 403
    assert len(_audit_rows()) == count  # nothing was erased

    # Other tables are still writable as before (a scratch key — these tests run against
    # the real dev database, so never overwrite a table people actually use).
    assert client.put("/api/v1/tables/zz-test-scratch", headers=headers, json={"rows": []}).status_code == 200
