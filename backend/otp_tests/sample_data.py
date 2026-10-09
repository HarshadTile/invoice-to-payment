"""Generated test-only phone values. Never send messages to these values."""
import hashlib


def make_mobile(label: str, country_code: str = "+91") -> str:
    # Stable per label so assertions are repeatable, without fixed full numbers.
    digest = hashlib.sha256(label.encode()).digest()
    digits = "".join(str(byte % 10) for byte in digest[:9])
    return country_code + "9" + digits
