import os
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient

if os.environ.get('I2P_LINK_TEST_ISOLATED') != '1':
    pytest.skip('Requires isolated link_tests.support plugin', allow_module_level=True)

from app.main import app
from app.core.database import SessionLocal
from app.core.security import create_access_token, get_password_hash
from app.core.channels import DEFAULT_CHANNEL_AVAILABILITY
from app.models.settings import AppSettings, TableRow
from app.models.user import User
from app.models.supplier import Supplier


@pytest.fixture
def accounts():
    with SessionLocal() as db:
        settings = db.get(AppSettings, 1)
        if not settings:
            settings = AppSettings(id=1)
            db.add(settings)
            db.flush()
        previous, previous_matrix = settings.channel_availability, settings.role_matrix_json
        settings.channel_availability = None
        settings.role_matrix_json = None
        ids, names = [], []
        for role in ('Admin', 'Viewer'):
            name = uuid4().hex
            user = User(username=name, name=name, email=name+'@example.com', role=role,
                        status='Active', channel_scope='all', password_hash=get_password_hash('TestPassword1!'))
            db.add(user)
            db.flush()
            ids.append(user.id)
            names.append(name)
        supplier = Supplier(pan='CHANN1234A', name='Channel Test', channel='mfoxPortal', status='Active', password_hash=get_password_hash('TestPassword1!'))
        db.add(supplier)
        db.commit()
    clients = [TestClient(app, headers={'Authorization': 'Bearer '+create_access_token(i, 'internal', {'channelScope': 'all'})}) for i in ids]
    yield clients, names
    with SessionLocal() as db:
        settings = db.get(AppSettings, 1)
        settings.channel_availability, settings.role_matrix_json = previous, previous_matrix
        db.query(Supplier).filter_by(pan='CHANN1234A').delete()
        db.commit()


def test_portal_defaults_saved_settings_public_login_options_and_audit(accounts):
    (admin, _), _names = accounts
    public = TestClient(app)
    response = public.get('/api/v1/auth/portal-availability')
    assert response.json() == {'channelAvailability': DEFAULT_CHANNEL_AVAILABILITY}
    assert response.headers['cache-control'] == 'no-store'
    assert admin.put('/api/v1/settings', json={'channelAvailability': {'mfoxPortal': True}}).status_code == 200
    assert public.get('/api/v1/auth/portal-availability').json()['channelAvailability']['mfoxPortal'] is True
    assert admin.get('/api/v1/load-workspace-data').json()['settings']['channelAvailability']['mfoxPortal'] is True
    with SessionLocal() as db:
        assert db.get(AppSettings, 1).channel_availability['mfoxPortal'] is True
        assert any('Changed portal availability' in str(row.cells_json) for row in db.query(TableRow).all())


def test_disabled_portal_rejects_internal_and_supplier_signin_until_enabled(accounts):
    (admin, _), names = accounts
    public = TestClient(app)
    internal = {'username': names[0], 'password': 'TestPassword1!', 'channelScope': 'mfoxPortal'}
    supplier = {'pan': 'CHANN1234A', 'password': 'TestPassword1!'}
    assert public.post('/api/v1/auth/login', json=internal).status_code == 403
    assert public.post('/api/v1/auth/supplier/login-with-password', json=supplier).status_code == 403
    assert public.post('/api/v1/auth/login', json={**internal, 'channelScope': 'all'}).status_code == 200
    assert admin.put('/api/v1/settings', json={'channelAvailability': {'mfoxPortal': True}}).status_code == 200
    assert public.post('/api/v1/auth/login', json=internal).status_code == 200
    assert public.post('/api/v1/auth/supplier/login-with-password', json=supplier).status_code == 200


def test_portal_settings_validate_keys_booleans_and_permissions(accounts):
    (admin, viewer), _ = accounts
    for value in ({'wrong': True}, {'mfoxPortal': 'true'}, {'mfoxPortal': 1}, {'mfoxPortal': None}):
        assert admin.put('/api/v1/settings', json={'channelAvailability': value}).status_code == 422
    assert viewer.put('/api/v1/settings', json={'channelAvailability': {'mfoxPortal': True}}).status_code == 403
    assert TestClient(app).put('/api/v1/settings', json={'channelAvailability': {'mfoxPortal': True}}).status_code in (401, 403)
