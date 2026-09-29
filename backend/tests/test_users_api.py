from fastapi.testclient import TestClient

from app.core.database import Base, SessionLocal, engine
from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.models.settings import TableRow
from app.models.user import User


def _auth(auth_type, subject, scope=None):
    token = create_access_token(subject=subject, auth_type=auth_type, scope=scope)
    return {"Authorization": f"Bearer {token}"}


def _get_or_create(db, username, role):
    user = db.query(User).filter(User.username == username).first()
    if user:
        return user
    user = User(
        username=username, password_hash=get_password_hash("Passw0rd!"),
        name=username.title(), email=f"{username}@example.com", role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# Self-seeding: these tests don't depend on the shared "admin" fixture other test
# modules assume already exists in the configured database.
Base.metadata.create_all(bind=engine)
_db = SessionLocal()
_admin_row = _get_or_create(_db, "users_api_admin", "Admin")
_viewer_row = _get_or_create(_db, "users_api_viewer", "Viewer")
admin_id, admin_email, admin_username = _admin_row.id, _admin_row.email, _admin_row.username
viewer_id = _viewer_row.id
_db.close()

anonymous = TestClient(app)
as_admin = TestClient(app, headers=_auth("internal", admin_id, {"channelScope": "all"}))
as_viewer = TestClient(app, headers=_auth("internal", viewer_id, {"channelScope": "all"}))
as_supplier = TestClient(app, headers=_auth("supplier", "DIM00505AA", {"company": "Vendor"}))


def _cleanup(username):
    db = SessionLocal()
    db.query(User).filter(User.username == username).delete()
    db.commit()
    db.close()


def test_users_endpoints_require_login():
    assert anonymous.get("/api/v1/users/").status_code in (401, 403)
    assert anonymous.post("/api/v1/users/", json={}).status_code in (401, 403)
    assert anonymous.patch("/api/v1/users/1", json={}).status_code in (401, 403)
    assert anonymous.delete("/api/v1/users/1").status_code in (401, 403)


def test_supplier_token_cannot_reach_users_api():
    assert as_supplier.get("/api/v1/users/").status_code == 403


def test_admin_can_create_update_and_delete_a_user():
    _cleanup("temp_user_1")
    created = as_admin.post("/api/v1/users/", json={
        "username": "temp_user_1", "password": "Passw0rd!", "name": "Temp One",
        "email": "temp1@example.com", "role": "Approver", "channelScope": "msetuSrm", "dept": "Finance", "title": "Analyst",
    })
    assert created.status_code == 200
    user_id = created.json()["id"]

    updated = as_admin.patch(f"/api/v1/users/{user_id}", json={"status": "Inactive", "role": "Viewer"})
    assert updated.status_code == 200
    assert updated.json()["status"] == "Inactive"
    assert updated.json()["role"] == "Viewer"

    deleted = as_admin.delete(f"/api/v1/users/{user_id}")
    assert deleted.status_code == 200
    assert not any(u["id"] == user_id for u in as_admin.get("/api/v1/users/").json())


def test_create_rejects_unknown_role_and_duplicate_email():
    bad_role = as_admin.post("/api/v1/users/", json={
        "username": "temp_user_2", "password": "Passw0rd!", "name": "Temp Two",
        "email": "temp2@example.com", "role": "NotARealRole", "channelScope": "msetuSrm",
    })
    assert bad_role.status_code == 400

    dup_email = as_admin.post("/api/v1/users/", json={
        "username": "temp_user_3", "password": "Passw0rd!", "name": "Temp Three",
        "email": admin_email, "role": "Viewer", "channelScope": "msetuSrm",
    })
    assert dup_email.status_code == 400


def test_a_non_admin_role_must_be_assigned_a_specific_portal():
    # No portal assigned — must be rejected, not silently defaulted
    missing_scope = as_admin.post("/api/v1/users/", json={
        "username": "temp_user_8", "password": "Passw0rd!", "name": "Temp Eight",
        "email": "temp8@example.com", "role": "Viewer", "channelScope": "all",
    })
    assert missing_scope.status_code == 400

    bad_scope = as_admin.post("/api/v1/users/", json={
        "username": "temp_user_9", "password": "Passw0rd!", "name": "Temp Nine",
        "email": "temp9@example.com", "role": "Viewer", "channelScope": "notAChannel",
    })
    assert bad_scope.status_code == 400


def test_admin_role_is_always_forced_to_all_channels():
    _cleanup("temp_user_10")
    # Even if the request asks for a specific portal, an Admin account is always "all"
    created = as_admin.post("/api/v1/users/", json={
        "username": "temp_user_10", "password": "Passw0rd!", "name": "Temp Ten",
        "email": "temp10@example.com", "role": "Admin", "channelScope": "poPortal",
    })
    assert created.status_code == 200
    assert created.json()["channelScope"] == "all"
    as_admin.delete(f"/api/v1/users/{created.json()['id']}")


def test_login_defaults_to_the_accounts_assigned_portal():
    _cleanup("temp_user_11")
    created = as_admin.post("/api/v1/users/", json={
        "username": "temp_user_11", "password": "Passw0rd!", "name": "Temp Eleven",
        "email": "temp11@example.com", "role": "Viewer", "channelScope": "poPortal",
    })
    user_id = created.json()["id"]

    # No portal named on the login form — falls back to whatever the account was assigned.
    login = anonymous.post("/api/v1/auth/login", json={"username": "temp_user_11", "password": "Passw0rd!"})
    assert login.status_code == 200
    assert login.json()["auth"]["channelScope"] == "poPortal"

    as_admin.delete(f"/api/v1/users/{user_id}")


def test_a_locked_account_cannot_sign_in_to_a_different_portal():
    _cleanup("temp_user_13")
    created = as_admin.post("/api/v1/users/", json={
        "username": "temp_user_13", "password": "Passw0rd!", "name": "Temp Thirteen",
        "email": "temp13@example.com", "role": "Viewer", "channelScope": "poPortal",
    })
    user_id = created.json()["id"]

    # Picking a portal this account was never assigned must be rejected outright, not
    # silently swapped for the real one — the login form's dropdown isn't the source of truth.
    wrong_portal = anonymous.post("/api/v1/auth/login", json={
        "username": "temp_user_13", "password": "Passw0rd!", "channelScope": "msetuSrm",
    })
    assert wrong_portal.status_code == 403

    wants_all = anonymous.post("/api/v1/auth/login", json={
        "username": "temp_user_13", "password": "Passw0rd!", "channelScope": "all",
    })
    assert wants_all.status_code == 403

    own_portal = anonymous.post("/api/v1/auth/login", json={
        "username": "temp_user_13", "password": "Passw0rd!", "channelScope": "poPortal",
    })
    assert own_portal.status_code == 200

    as_admin.delete(f"/api/v1/users/{user_id}")


def test_an_all_access_account_may_preview_any_single_channel():
    # Admin has channel_scope "all"; narrowing its own session to one channel is just a
    # view preference, not a widening of access, so the login form may still offer it.
    for portal in ("msetuSrm", "poPortal", "mfoxPortal", "all"):
        response = anonymous.post("/api/v1/auth/login", json={
            "username": admin_username, "password": "Passw0rd!", "channelScope": portal,
        })
        assert response.status_code == 200
        assert response.json()["auth"]["channelScope"] == portal


def test_demoting_an_admin_requires_a_new_portal_in_the_same_request():
    _cleanup("temp_user_12")
    created = as_admin.post("/api/v1/users/", json={
        "username": "temp_user_12", "password": "Passw0rd!", "name": "Temp Twelve",
        "email": "temp12@example.com", "role": "Admin", "channelScope": "all",
    })
    user_id = created.json()["id"]

    # Demoting from Admin without saying which portal they now belong to must fail —
    # leaving them on "all" would silently grant a non-admin HQ-wide access.
    incomplete = as_admin.patch(f"/api/v1/users/{user_id}", json={"role": "Viewer"})
    assert incomplete.status_code == 400

    complete = as_admin.patch(f"/api/v1/users/{user_id}", json={"role": "Viewer", "channelScope": "mfoxPortal"})
    assert complete.status_code == 200
    assert complete.json()["channelScope"] == "mfoxPortal"

    as_admin.delete(f"/api/v1/users/{user_id}")


def test_admin_cannot_delete_their_own_account():
    response = as_admin.delete(f"/api/v1/users/{admin_id}")
    assert response.status_code == 400


def test_viewer_role_cannot_manage_users():
    assert as_viewer.get("/api/v1/users/").status_code == 200  # read is fine for any internal user
    create = as_viewer.post("/api/v1/users/", json={
        "username": "temp_user_4", "password": "Passw0rd!", "name": "Temp Four",
        "email": "temp4@example.com", "role": "Viewer", "channelScope": "msetuSrm",
    })
    assert create.status_code == 403
    assert as_viewer.patch(f"/api/v1/users/{viewer_id}", json={"status": "Inactive"}).status_code == 403
    assert as_viewer.delete(f"/api/v1/users/{viewer_id}").status_code == 403
    assert as_viewer.post(f"/api/v1/users/{viewer_id}/reset-password", json={"password": "Newpass1!"}).status_code == 403


def test_deactivated_user_cannot_log_in_or_use_an_existing_token():
    _cleanup("temp_user_5")
    created = as_admin.post("/api/v1/users/", json={
        "username": "temp_user_5", "password": "Passw0rd!", "name": "Temp Five",
        "email": "temp5@example.com", "role": "Viewer", "channelScope": "msetuSrm",
    })
    user_id = created.json()["id"]
    token_headers = _auth("internal", user_id, {"channelScope": "all"})
    as_temp = TestClient(app, headers=token_headers)

    # Works while active
    login = anonymous.post("/api/v1/auth/login", json={
        "username": "temp_user_5", "password": "Passw0rd!", "channelScope": "msetuSrm",
    })
    assert login.status_code == 200
    assert as_temp.get("/api/v1/auth/me").status_code == 200

    as_admin.patch(f"/api/v1/users/{user_id}", json={"status": "Inactive"})

    # Blocked once deactivated — both a fresh login and an already-issued token
    blocked_login = anonymous.post("/api/v1/auth/login", json={
        "username": "temp_user_5", "password": "Passw0rd!", "channelScope": "msetuSrm",
    })
    assert blocked_login.status_code == 403
    assert as_temp.get("/api/v1/auth/me").status_code == 403

    as_admin.delete(f"/api/v1/users/{user_id}")


def test_admin_can_reset_a_users_password():
    _cleanup("temp_user_6")
    created = as_admin.post("/api/v1/users/", json={
        "username": "temp_user_6", "password": "Passw0rd!", "name": "Temp Six",
        "email": "temp6@example.com", "role": "Viewer", "channelScope": "msetuSrm",
    })
    user_id = created.json()["id"]

    too_short = as_admin.post(f"/api/v1/users/{user_id}/reset-password", json={"password": "short"})
    assert too_short.status_code == 400

    reset = as_admin.post(f"/api/v1/users/{user_id}/reset-password", json={"password": "BrandNew1!"})
    assert reset.status_code == 200

    old_password_login = anonymous.post("/api/v1/auth/login", json={
        "username": "temp_user_6", "password": "Passw0rd!", "channelScope": "msetuSrm",
    })
    assert old_password_login.status_code == 401

    new_password_login = anonymous.post("/api/v1/auth/login", json={
        "username": "temp_user_6", "password": "BrandNew1!", "channelScope": "msetuSrm",
    })
    assert new_password_login.status_code == 200

    as_admin.delete(f"/api/v1/users/{user_id}")


def test_user_management_actions_are_written_to_the_audit_log():
    db = SessionLocal()
    before = db.query(TableRow).filter(TableRow.table_key == "settings-audit").count()
    db.close()

    _cleanup("temp_user_7")
    created = as_admin.post("/api/v1/users/", json={
        "username": "temp_user_7", "password": "Passw0rd!", "name": "Temp Seven",
        "email": "temp7@example.com", "role": "Viewer", "channelScope": "msetuSrm",
    })
    user_id = created.json()["id"]
    as_admin.patch(f"/api/v1/users/{user_id}", json={"role": "Accounts"})
    as_admin.delete(f"/api/v1/users/{user_id}")

    db = SessionLocal()
    after = db.query(TableRow).filter(TableRow.table_key == "settings-audit").count()
    actions = [row.cells_json[2] for row in db.query(TableRow)
               .filter(TableRow.table_key == "settings-audit").order_by(TableRow.row_index).all()]
    db.close()
    assert after == before + 3
    assert actions[-3:] == ["Created user", "Updated user", "Removed user"]
