"""Supplier link policies use isolated test storage and never alter application data."""
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from urllib.parse import urlsplit, parse_qs

import pytest
from fastapi.testclient import TestClient

if os.environ.get('I2P_LINK_TEST_ISOLATED') != '1':
    pytest.skip('Requires isolated link_tests.support plugin', allow_module_level=True)

from app.main import app
from app.core.database import SessionLocal
from app.core.permissions import DEFAULT_ROLE_MATRIX
from app.core.security import create_access_token, get_password_hash
from app.models.settings import AppSettings, TableRow
from app.models.supplier import Supplier, SupplierSetupToken
from app.models.user import User
from app.services import vendor_directory

PAN = 'EXPRY1234A'
BASE = '/api/v1/suppliers'


@pytest.fixture
def clients(monkeypatch):
    monkeypatch.setattr(vendor_directory, 'get_all_cached_invoices', lambda: [
        {'SUPPLIER': 'EXP001', 'SUPPLIER_NAME': 'Expiry Test', 'PAN_NO': PAN},
    ])
    fields = ('role_matrix_json', 'supplier_invite_link_expiry_minutes', 'supplier_reset_link_expiry_minutes')
    with SessionLocal() as db:
        settings = db.get(AppSettings, 1)
        if not settings:
            settings = AppSettings(id=1)
            db.add(settings)
            db.flush()
        old = {field: getattr(settings, field) for field in fields}
        matrix = {role: dict(caps) for role, caps in DEFAULT_ROLE_MATRIX.items()}
        matrix['Viewer']['manageUsers'] = True
        settings.role_matrix_json = matrix
        settings.supplier_invite_link_expiry_minutes = 10080
        settings.supplier_reset_link_expiry_minutes = 1440
        ids = []
        for role in ('Invoice Team', 'Viewer', 'Accounts'):
            name = uuid4().hex
            user = User(username=name, name=name, email=name+'@example.com', role=role,
                        channel_scope='msetuSrm', status='Active', password_hash=get_password_hash('TestPassword1!'))
            db.add(user)
            db.flush()
            ids.append(user.id)
        db.commit()
    yield [TestClient(app, headers={'Authorization': 'Bearer '+create_access_token(i, 'internal', {'channelScope': 'msetuSrm'})}) for i in ids]
    with SessionLocal() as db:
        db.query(Supplier).filter_by(pan=PAN).delete()
        settings = db.get(AppSettings, 1)
        for field, value in old.items():
            setattr(settings, field, value)
        db.commit()


def token(link):
    return parse_qs(urlsplit(link['setupLink']).query)['token'][0]


def complete(link):
    return TestClient(app).post('/api/v1/auth/supplier/complete-supplier-setup', json={
        'token': token(link), 'pan': PAN, 'password': 'ChosenPassword1!',
    })


def test_supplier_policy_persists_and_applies_to_setup_reset_and_replacements(clients):
    manager, _, _ = clients
    original = manager.post(BASE+'/add-supplier', json={'pan': PAN, 'vendorCodes': ['EXP001']}).json()
    assert original['expiryMinutes'] == 10080
    with SessionLocal() as db:
        old_token = db.query(SupplierSetupToken).filter_by(token=token(original)).one()
        old_id, old_expiry = old_token.id, old_token.expires_at
    before = manager.get('/api/v1/workspace').json()['settings']
    values = {'supplierInviteLinkExpiryMinutes': 60, 'supplierResetLinkExpiryMinutes': 4320}
    assert manager.put('/api/v1/settings', json=values).status_code == 200
    saved = manager.get('/api/v1/workspace').json()['settings']
    assert all(saved[key] == value for key, value in values.items())
    assert saved['inviteLinkExpiryMinutes'] == before['inviteLinkExpiryMinutes']
    assert saved['resetLinkExpiryMinutes'] == before['resetLinkExpiryMinutes']
    with SessionLocal() as db:
        assert db.get(SupplierSetupToken, old_id).expires_at == old_expiry
        assert any('supplierResetLinkExpiryMinutes' in str(row.cells_json) for row in db.query(TableRow).all())
    replacement = manager.post(f"{BASE}/{original['id']}/generate-setup-link").json()
    assert replacement['expiryMinutes'] == 60 and replacement['linkType'] == 'invite'
    assert timedelta(minutes=59) < datetime.fromisoformat(replacement['expiresAt'])-datetime.now(timezone.utc) <= timedelta(minutes=60)
    assert complete(original).status_code == 400
    assert complete(replacement).status_code == 200
    assert complete(replacement).status_code == 400
    reset = manager.post(f"{BASE}/{original['id']}/reset-supplier-password").json()
    assert reset['expiryMinutes'] == 4320 and reset['linkType'] == 'reset'
    assert timedelta(days=2, hours=23) < datetime.fromisoformat(reset['expiresAt'])-datetime.now(timezone.utc) <= timedelta(days=3)
    reset_replacement = manager.post(f"{BASE}/{original['id']}/generate-setup-link").json()
    assert reset_replacement['expiryMinutes'] == 4320 and reset_replacement['linkType'] == 'reset'
    assert complete(reset).status_code == 400
    assert complete(reset_replacement).status_code == 200


