"""2Factor manual OTP API: the application generates and verifies the code.

Use stdlib HTTPS so HTTP client logging cannot print the sensitive request URL.
Provider URLs include the credential, recipient and code; never log them.
"""
import http.client
import json
import re
from urllib.parse import quote


class SmsDeliveryError(RuntimeError):
    pass


class TwoFactorSmsSender:
    def __init__(self, api_key: str, template: str):
        self._api_key = api_key
        self._template = template

    def send(self, phone: str, code: str, challenge: str) -> None:
        if not re.fullmatch(r"\+91[6-9][0-9]{9}", phone):
            raise SmsDeliveryError("2Factor delivery requires an Indian mobile number.")
        if not re.fullmatch(r"[0-9]{6}", code):
            raise SmsDeliveryError("Invalid SMS code format.")
        connection = None
        try:
            # Fixed trusted host, certificate verification, no redirects or automatic retries.
            # Retries could duplicate delivery/charges after an ambiguous timeout.
            connection = http.client.HTTPSConnection("2factor.in", timeout=10)
            segments = (self._api_key, "SMS", phone[1:], code, self._template)
            path = "/API/V1/" + "/".join(quote(segment, safe="") for segment in segments)
            connection.request("POST", path, body=b"", headers={"Accept": "application/json"})
            response = connection.getresponse()
            body = response.read(16385)
            if response.status != 200 or len(body) > 16384:
                raise ValueError("SMS request rejected")
            payload = json.loads(body)
            if not isinstance(payload, dict) or payload.get("Status") != "Success":
                raise ValueError("SMS request rejected")
            if not isinstance(payload.get("Details"), str) or not payload["Details"].strip():
                raise ValueError("SMS acknowledgement missing")
        except Exception:
            # Do not propagate provider messages, URLs, response bodies or network errors.
            raise SmsDeliveryError("SMS delivery could not be confirmed.") from None
        finally:
            if connection is not None:
                connection.close()
