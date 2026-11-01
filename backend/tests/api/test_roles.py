import copy

import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.core.permissions import load_role_matrix
from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.models.settings import AppSettings
from app.models.user import PasswordResetToken, User

ROLES = "/api/v1/settings/roles"


def _user(username, role):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            user = User(username=username, password_hash=get_password_hash("Passw0rd!"), name=username,
                        email=f"{username}@example.com", role=role, status="Active", channel_scope="msetuSrm")
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            user.role = role
            db.commit()
        return user.id
    finally:
        db.close()


def _client(user_id):
    token = create_access_token(subject=user_id, auth_type="internal", scope={"channelScope": "all"})
    return TestClient(app, headers={"Authorization": f"Bearer {token}"})


admin = _client(_user("roles_admin", "Admin"))
team = _client(_user("roles_team", "Invoice Team L2"))


@pytest.fixture(autouse=True)
def restore_roles():
    """Put the role matrix and the test users' roles back after every test."""
    db = SessionLocal()
    row = db.query(AppSettings).filter(AppSettings.id == 1).first()
    before = copy.deepcopy(row.role_matrix_json) if row else None
    # Deleting a role moves its users, including other test files' users: remember everyone's role.
    roles_before = {u.id: u.role for u in db.query(User).all()}
    db.close()
    yield
    db = SessionLocal()
    try:
        row = db.query(AppSettings).filter(AppSettings.id == 1).first()
        if before is not None:
            row.role_matrix_json = before
        elif row:
            db.delete(row)
        # Users made through the API also have a setup link; remove it before the user.
        members = [u.id for u in db.query(User).filter(User.username.like("roles_member%")).all()]
        if members:
            db.query(PasswordResetToken).filter(PasswordResetToken.user_id.in_(members)).delete(synchronize_session=False)
            db.query(User).filter(User.id.in_(members)).delete(synchronize_session=False)
        for user in db.query(User).all():
            if user.id in roles_before and user.role != roles_before[user.id]:
                user.role = roles_before[user.id]
        db.query(User).filter(User.username == "roles_team").update({"role": "Invoice Team L2"})
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _matrix():
    db = SessionLocal()
    try:
        return load_role_matrix(db)
    finally:
        db.close()


def _message(response):
    return response.json()["error"]["message"]


def test_a_new_role_starts_empty_or_as_a_copy():
    blank = admin.post(ROLES, json={"name": "  Invoice   Team L4 "})
    assert blank.status_code == 200, blank.text
    body = blank.json()
    assert "Invoice Team L4" in body["roleMatrix"] and not any(body["roleMatrix"]["Invoice Team L4"].values())
    assert body["counts"]["Invoice Team L4"] == 0
    copied = admin.post(ROLES, json={"name": "Finance Review", "copyFrom": "Invoice Team L3"})
    assert copied.json()["roleMatrix"]["Finance Review"] == _matrix()["Invoice Team L3"]
    # The new role can be given to a user straight away.
    created = admin.post("/api/v1/users/", json={"name": "Role Member", "email": "roles_member1@example.com",
                                                 "role": "Finance Review", "channels": ["msetuSrm"]})
    assert created.status_code == 200, created.text


@pytest.mark.parametrize("name,fragment", [
    ("A", "2 to 40 characters"),
    ("Bad/Name", "2 to 40 characters"),
    ("admin", "reserved"),
    ("invoice team l1", "already exists"),
])
def test_role_names_are_checked(name, fragment):
    response = admin.post(ROLES, json={"name": name})
    assert response.status_code == 400 and fragment in _message(response)


def test_renaming_a_role_moves_its_users_with_it():
    admin.post(ROLES, json={"name": "Temp Role"})
    member = _user("roles_member2", "Temp Role")
    renamed = admin.put(f"{ROLES}/Temp Role", json={"newName": "Temp Role Renamed"})
    assert renamed.status_code == 200, renamed.text
    assert "Temp Role" not in renamed.json()["roleMatrix"] and renamed.json()["counts"]["Temp Role Renamed"] == 1
    db = SessionLocal()
    assert db.get(User, member).role == "Temp Role Renamed"
    db.close()
    assert admin.put(f"{ROLES}/Admin", json={"newName": "Boss"}).status_code == 400
    assert admin.put(f"{ROLES}/Nope", json={"newName": "Whatever"}).status_code == 404


def test_deleting_a_role_with_users_needs_a_role_to_move_them_to():
    admin.post(ROLES, json={"name": "Short Lived"})
    member = _user("roles_member3", "Short Lived")
    refused = admin.delete(f"{ROLES}/Short Lived")
    assert refused.status_code == 400 and "Pick the role" in _message(refused)
    assert admin.delete(f"{ROLES}/Short Lived", params={"moveTo": "Admin"}).status_code == 400
    deleted = admin.delete(f"{ROLES}/Short Lived", params={"moveTo": "Invoice Team L1"})
    assert deleted.status_code == 200, deleted.text
    assert "Short Lived" not in deleted.json()["roleMatrix"]
    db = SessionLocal()
    assert db.get(User, member).role == "Invoice Team L1"
    db.close()
    assert admin.delete(f"{ROLES}/Admin").status_code == 400


def test_the_last_role_besides_admin_stays():
    matrix = _matrix()
    others = [r for r in matrix if r != "Admin"]
    for role in others[1:]:
        assert admin.delete(f"{ROLES}/{role}", params={"moveTo": others[0]}).status_code == 200
    last = admin.delete(f"{ROLES}/{others[0]}", params={"moveTo": "Admin"})
    assert last.status_code == 400 and "at least one role" in _message(last)


def test_only_role_managers_can_change_roles_and_unknown_roles_are_refused_for_users():
    assert team.post(ROLES, json={"name": "Sneaky"}).status_code == 403
    assert team.get("/api/v1/settings/role-summary").status_code == 200
    refused = admin.post("/api/v1/users/", json={"name": "No Such", "email": "roles_member4@example.com",
                                                 "role": "Viewer", "channels": ["msetuSrm"]})
    assert refused.status_code == 400 and "Unknown role" in _message(refused)
