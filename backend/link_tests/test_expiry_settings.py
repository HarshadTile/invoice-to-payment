import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

if os.environ.get('I2P_LINK_TEST_ISOLATED') != '1':
    pytest.skip('Requires isolated link_tests.support plugin', allow_module_level=True)

from app.main import app
from app.core.database import SessionLocal
from app.core.security import create_access_token, get_password_hash
from app.core.permissions import DEFAULT_ROLE_MATRIX
from app.models.settings import AppSettings, TableRow
from app.models.user import User, PasswordResetToken


@pytest.fixture
def clients():
    with SessionLocal() as db:
        settings = db.get(AppSettings, 1)
        if not settings:
            settings = AppSettings(id=1)
            db.add(settings)
            db.flush()
        old = (settings.role_matrix_json, settings.invite_link_expiry_minutes, settings.reset_link_expiry_minutes)
        matrix = {role: dict(caps) for role, caps in DEFAULT_ROLE_MATRIX.items()}
        matrix['Viewer']['manageUsers'] = True
        settings.role_matrix_json = matrix
        settings.invite_link_expiry_minutes = 10080
        settings.reset_link_expiry_minutes = 1440
        users = []
        for role in ('Viewer', 'Accounts'):
            name = uuid4().hex
            user = User(username=name, name=role, email=name+'@example.com', role=role, status='Active', password_hash=get_password_hash('TestPassword1!'))
            db.add(user)
            db.flush()
            users.append(user.id)
        db.commit()
    def client(user_id):
        return TestClient(app, headers={'Authorization': 'Bearer '+create_access_token(user_id, 'internal', {'channelScope': 'all'})})
    yield client(users[0]), client(users[1])
    with SessionLocal() as db:
        settings = db.get(AppSettings, 1)
        settings.role_matrix_json, settings.invite_link_expiry_minutes, settings.reset_link_expiry_minutes = old
        db.commit()


def test_saved_expiry_applies_to_new_links_and_email_changes(clients):
    manager, _ = clients
    name = uuid4().hex
    response = manager.post('/api/v1/users/', json={'name': name, 'email': name+'@example.com', 'role': 'Viewer', 'channels': ['msetuSrm']})
    assert response.status_code == 200, response.text
    account = response.json()
    with SessionLocal() as db:
        original = db.query(PasswordResetToken).filter_by(user_id=account['id']).one()
        token_id, expiry = original.id, original.expires_at
    response = manager.put('/api/v1/settings', json={'inviteLinkExpiryMinutes': 60, 'resetLinkExpiryMinutes': 4320})
    assert response.status_code == 200, response.text
    workspace = manager.get('/api/v1/workspace').json()['settings']
    assert workspace['inviteLinkExpiryMinutes'] == 60
    assert workspace['resetLinkExpiryMinutes'] == 4320
    with SessionLocal() as db:
        assert db.get(PasswordResetToken, token_id).expires_at == expiry
        assert any('Changed password link expiry' in str(row.cells_json) for row in db.query(TableRow).all())
    fresh = manager.post(f"/api/v1/users/{account['id']}/reset-password").json()
    assert fresh['expiryMinutes'] == 60
    assert timedelta(minutes=59) < datetime.fromisoformat(fresh['expiresAt'])-datetime.now(timezone.utc) <= timedelta(minutes=60)
    changed = manager.patch(f"/api/v1/users/{account['id']}", json={'email': uuid4().hex+'@example.com'}).json()
    assert changed['expiryMinutes'] == 60
    with SessionLocal() as db:
        db.get(User, account['id']).status = 'Active'
        db.commit()
    reset = manager.post(f"/api/v1/users/{account['id']}/reset-password").json()
    assert reset['expiryMinutes'] == 4320
    assert timedelta(days=2, hours=23, minutes=59) < datetime.fromisoformat(reset['expiresAt'])-datetime.now(timezone.utc) <= timedelta(days=3)


def test_expiry_validation_and_permissions(clients):
    manager, denied = clients
    for value in (0, -1, 31, 10081, 20160, True, '60', 60.0):
        assert manager.put('/api/v1/settings', json={'resetLinkExpiryMinutes': value}).status_code == 422
    for value in (30, 60, 240, 720, 1440, 2880, 4320, 10080):
        assert manager.put('/api/v1/settings', json={'resetLinkExpiryMinutes': value}).status_code == 200
    assert denied.put('/api/v1/settings', json={'resetLinkExpiryMinutes': 60}).status_code == 403
    supplier = TestClient(app, headers={'Authorization': 'Bearer '+create_access_token('vendor', 'supplier', {})})
    assert supplier.put('/api/v1/settings', json={'resetLinkExpiryMinutes': 60}).status_code == 403
    assert TestClient(app).put('/api/v1/settings', json={'resetLinkExpiryMinutes': 60}).status_code in (401, 403)
    # Manage Users does not grant permission to edit other configuration.
    assert manager.put('/api/v1/settings', json={'senderEmail': 'changed@example.com', 'resetLinkExpiryMinutes': 60}).status_code == 403


def test_first_save_initializes_required_role_matrix(clients):
    with SessionLocal() as db:
        db.delete(db.get(AppSettings, 1))
        name = uuid4().hex
        admin = User(username=name, name='Admin', email=name+'@example.com', role='Admin', status='Active', password_hash=get_password_hash('TestPassword1!'))
        db.add(admin)
        db.commit()
        admin_id = admin.id
    client = TestClient(app, headers={'Authorization': 'Bearer '+create_access_token(admin_id, 'internal', {'channelScope': 'all'})})
    response = client.put('/api/v1/settings', json={'inviteLinkExpiryMinutes': 2880, 'resetLinkExpiryMinutes': 1440})
    assert response.status_code == 200, response.text
    with SessionLocal() as db:
        settings = db.get(AppSettings, 1)
        assert settings.role_matrix_json == DEFAULT_ROLE_MATRIX
        assert settings.two_factor is False
        assert settings.sender_email
        assert settings.invite_link_expiry_minutes == 2880
        assert settings.reset_link_expiry_minutes == 1440
    assert client.put('/api/v1/settings', json={'inviteLinkExpiryMinutes': 4320}).status_code == 200
    assert client.get('/api/v1/workspace').json()['settings']['inviteLinkExpiryMinutes'] == 4320


def test_expiry_migration_upgrades_and_downgrades():
    import importlib.util
    from pathlib import Path
    import sqlalchemy as sa
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path = Path(__file__).parents[1]/'alembic/versions/f2a94d6e8b10_password_link_expiry.py'
    spec = importlib.util.spec_from_file_location('expiry_migration', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine('sqlite://')
    with engine.begin() as conn:
        conn.execute(sa.text('CREATE TABLE settings (id INTEGER PRIMARY KEY)'))
        conn.execute(sa.text('INSERT INTO settings (id) VALUES (1)'))
        migration.op = Operations(MigrationContext.configure(conn))
        migration.upgrade()
        assert tuple(conn.execute(sa.text('SELECT invite_link_expiry_minutes, reset_link_expiry_minutes FROM settings')).one()) == (10080, 1440)
        migration.downgrade()
        assert [column['name'] for column in sa.inspect(conn).get_columns('settings')] == ['id']
    engine.dispose()