def test_supplier_policy_permissions_and_allowed_durations(clients):
    manager, internal_manager, denied = clients
    for field in ('supplierInviteLinkExpiryMinutes', 'supplierResetLinkExpiryMinutes'):
        for value in (0, -1, 31, 10081, 20160, True, '60', 60.0):
            assert manager.put('/api/v1/settings', json={field: value}).status_code == 422
        for value in (30, 60, 240, 720, 1440, 2880, 4320, 10080):
            assert manager.put('/api/v1/settings', json={field: value}).status_code == 200
        assert internal_manager.put('/api/v1/settings', json={field: 60}).status_code == 403
        assert denied.put('/api/v1/settings', json={field: 60}).status_code == 403
    assert manager.put('/api/v1/settings', json={'inviteLinkExpiryMinutes': 60, 'supplierInviteLinkExpiryMinutes': 60}).status_code == 403
    supplier = TestClient(app, headers={'Authorization': 'Bearer '+create_access_token('EXP001', 'supplier', {})})
    assert supplier.put('/api/v1/settings', json={'supplierResetLinkExpiryMinutes': 60}).status_code == 403
    assert TestClient(app).put('/api/v1/settings', json={'supplierResetLinkExpiryMinutes': 60}).status_code in (401, 403)


def test_expired_supplier_links_remain_rejected(clients):
    manager, _, _ = clients
    link = manager.post(BASE+'/add-supplier', json={'pan': PAN, 'vendorCodes': ['EXP001']}).json()
    with SessionLocal() as db:
        db.query(SupplierSetupToken).filter_by(token=token(link)).update({'expires_at': datetime.utcnow()-timedelta(minutes=1)})
        db.commit()
    assert complete(link).status_code == 400


def test_supplier_expiry_migration_preserves_existing_token_expiry():
    import importlib.util
    from pathlib import Path
    import sqlalchemy as sa
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path = Path(__file__).parents[1]/'alembic/versions/4e3a82b0d9f5_supplier_link_expiry.py'
    spec = importlib.util.spec_from_file_location('supplier_expiry_migration', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine('sqlite://')
    with engine.begin() as conn:
        conn.execute(sa.text('CREATE TABLE settings (id INTEGER PRIMARY KEY)'))
        conn.execute(sa.text('INSERT INTO settings (id) VALUES (1)'))
        conn.execute(sa.text('CREATE TABLE supplier_setup_tokens (id INTEGER PRIMARY KEY, expires_at DATETIME)'))
        conn.execute(sa.text("INSERT INTO supplier_setup_tokens VALUES (1, '2026-11-01 10:00:00')"))
        migration.op = Operations(MigrationContext.configure(conn))
        migration.upgrade()
        assert tuple(conn.execute(sa.text('SELECT supplier_invite_link_expiry_minutes, supplier_reset_link_expiry_minutes FROM settings')).one()) == (10080, 1440)
        assert tuple(conn.execute(sa.text('SELECT link_type, expires_at FROM supplier_setup_tokens')).one()) == ('invite', '2026-11-01 10:00:00')
        migration.downgrade()
        assert [c['name'] for c in sa.inspect(conn).get_columns('settings')] == ['id']
        assert [c['name'] for c in sa.inspect(conn).get_columns('supplier_setup_tokens')] == ['id', 'expires_at']
    engine.dispose()
