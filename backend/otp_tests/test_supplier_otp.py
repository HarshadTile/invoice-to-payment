"""Isolated SQLite tests: does not run the legacy MySQL database-reset fixture."""
import os

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-key-" + "x" * 40)

import pytest

from otp_tests.sample_data import make_mobile
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1 import auth, invoice
from app.core.database import get_db
from app.core import security
from app.models.supplier_otp import SupplierOtpState
from app.services import supplier_otp, supplier_sms


@pytest.fixture
def env(monkeypatch):
    monkeypatch.delenv("SUPPLIER_MOBILE_EXCEL_FILE", raising=False)
    monkeypatch.setenv("SUPPLIER_MOBILE_AUTH", "true")
    monkeypatch.setenv("SUPPLIER_OTP_SECRET", "test-otp-key-" + "y" * 40)
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("SUPPLIER_SMS_MODE", "mock")
    monkeypatch.setattr(security, "SECRET_KEY", "test-jwt-key-" + "x" * 40)
    clock = [2_000_000_000.0]  # Fixed epoch time for expiry/rate-limit tests.
    monkeypatch.setattr(supplier_otp.time, "time", lambda: clock[0])
    rows = [{"SUPPLIER": "V1", "SUPPLIER_NAME": "Vendor One", "SUPPLIER_MOBILE": make_mobile("vendor-one")},
            {"SUPPLIER": "V2", "SUPPLIER_NAME": "Vendor Two", "SUPPLIER_MOBILE": make_mobile("vendor-two")}]
    monkeypatch.setattr(auth, "get_all_cached_invoices", lambda: rows)
    monkeypatch.setattr(invoice, "get_all_cached_invoices", lambda: rows)
    monkeypatch.setattr(auth, "write_audit", lambda *args: None)
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SupplierOtpState.__table__.create(engine)
    factory = sessionmaker(bind=engine)
    app = FastAPI()
    app.include_router(auth.router, prefix="/auth")
    app.include_router(invoice.router)
    def database():
        with factory() as db:
            yield db
    app.dependency_overrides[get_db] = database
    supplier_sms.local_mock_sender._outbox.clear()
    with TestClient(app) as client:
        yield client, rows, clock, factory
    engine.dispose()


def start(env, vendor="V1"):
    return env[0].post("/auth/supplier/login", json={"vcode": vendor})


def code_for(response):
    return supplier_sms.local_mock_sender._outbox[response.json()["challenge_id"]][0]


def verify(env, response, code=None):
    return env[0].post("/auth/supplier/otp/verify", json={
        "challenge_id": response.json()["challenge_id"], "code": code if code is not None else code_for(response)})


def test_success_single_use_scope_and_no_secrets(env):
    response = start(env, "v1")
    assert response.status_code == 200
    assert response.json()["phone_last4"] == make_mobile("vendor-one")[-4:]
    assert "token" not in response.json()
    assert make_mobile("vendor-one") not in response.text
    assert code_for(response) not in response.text
    with env[3]() as db:
        state = db.query(SupplierOtpState).filter(SupplierOtpState.challenge.is_not(None)).one()
        assert state.digest != code_for(response)
        assert make_mobile("vendor-one") not in str(state.identity)
    result = verify(env, response)
    assert result.status_code == 200
    headers = {"Authorization": "Bearer " + result.json()["token"]}
    assert env[0].get("/auth/me", headers=headers).json()["auth"]["vcode"] == "V1"
    assert env[0].get("/invoices/summary?vendor_code=V2", headers=headers).json()["total"] == 1
    assert verify(env, response).status_code == 400


def test_wrong_code_attempt_limit_survives_restart_and_resend(env):
    response = start(env)
    wrong = "999999" if code_for(response) != "999999" else "000000"
    for _ in range(5):
        assert verify(env, response, wrong).status_code == 400
    assert verify(env, response).status_code == 400
    env[2][0] += 61
    assert start(env).status_code == 429
    env[2][0] += 900
    assert start(env).status_code == 200


def test_expired(env):
    response = start(env)
    code = code_for(response)
    env[2][0] += 301
    assert verify(env, response, code).status_code == 400


