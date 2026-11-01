"""In-memory rate limit used by the public supplier endpoints."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core import rate_limit as rl


@pytest.fixture(autouse=True)
def fresh_limits():
    rl.reset_rate_limits()
    yield
    rl.reset_rate_limits()


def test_allows_up_to_the_limit_then_refuses():
    for _ in range(5):
        rl.rate_limit("test", "a", limit=5, window_seconds=60)
    with pytest.raises(HTTPException) as error:
        rl.rate_limit("test", "a", limit=5, window_seconds=60)
    assert error.value.status_code == 429
    assert error.value.detail == "Too many requests. Please try again a little later."


def test_keys_and_buckets_are_counted_separately():
    for _ in range(2):
        rl.rate_limit("test", "a", limit=2, window_seconds=60)
    rl.rate_limit("test", "b", limit=2, window_seconds=60)
    rl.rate_limit("other", "a", limit=2, window_seconds=60)


def test_old_hits_leave_the_window(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(rl.time, "monotonic", lambda: clock[0])
    rl.rate_limit("test", "a", limit=1, window_seconds=60)
    clock[0] += 61
    rl.rate_limit("test", "a", limit=1, window_seconds=60)


def test_client_ip_prefers_the_first_forwarded_address():
    request = SimpleNamespace(headers={"x-forwarded-for": "10.0.0.1, 10.0.0.2"}, client=SimpleNamespace(host="127.0.0.1"))
    assert rl.client_ip(request) == "10.0.0.1"
    assert rl.client_ip(SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))) == "127.0.0.1"
    assert rl.client_ip(SimpleNamespace(headers={}, client=None)) == "unknown"
