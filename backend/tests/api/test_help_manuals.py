"""Internal user manuals are served only to signed-in staff, for their own portal."""
from pathlib import Path
from urllib.parse import unquote

from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.main import app
from tests.helpers.suppliers import supplier_headers_for_code
from tests.helpers.users import internal_user_id

client = TestClient(app)
URL = "/api/v1/help/user-manual"
PUBLIC = Path(__file__).resolve().parents[3] / "frontend" / "public" / "user-manual"


def _staff(scope, username, role="Invoice Team L1"):
    user_id = internal_user_id(username, role=role, channel_scope=scope)
    return {"Authorization": f"Bearer {create_access_token(user_id, 'internal', {'channelScope': scope})}"}


def test_internal_manuals_need_a_staff_sign_in():
    assert client.get(URL).status_code in (401, 403)
    assert client.get(URL, headers=supplier_headers_for_code("HELP-V1")).status_code == 403


def test_staff_get_the_manual_for_their_portal():
    cases = [("all", "help_admin", "Admin", "All Channels"), ("msetuSrm", "help_srm", "Invoice Team L1", "Msetu SRM"),
             ("poPortal", "help_po", "Invoice Team L1", "PO Portal")]
    for scope, username, role, title in cases:
        response = client.get(URL, headers=_staff(scope, username, role))
        assert response.status_code == 200, (scope, response.text)
        assert response.headers["content-type"] == "application/pdf"
        assert response.content.startswith(b"%PDF")
        assert title in unquote(response.headers["content-disposition"])
        assert response.headers["cache-control"] == "no-store"


def test_only_the_supplier_manual_is_public():
    assert sorted(p.name for p in PUBLIC.glob("*.pdf")) == ["vendor-view.pdf"]