def test_resend_cooldown_replaces_code_and_send_limit(env):
    first = start(env)
    client = env[0]
    resend = lambda response: client.post("/auth/supplier/otp/resend", json={"challenge_id": response.json()["challenge_id"]})
    assert resend(first).status_code == 429
    env[2][0] += 61
    second = resend(first)
    assert second.status_code == 200
    assert second.json()["challenge_id"] != first.json()["challenge_id"]
    assert verify(env, first).status_code == 400
    latest = second
    for _ in range(3):
        env[2][0] += 61
        latest = resend(latest)
        assert latest.status_code == 200
    env[2][0] += 61
    assert resend(latest).status_code == 429
    assert verify(env, latest).status_code == 200


@pytest.mark.parametrize("phone", [None, "", make_mobile("too-short")[-4:],
                                  int(make_mobile("numeric-cell")[1:]),
                                  "+0" + make_mobile("invalid-prefix")[3:], "bad"])
def test_missing_invalid_mobile(env, phone):
    env[1][0]["SUPPLIER_MOBILE"] = phone
    assert start(env).status_code == 400


def test_conflicting_and_consistent_repeated_rows(env):
    env[1].append({**env[1][0], "SUPPLIER_MOBILE": make_mobile("conflicting-phone")})
    assert start(env).status_code == 400
    env[1][-1]["SUPPLIER_MOBILE"] = env[1][0]["SUPPLIER_MOBILE"]
    assert start(env).status_code == 200


def test_flag_old_tokens_and_internal_unchanged(env, monkeypatch):
    old = security.create_access_token("V1", "supplier")
    internal = security.create_access_token("1", "internal")
    assert env[0].get("/invoices/summary", headers={"Authorization": "Bearer " + old}).status_code == 401
    assert env[0].get("/invoices/summary", headers={"Authorization": "Bearer " + internal}).status_code == 200
    monkeypatch.setenv("SUPPLIER_MOBILE_AUTH", "false")
    env[1][0].pop("SUPPLIER_MOBILE")
    assert "token" in start(env).json()
    assert env[0].get("/invoices/summary", headers={"Authorization": "Bearer " + old}).status_code == 200
    assert env[0].post("/auth/supplier/otp/verify", json={"challenge_id": "bad", "code": "123456"}).status_code == 400


def test_sms_failure_no_fallback(env, monkeypatch):
    class Broken:
        def send(self, *args):
            raise RuntimeError("sensitive provider error")
    monkeypatch.setattr(supplier_otp, "get_sms_sender", lambda: Broken())
    response = start(env)
    assert response.status_code == 503
    assert "sensitive" not in response.text
    assert "token" not in response.json()
    assert start(env).status_code == 429


