import copy

import pytest
from fastapi.testclient import TestClient

from app.core.database import Base, SessionLocal, engine
from app.core.permissions import CAPABILITIES, DEFAULT_ROLE_MATRIX, load_role_matrix, normalize_matrix
from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.models.settings import AppSettings, TableRow
from app.models.user import User
from app.services.ticket_permissions import permission_matrix

Base.metadata.create_all(bind=engine)


def _auth(auth_type, subject, scope=None):
    return {"Authorization": f"Bearer {create_access_token(subject=subject, auth_type=auth_type, scope=scope)}"}


def _user_id(username, role):
    db = SessionLocal()
    user = db.query(User).filter(User.username == username).first()
    if not user:
        user = User(username=username, password_hash=get_password_hash("Passw0rd!"), name=username.title(),
                    email=f"{username}@example.com", role=role, status="Active", channel_scope="all")
        db.add(user)
        db.commit()
        db.refresh(user)
    uid = user.id
    db.close()
    return uid


admin_id = _user_id("perm_admin", "Admin")
viewer_id = _user_id("perm_viewer", "Viewer")
as_admin = TestClient(app, headers=_auth("internal", admin_id, {"channelScope": "all"}))
as_viewer = TestClient(app, headers=_auth("internal", viewer_id, {"channelScope": "all"}))
as_supplier = TestClient(app, headers=_auth("supplier", "DIM00505AA", {"company": "Vendor"}))
anonymous = TestClient(app)


@pytest.fixture
def restore_settings():
    """Put the saved role matrix back exactly as it was after a test edits it."""
    db = SessionLocal()
    row = db.query(AppSettings).filter(AppSettings.id == 1).first()
    before = copy.deepcopy(row.role_matrix_json) if row else None
    existed = row is not None
    db.close()
    yield
    db = SessionLocal()
    row = db.query(AppSettings).filter(AppSettings.id == 1).first()
    if existed:
        row.role_matrix_json = before
    elif row:
        db.delete(row)
    db.commit()
    db.close()


def _matrix():
    db = SessionLocal()
    matrix = copy.deepcopy(load_role_matrix(db))
    db.close()
    return matrix


def test_suppliers_and_anonymous_callers_cannot_change_settings_or_tables():
    body = {"roleMatrix": copy.deepcopy(DEFAULT_ROLE_MATRIX)}
    assert as_supplier.put("/api/v1/settings", json=body).status_code == 403
    assert as_supplier.put("/api/v1/tables/settings-notifications", json={"rows": []}).status_code == 403
    assert anonymous.put("/api/v1/settings", json=body).status_code in (401, 403)


def test_a_viewer_cannot_change_roles_config_or_tables():
    assert as_viewer.put("/api/v1/settings", json={"roleMatrix": _matrix()}).status_code == 403
    assert as_viewer.put("/api/v1/settings", json={"twoFactorOn": True}).status_code == 403
    assert as_viewer.put("/api/v1/settings", json={"senderEmail": "x@example.com"}).status_code == 403
    assert as_viewer.put("/api/v1/tables/settings-notifications", json={"rows": []}).status_code == 403


def test_only_whitelisted_tables_are_writable_even_for_an_admin():
    assert as_admin.put("/api/v1/tables/channel-msetuSrm-Approver_Assignment", json={"rows": []}).status_code == 403
    assert as_admin.put("/api/v1/tables/settings-users", json={"rows": []}).status_code == 403
    assert as_admin.put("/api/v1/tables/settings-audit", json={"rows": []}).status_code == 403


def test_role_matrix_edits_are_validated_and_audited(restore_settings):
    matrix = _matrix()

    locked_out = copy.deepcopy(matrix)
    locked_out["Admin"]["manageUsers"] = False
    assert as_admin.put("/api/v1/settings", json={"roleMatrix": locked_out}).status_code == 400

    extra_role = copy.deepcopy(matrix)
    extra_role["Hacker"] = dict(matrix["Viewer"])
    assert as_admin.put("/api/v1/settings", json={"roleMatrix": extra_role}).status_code == 400

    fake_cap = copy.deepcopy(matrix)
    fake_cap["Viewer"]["deleteEverything"] = True
    assert as_admin.put("/api/v1/settings", json={"roleMatrix": fake_cap}).status_code == 400

    db = SessionLocal()
    before = db.query(TableRow).filter(TableRow.table_key == "settings-audit").count()
    db.close()
    edited = copy.deepcopy(matrix)
    edited["Viewer"]["importExport"] = not matrix["Viewer"]["importExport"]
    assert as_admin.put("/api/v1/settings", json={"roleMatrix": edited}).status_code == 200
    assert _matrix()["Viewer"]["importExport"] == edited["Viewer"]["importExport"]

    db = SessionLocal()
    rows = db.query(TableRow).filter(TableRow.table_key == "settings-audit").order_by(TableRow.row_index).all()
    db.close()
    assert len(rows) == before + 1
    assert rows[-1].cells_json[2] == "Changed role permissions"
    assert "Viewer: importExport" in rows[-1].cells_json[3]


