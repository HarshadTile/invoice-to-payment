import json
import logging

import pytest

from otp_tests.sample_data import make_mobile
from fastapi import HTTPException

from app.services import supplier_sms, twofactor_sms

TEST_KEY = "synthetic-private-key"
PHONE = make_mobile("old-phone")
CODE = "012345"


@pytest.fixture
def transport(monkeypatch):
    calls = []
    settings = {"status": 200, "body": json.dumps({"Status": "Success", "Details": "fake-session"}).encode()}
    class Connection:
        def __init__(self, host, timeout):
            calls.append({"host": host, "timeout": timeout, "closed": False})
        def request(self, method, path, body, headers):
            calls[-1].update(method=method, path=path, body=body, headers=headers)
            if settings.get("error"):
                raise settings["error"]
        def getresponse(self):
            return self
        @property
        def status(self):
            return settings["status"]
        def read(self, limit):
            return settings["body"][:limit]
        def close(self):
            calls[-1]["closed"] = True
    monkeypatch.setattr(twofactor_sms.http.client, "HTTPSConnection", Connection)
    return calls, settings


def test_manual_code_template_and_no_sensitive_logging(transport, caplog):
    with caplog.at_level(logging.DEBUG):
        twofactor_sms.TwoFactorSmsSender(TEST_KEY, "SupplierLoginOTP").send(PHONE, CODE, "challenge")
    call = transport[0][0]
    assert call["host"] == "2factor.in"
    assert call["timeout"] == 10
    assert call["method"] == "POST"
    assert call["path"] == f"/API/V1/{TEST_KEY}/SMS/{PHONE[1:]}/{CODE}/SupplierLoginOTP"
    assert call["closed"]
    assert TEST_KEY not in caplog.text
    assert PHONE[1:] not in caplog.text
    assert CODE not in caplog.text


@pytest.mark.parametrize("status,body", [
    (401, b"credential rejected"), (429, b"rate limited"), (500, b"server error"),
    (302, b"redirect"), (200, b"invalid json"), (200, b"[]"),
    (200, b'{"Status":"Error","Details":"secret provider data"}'),
    (200, b'{"Status":"Success"}'), (200, b'{"Status":"Success","Details":""}'),
    (200, b"x" * 16385),
])
def test_provider_rejections_are_sanitized(transport, status, body):
    transport[1].update(status=status, body=body)
    with pytest.raises(twofactor_sms.SmsDeliveryError) as error:
        twofactor_sms.TwoFactorSmsSender(TEST_KEY, "SupplierLoginOTP").send(PHONE, CODE, "challenge")
    assert str(error.value) == "SMS delivery could not be confirmed."
    assert error.value.__suppress_context__
    assert transport[0][0]["closed"]
    assert len(transport[0]) == 1


def test_timeout_does_not_retry_or_expose_url(transport):
    transport[1]["error"] = TimeoutError(f"/{TEST_KEY}/{PHONE}/{CODE}")
    with pytest.raises(twofactor_sms.SmsDeliveryError) as error:
        twofactor_sms.TwoFactorSmsSender(TEST_KEY, "SupplierLoginOTP").send(PHONE, CODE, "challenge")
    assert TEST_KEY not in str(error.value)
    assert PHONE not in str(error.value)
    assert CODE not in str(error.value)
    assert len(transport[0]) == 1
    assert transport[0][0]["closed"]


def test_phone_validation_prevents_network_request(transport):
    with pytest.raises(twofactor_sms.SmsDeliveryError):
        twofactor_sms.TwoFactorSmsSender(TEST_KEY, "SupplierLoginOTP").send(make_mobile("foreign-phone", country_code="+1"), CODE, "challenge")
    assert not transport[0]


def test_configuration_requires_explicit_mode_credentials_and_template(monkeypatch):
    monkeypatch.setenv("SUPPLIER_SMS_MODE", "2factor")
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("TWOFACTOR_API_KEY", raising=False)
    monkeypatch.delenv("TWOFACTOR_OTP_TEMPLATE", raising=False)
    with pytest.raises(HTTPException):
        supplier_sms.get_sms_sender()
    monkeypatch.setenv("TWOFACTOR_API_KEY", TEST_KEY)
    with pytest.raises(HTTPException):
        supplier_sms.get_sms_sender()
    monkeypatch.setenv("TWOFACTOR_OTP_TEMPLATE", "SupplierLoginOTP")
    assert isinstance(supplier_sms.get_sms_sender(), twofactor_sms.TwoFactorSmsSender)


def test_url_segments_are_encoded(transport):
    twofactor_sms.TwoFactorSmsSender("fake/key", "Template/name").send(PHONE, CODE, "challenge")
    assert transport[0][0]["path"].startswith("/API/V1/fake%2Fkey/SMS/")
    assert transport[0][0]["path"].endswith("/Template%2Fname")
