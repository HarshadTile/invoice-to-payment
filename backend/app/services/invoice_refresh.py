"""Automatic invoice sync: keeps the BigQuery invoices loaded, indexed and fresh, without making
anyone wait.

At start: load each source (from the on-disk snapshot when there is one, in seconds), index it, and
save a snapshot if it came straight from BigQuery. Then, in the background:
  * if the start used a snapshot, sync once straight away;
  * after that, sync on the schedule from settings (app/services/sync_schedule.py): fixed daily
    times or every N minutes;
  * after a failure, retry sooner (5, 10, 20 ... minutes) until it works again;
  * "Sync now" (Settings > Integrations) wakes the loop for an immediate run.
With INVOICE_AUTO_SYNC off (the default) none of the automatic steps run: the saved snapshot is
served as it is and BigQuery is called only for "Sync now" (or once, when there is no snapshot at
all, since there would be nothing to show).
Fresh data is swapped in only once it is fully indexed, so users keep seeing the previous data
until then, and keep seeing it if the sync fails. Only one sync runs at a time. Every attempt is
recorded (app/services/sync_status.py).
"""
import logging
from datetime import datetime, timezone
from threading import Event, Lock, Thread

from app.core.bigquery_api import use_api
from app.repositories import api_snapshot, po_portal_invoice, srm_invoice
from app.services import sync_status
from app.services.invoice_index import index_of
from app.services.sync_schedule import Schedule, auto_sync_enabled

logger = logging.getLogger("app.bigquery")
SOURCES = ((srm_invoice, srm_invoice._load_excel_data), (po_portal_invoice, po_portal_invoice.get_all_cached_invoices))
_stop = Event()
_wake = Event()
_sync_lock = Lock()
_thread: Thread | None = None


def _index_all(rows):
    for row in rows:
        index_of(row)


def _schedule() -> Schedule:
    return Schedule.from_env()


def _error_text(exc: Exception) -> str:
    """A short, token-free reason, including the underlying cause (e.g. an expired certificate)."""
    text = str(exc) or type(exc).__name__
    cause = exc.__cause__
    if cause is not None and str(cause) and str(cause) not in text:
        text = f"{text}: {cause}"
    return text.strip("() '\"")[:300]


def warm_up() -> bool:
    """Loads and indexes every source. True when any of them came from a snapshot (so may be old)."""
    stale = False
    for repository, load in SOURCES:
        name = repository.SNAPSHOT_NAME
        try:
            rows = load()
            _index_all(rows)
            if repository.loaded_from_snapshot:
                stale = True
                sync_status.record_loaded(name, len(rows), api_snapshot.last_saved_at.get(name), "snapshot")
            else:
                api_snapshot.save(name, rows)
                sync_status.record_loaded(name, len(rows), datetime.now(timezone.utc), "bigquery")
        except Exception:  # a failed warm-up is retried by the first request that needs the data
            logger.exception("Invoice warm-up failed for %s", name)
    return stale


def refresh_all() -> bool:
    """Fresh data from BigQuery for every source. False when another sync is already running."""
    if not _sync_lock.acquire(blocking=False):
        logger.info("Invoice sync already running; skipping this request")
        return False
    schedule = _schedule()
    sync_status.set_running(True)
    try:
        for repository, _ in SOURCES:
            name = repository.SNAPSHOT_NAME
            started = datetime.now(timezone.utc)
            try:
                rows = repository.refresh_from_api(prepare=_index_all)
                api_snapshot.save(name, rows)
                sync_status.record_attempt(name, ok=True, rows=len(rows), started=started,
                                           display_time=schedule.local_display(started))
                logger.info("Refreshed %s %s invoices from BigQuery", len(rows), name)
            except Exception as exc:  # keep serving the data already loaded
                logger.error("Invoice refresh failed for %s; keeping the loaded data: %s", name, _error_text(exc))
                logger.debug("Invoice refresh failure detail", exc_info=True)
                sync_status.record_attempt(name, ok=False, error=_error_text(exc), started=started,
                                           display_time=schedule.local_display(started))
    finally:
        sync_status.set_running(False)
        _sync_lock.release()
    return True


OFF_DESCRIPTION = "Automatic sync is off; data is updated only with Sync now"


def _run():
    auto = auto_sync_enabled()
    schedule = None
    if auto:
        try:
            schedule = _schedule()
        except ValueError as exc:
            logger.error("Invoice sync schedule is invalid, so only the start-up sync runs: %s", exc)
    description = (schedule.describe() if schedule else "Invalid schedule") if auto else OFF_DESCRIPTION
    sync_status.configure(live=True, schedule=description, auto=auto)
    if not auto:
        logger.info("Automatic invoice sync is off (INVOICE_AUTO_SYNC); BigQuery is called only for Sync now")
    last_run = None
    if warm_up() and auto:
        last_run = datetime.now(timezone.utc)
        refresh_all()
    while not _stop.is_set():
        now = datetime.now(timezone.utc)
        # No schedule and no retries while automatic sync is off: only Sync now wakes the loop.
        planned = schedule.next_run(now, last_run, sync_status.consecutive_failures()) if schedule else None
        sync_status.set_next_sync(planned)
        woken = _wake.wait((planned - now).total_seconds() if planned else None)
        if _stop.is_set():
            break
        if woken:
            _wake.clear()
        if not woken and planned is None:
            continue
        last_run = datetime.now(timezone.utc)
        refresh_all()
    sync_status.set_next_sync(None)


def request_sync() -> str:
    """'started', 'running' (one is already in progress) or 'disabled' (not reading BigQuery)."""
    if not use_api() or _thread is None or not _thread.is_alive():
        return "disabled"
    if sync_status.is_running():
        return "running"
    _wake.set()
    return "started"


def start() -> None:
    global _thread
    _stop.clear()
    _wake.clear()
    _thread = Thread(target=_run, name="invoice-refresh", daemon=True)
    _thread.start()


def stop() -> None:
    _stop.set()
    _wake.set()
