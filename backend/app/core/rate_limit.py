"""A small in-memory rate limit for the public supplier endpoints (access requests, forgot
password), so one address can't flood the team or a mailbox. Per process; enough for a single
backend instance."""
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request

_hits: dict[str, deque] = defaultdict(deque)
_lock = Lock()


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(bucket: str, key: str, limit: int, window_seconds: int) -> None:
    """Allow `limit` calls per `window_seconds` for (bucket, key); raise 429 beyond that."""
    now = time.monotonic()
    with _lock:
        hits = _hits[f"{bucket}:{key}"]
        while hits and now - hits[0] > window_seconds:
            hits.popleft()
        if len(hits) >= limit:
            raise HTTPException(status_code=429, detail="Too many requests. Please try again a little later.")
        hits.append(now)


def reset_rate_limits() -> None:
    """For tests."""
    with _lock:
        _hits.clear()