def test_mock_forbidden_in_production_and_unconfigured(env, monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    assert start(env).status_code == 503
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("SUPPLIER_SMS_MODE", "disabled")
    assert start(env).status_code == 503


def test_cancel_and_unknown_challenge(env):
    response = start(env)
    assert env[0].post("/auth/supplier/otp/cancel", json={"challenge_id": response.json()["challenge_id"]}).status_code == 200
    assert verify(env, response).status_code == 400
    assert start(env, "unknown").status_code == 401


def test_ip_send_limit(env):
    for index in range(20):
        vendor = f"X{index}"
        env[1].append({"SUPPLIER": vendor, "SUPPLIER_MOBILE": make_mobile("vendor-one")})
        assert start(env, vendor).status_code == 200
    env[1].append({"SUPPLIER": "EXTRA", "SUPPLIER_MOBILE": make_mobile("vendor-one")})
    assert start(env, "EXTRA").status_code == 429


def test_requires_secure_secrets_and_valid_flag(env, monkeypatch):
    monkeypatch.setenv("SUPPLIER_OTP_SECRET", "short")
    assert start(env).status_code == 503
    monkeypatch.setattr(security, "SECRET_KEY", "SUPER_SECRET_KEY_REPLACE_IN_PRODUCTION")
    assert start(env).status_code == 503
    monkeypatch.setenv("SUPPLIER_MOBILE_AUTH", "typo")
    assert start(env).status_code == 503


def test_resend_does_not_reset_verification_attempts(env):
    first = start(env)
    wrong = "999999" if code_for(first) != "999999" else "000000"
    for _ in range(4):
        assert verify(env, first, wrong).status_code == 400
    env[2][0] += 61
    second = env[0].post("/auth/supplier/otp/resend", json={"challenge_id": first.json()["challenge_id"]})
    assert second.status_code == 200
    wrong = "999999" if code_for(second) != "999999" else "000000"
    assert verify(env, second, wrong).status_code == 400
    assert verify(env, second).status_code == 400


def test_concurrent_verification_only_issues_one_session(env, tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from fastapi import HTTPException
    engine = create_engine("sqlite:///" + str(tmp_path / "otp.db"))
    SupplierOtpState.__table__.create(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        result = supplier_otp.send_code(db, {"vcode": "V1", "company": "Vendor", "pan": "-"}, make_mobile("vendor-one"), "local")
    challenge = result["challenge_id"]
    code = supplier_sms.local_mock_sender._outbox[challenge][0]
    def consume():
        with factory() as db:
            try:
                supplier_otp.verify_code(db, challenge, code, "local", make_mobile("vendor-one"))
                return "verified"
            except HTTPException:
                return "rejected"
    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(lambda _: consume(), range(2)))
    assert sorted(outcomes) == ["rejected", "verified"]
    engine.dispose()


def test_migration_upgrade_and_downgrade(env):
    import importlib.util
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import inspect
    path = Path(__file__).parents[1] / "alembic/versions/c8e9f0a1b236_supplier_otp.py"
    spec = importlib.util.spec_from_file_location("otp_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            assert "supplier_otp_states" in inspect(connection).get_table_names()
            migration.downgrade()
            assert "supplier_otp_states" not in inspect(connection).get_table_names()
    engine.dispose()


def test_internal_password_login_with_otp_enabled(env):
    from app.models.user import User, UserChannelAccess
    engine = env[3].kw["bind"]
    User.__table__.create(engine)
    UserChannelAccess.__table__.create(engine)
    with env[3]() as db:
        db.add(User(username="staff", email="staff@example.com", name="Staff", role="Admin",
                    ticket_role="ADMIN", status="Active", password_hash=security.get_password_hash("staff-password")))
        db.commit()
    result = env[0].post("/auth/login", json={"username": "staff", "password": "staff-password"})
    assert result.status_code == 200
    assert result.json()["auth"]["authType"] == "internal"
    assert env[0].post("/auth/login", json={"username": "staff", "password": "wrong"}).status_code == 401


def test_ip_verification_limit_across_vendors(env):
    for index in range(10):
        vendor = f"X{index}"
        env[1].append({"SUPPLIER": vendor, "SUPPLIER_MOBILE": make_mobile("vendor-one")})
        response = start(env, vendor)
        wrong = "999999" if code_for(response) != "999999" else "000000"
        for _ in range(5):
            assert verify(env, response, wrong).status_code == 400
    response = start(env, "V1")
    assert verify(env, response).status_code == 429


def test_validation_errors_do_not_echo_codes_or_phones(env):
    from fastapi.exceptions import RequestValidationError
    from app.main import validation_exception_handler
    env[0].app.add_exception_handler(RequestValidationError, validation_exception_handler)
    # The test app's exception middleware is already initialized; rebuild it.
    env[0].app.middleware_stack = None
    for value in ["secret-otp-input", make_mobile("vendor-one"), {"phone": make_mobile("vendor-one")}]:
        response = env[0].post("/auth/supplier/otp/verify", json={"challenge_id": "challenge", "code": value})
        assert response.status_code == 422
        assert "secret-otp-input" not in response.text
        assert make_mobile("vendor-one") not in response.text


@pytest.mark.parametrize("accepted", [True, False])
def test_twofactor_login_with_mocked_provider(env, monkeypatch, accepted):
    from unittest.mock import MagicMock
    from app.services import twofactor_sms
    monkeypatch.setenv("SUPPLIER_SMS_MODE", "2factor")
    monkeypatch.setenv("TWOFACTOR_API_KEY", "fake-provider-key")
    monkeypatch.setenv("TWOFACTOR_OTP_TEMPLATE", "SupplierLoginOTP")
    env[1][0]["SUPPLIER_MOBILE"] = make_mobile("old-phone")
    connection = MagicMock()
    connection.getresponse.return_value.status = 200
    connection.getresponse.return_value.read.return_value = (
        b'{"Status":"Success","Details":"fake-session"}' if accepted
        else b'{"Status":"Error","Details":"sensitive-provider-error"}'
    )
    monkeypatch.setattr(twofactor_sms.http.client, "HTTPSConnection", lambda *args, **kwargs: connection)
    response = start(env)
    assert "token" not in response.json()
    assert "fake-provider-key" not in response.text
    assert make_mobile("old-phone") not in response.text
    if accepted:
        assert response.status_code == 200
        code = connection.request.call_args.args[1].split("/")[-2]
        assert verify(env, response, code).status_code == 200
        assert verify(env, response, code).status_code == 400
    else:
        assert response.status_code == 503
        assert "sensitive-provider-error" not in response.text
        with env[3]() as db:
            state = db.query(SupplierOtpState).filter(SupplierOtpState.challenge.is_not(None)).one()
            assert state.digest is None
            assert state.sends == 1
    assert not supplier_sms.local_mock_sender._outbox


def test_separate_master_login_and_phone_edit_resend(env, monkeypatch, tmp_path):
    from openpyxl import Workbook
    path = tmp_path / "phones.xlsx"
    def save_phone(phone):
        book = Workbook()
        sheet = book.active
        sheet.title = "vendors"
        sheet.append(["SUPPLIER", "SUPPLIER_MOBILE"])
        sheet.append(["V1", phone])
        sheet.append(["NOT-IN-INVOICES", phone])
        book.save(path)
        book.close()
    env[1][0].pop("SUPPLIER_MOBILE")
    env[1].append(dict(env[1][0]))  # Repeated invoice rows need no phone column.
    save_phone(make_mobile("old-phone"))
    monkeypatch.setenv("SUPPLIER_MOBILE_EXCEL_FILE", str(path))
    assert start(env, "NOT-IN-INVOICES").status_code == 401
    assert not supplier_sms.local_mock_sender._outbox
    first = start(env)
    assert first.status_code == 200 and first.json()["phone_last4"] == make_mobile("old-phone")[-4:]
    save_phone(make_mobile("new-phone"))
    env[2][0] += 61
    second = env[0].post("/auth/supplier/otp/resend", json={"challenge_id": first.json()["challenge_id"]})
    assert second.status_code == 200 and second.json()["phone_last4"] == make_mobile("new-phone")[-4:]
    assert verify(env, first).status_code == 400
    result = verify(env, second)
    assert result.status_code == 200
    headers = {"Authorization": "Bearer " + result.json()["token"]}
    assert env[0].get("/invoices/summary?vendor_code=V2", headers=headers).json()["total"] == 2


def test_phone_change_rejects_previously_issued_code(env):
    first = start(env)
    env[1][0]["SUPPLIER_MOBILE"] = make_mobile("replacement-phone")
    result = verify(env, first)
    assert result.status_code == 400
    assert "mobile number changed" in result.text
    with env[3]() as db:
        row = db.query(SupplierOtpState).filter_by(challenge=first.json()["challenge_id"]).one()
        assert row.digest is None
    env[2][0] += 61
    new = start(env)
    assert verify(env, new).status_code == 200


def test_distinct_vendor_phones_and_tokens_are_independent(env, monkeypatch):
    delivered = []
    class Sender:
        def send(self, phone, code, challenge):
            delivered.append((phone, code, challenge))
    monkeypatch.setattr(supplier_otp, "get_sms_sender", lambda: Sender())
    first = start(env, "V1")
    second = start(env, "V2")
    assert delivered[0][0] == env[1][0]["SUPPLIER_MOBILE"]
    assert delivered[1][0] == env[1][1]["SUPPLIER_MOBILE"]
    assert delivered[0][0] != delivered[1][0]
    for response, delivery, vendor in ((first, delivered[0], "V1"), (second, delivered[1], "V2")):
        result = verify(env, response, delivery[1])
        assert result.status_code == 200
        assert result.json()["auth"]["vcode"] == vendor
        headers = {"Authorization": "Bearer " + result.json()["token"]}
        assert env[0].get("/invoices/summary?vendor_code=OTHER", headers=headers).json()["total"] == 1
