"""What the invoice sync is doing: per source, how old the data is, how the last attempt went and
when the next one is due. Kept in memory for the status / health endpoints, and every attempt is
also written to the sync_log table (shown on each channel's History tab).
"""
import logging
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone

logger = logging.getLogger("app.bigquery")

LABELS = {"srm": "Msetu / SRM", "po-portal": "PO Portal"}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(moment: datetime | None) -> str | None:
    return moment.astimezone(timezone.utc).isoformat(timespec="seconds") if moment else None


@dataclass
class SourceStatus:
    name: str
    rows: int = 0
    data_as_of: datetime | None = None  # when this data was read from BigQuery / the file
    loaded_from: str = "none"           # none | bigquery | snapshot | file
    last_attempt_at: datetime | None = None
    last_success_at: datetime | None = None
    last_error: str | None = None
    consecutive_failures: int = 0

    def to_dict(self, include_error: bool) -> dict:
        return {
            "source": self.name, "label": LABELS.get(self.name, self.name), "rows": self.rows,
            "dataAsOf": _iso(self.data_as_of), "loadedFrom": self.loaded_from,
            "lastAttemptAt": _iso(self.last_attempt_at), "lastSuccessAt": _iso(self.last_success_at),
            "lastSyncOk": self.consecutive_failures == 0,
            "consecutiveFailures": self.consecutive_failures,
            "lastError": self.last_error if include_error else None,
        }


@dataclass
class _State:
    sources: dict = field(default_factory=dict)
    running: bool = False
    next_sync_at: datetime | None = None
    schedule: str = ""
    live: bool = False  # INVOICE_SOURCE=api


_state = _State()
_lock = threading.Lock()


def _source(name: str) -> SourceStatus:
    if name not in _state.sources:
        _state.sources[name] = SourceStatus(name)
    return _state.sources[name]


def reset() -> None:
    """For tests."""
    global _state
    with _lock:
        _state = _State()


def configure(*, live: bool, schedule: str) -> None:
    with _lock:
        _state.live, _state.schedule = live, schedule


def set_running(running: bool) -> None:
    with _lock:
        _state.running = running


def set_next_sync(moment: datetime | None) -> None:
    with _lock:
        _state.next_sync_at = moment


def record_loaded(name: str, rows: int, data_as_of: datetime | None, loaded_from: str) -> None:
    """Data now in memory (from the start-up snapshot, a file, or a sync)."""
    with _lock:
        source = _source(name)
        source.rows, source.data_as_of, source.loaded_from = rows, data_as_of, loaded_from


def record_attempt(name: str, *, ok: bool, rows: int = 0, error: str | None = None,
                   display_time: str | None = None, started: datetime | None = None) -> None:
    now = utcnow()
    with _lock:
        source = _source(name)
        source.last_attempt_at = now
        if ok:
            source.last_success_at, source.last_error, source.consecutive_failures = now, None, 0
            source.rows, source.data_as_of, source.loaded_from = rows, started or now, "bigquery"
        else:
            source.last_error, source.consecutive_failures = error, source.consecutive_failures + 1
    _write_sync_log(name, ok, rows, error, display_time or now.strftime("%d %b %Y, %I:%M %p UTC"),
                    duration=(now - started).total_seconds() if started else None)


def _write_sync_log(name, ok, rows, error, display_time, duration):
    """Best effort: a database problem must never stop the sync itself."""
    from app.core.database import SessionLocal
    from app.models.sync_log import SyncLog
    took = f" in {duration:.0f} s" if duration is not None else ""
    message = f"{rows} invoices synced from BigQuery{took}" if ok else f"Sync failed: {error or 'unknown error'}"
    try:
        with SessionLocal() as db:
            db.add(SyncLog(channel=LABELS.get(name, name), time=display_time, status="Success" if ok else "Failed",
                           records=rows if ok else 0, msg=message[:1000]))
            db.commit()
    except Exception:
        logger.warning("Could not write the %s sync to the sync log", name, exc_info=True)


def consecutive_failures() -> int:
    with _lock:
        return max((s.consecutive_failures for s in _state.sources.values()), default=0)


def is_running() -> bool:
    with _lock:
        return _state.running


def oldest_data_as_of() -> datetime | None:
    with _lock:
        stamps = [s.data_as_of for s in _state.sources.values() if s.data_as_of]
    return min(stamps) if stamps else None


def snapshot(*, include_error: bool) -> dict:
    with _lock:
        sources = [s.to_dict(include_error) for s in _state.sources.values()]
        return {"live": _state.live, "schedule": _state.schedule, "running": _state.running,
                "nextSyncAt": _iso(_state.next_sync_at), "sources": sources}