def test_managing_users_alone_does_not_allow_changing_role_permissions(restore_settings):
    matrix = _matrix()
    matrix["Viewer"]["manageUsers"] = True
    assert as_admin.put("/api/v1/settings", json={"roleMatrix": matrix}).status_code == 200
    # Viewer can now manage users, but editing the matrix is its own capability.
    assert as_viewer.put("/api/v1/settings", json={"roleMatrix": matrix}).status_code == 403
    matrix["Viewer"]["manageRoles"] = True
    assert as_admin.put("/api/v1/settings", json={"roleMatrix": matrix}).status_code == 200
    assert as_viewer.put("/api/v1/settings", json={"roleMatrix": matrix}).status_code == 200


def test_admin_cannot_lose_role_management(restore_settings):
    matrix = _matrix()
    matrix["Admin"]["manageRoles"] = False
    assert as_admin.put("/api/v1/settings", json={"roleMatrix": matrix}).status_code == 400


def test_audit_log_needs_the_view_audit_log_capability(restore_settings):
    assert as_admin.get("/api/v1/tables/settings-audit").status_code == 200
    assert as_viewer.get("/api/v1/tables/settings-audit").status_code == 403
    assert as_supplier.get("/api/v1/tables/settings-audit").status_code == 403

    matrix = _matrix()
    matrix["Viewer"]["viewAuditLog"] = True
    assert as_admin.put("/api/v1/settings", json={"roleMatrix": matrix}).status_code == 200
    assert as_viewer.get("/api/v1/tables/settings-audit").status_code == 200


def test_an_older_saved_matrix_still_works_without_a_migration():
    old = {"Admin": {"importExport": True, "editRows": True, "createTrace": True, "manageUsers": True, "manageConfig": True},
           "Viewer": {"importExport": False, "editRows": False, "createTrace": True, "manageUsers": False, "manageConfig": False}}
    cleaned = normalize_matrix(old)
    assert set(cleaned["Admin"]) == set(CAPABILITIES)  # editRows dropped, new capabilities added
    assert cleaned["Admin"]["manageRoles"] and cleaned["Admin"]["viewAuditLog"]  # Admin keeps its powers
    assert not cleaned["Viewer"]["manageRoles"] and not cleaned["Viewer"]["viewAuditLog"]


def test_ticket_permission_reference_matches_the_real_rules():
    matrix = permission_matrix()
    assert matrix["roles"] == ["Admin", "Channel Lead", "Assignee", "Supplier"]
    cells = {row["action"]: dict(zip(matrix["roles"], row["cells"])) for row in matrix["rows"]}
    assert cells["Assign a ticket"]["Channel Lead"]["text"] == "Open"
    assert cells["Assign a ticket"]["Assignee"]["text"] == ""
    assert cells["Reply to the supplier"]["Supplier"]["text"] == "Open, In progress"
    # Staff can only reply or resolve once the ticket is assigned to them.
    assert cells["Reply to the supplier"]["Admin"] == {"text": "", "ifAssigned": "In progress"}
    assert cells["Mark resolved"]["Assignee"] == {"text": "", "ifAssigned": "In progress"}
    assert cells["Close ticket"]["Supplier"]["text"] == "Resolved"


def test_ticket_reference_endpoint_is_for_internal_users_only():
    assert as_viewer.get("/api/v1/ticket-permissions").status_code == 200
    assert as_supplier.get("/api/v1/ticket-permissions").status_code == 403


def test_workspace_hides_internal_tables_and_settings_from_suppliers_and_non_admins():
    supplier = as_supplier.get("/api/v1/workspace").json()
    assert supplier["tables"] == {}
    assert supplier["settings"] == {}

    viewer = as_viewer.get("/api/v1/workspace").json()
    assert "settings-audit" not in viewer["tables"]
    admin = as_admin.get("/api/v1/workspace").json()
    assert "roleMatrix" in admin["settings"] or admin["settings"] == {}


def test_the_last_active_admin_cannot_be_demoted_deactivated_or_deleted():
    db = SessionLocal()
    others = db.query(User).filter(User.role == "Admin", User.status == "Active", User.id != admin_id).all()
    other_ids = [u.id for u in others]
    for user in others:
        user.status = "Inactive"
    db.commit()
    db.close()
    try:
        assert as_admin.patch(f"/api/v1/users/{admin_id}", json={"role": "Viewer", "channels": ["msetuSrm"]}).status_code == 400
        assert as_admin.patch(f"/api/v1/users/{admin_id}", json={"status": "Inactive"}).status_code == 400
        # An unrelated edit to the sole admin is still fine.
        assert as_admin.patch(f"/api/v1/users/{admin_id}", json={"title": "Chief"}).status_code == 200
    finally:
        db = SessionLocal()
        db.query(User).filter(User.id.in_(other_ids)).update({"status": "Active"}, synchronize_session=False)
        db.commit()
        db.close()
