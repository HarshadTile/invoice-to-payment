import os
import time
from typing import Protocol

from fastapi import HTTPException
from app.services.twofactor_sms import TwoFactorSmsSender


class SmsSender(Protocol):
    def send(self, phone: str, code: str, challenge: str) -> None: ...


class LocalMockSender:
    # Private debugger/test-only outbox; never exposed through HTTP or logs.
    def __init__(self):
        self._outbox = {}

    def send(self, phone: str, code: str, challenge: str) -> None:
        if os.getenv("APP_ENV") != "development" or os.getenv("SUPPLIER_SMS_MODE") != "mock":
            raise RuntimeError("Local SMS mock is disabled")
        now = time.time()
        self._outbox = {key: value for key, value in self._outbox.items() if value[1] > now}
        if len(self._outbox) >= 1000:
            self._outbox.clear()
        self._outbox[challenge] = (code, now + 300)


local_mock_sender = LocalMockSender()


def get_sms_sender() -> SmsSender:
    if os.getenv("SUPPLIER_SMS_MODE") == "2factor":
        key = os.getenv("TWOFACTOR_API_KEY", "").strip()
        template = os.getenv("TWOFACTOR_OTP_TEMPLATE", "").strip()
        if not key or not template:
            raise HTTPException(503, "2Factor SMS credentials or template are not configured.")
        return TwoFactorSmsSender(key, template)
    if os.getenv("APP_ENV") == "development" and os.getenv("SUPPLIER_SMS_MODE") == "mock":
        return local_mock_sender
    raise HTTPException(503, "SMS delivery is not configured. Contact support.")
