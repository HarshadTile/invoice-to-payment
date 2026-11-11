"""Automatic invoice sync: schedule from settings, retry after failures, one sync at a time, every
attempt recorded, status / Sync now / readiness endpoints."""
from datetime import datetime, time, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.main import app
from app.models.sync_log import SyncLog
from app.repositories import po_portal_invoice as po, srm_invoice as srm
from app.services import invoice_refresh, sync_status
from app.services.sync_schedule import Schedule, ScheduleError, parse_offset, parse_times
from tests.helpers.suppliers import supplier_headers_for_code
from tests.helpers.users import internal_user_id
from app.core.security import create_access_token

IST = timezone(timedelta(hours=5, minutes=30))
client = TestClient(app)


def _staff(username="sync_admin", role="Admin"):
    scope = "all" if role == "Admin" else "msetuSrm"  # non-admin staff work in one portal
    token = create_access_token(internal_user_id(username, role=role, channel_scope=scope), "internal",
                                {"channelScope": scope})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def clean_status():
    sync_status.reset()
    with SessionLocal() as db:
        db.query(SyncLog).delete()
        db.commit()
    yield
    sync_status.reset()


# ---------- schedule ----------

def test_times_are_parsed_sorted_and_validated():
    assert parse_times(" 14:30, 06:05,14:30 ") == [time(6, 5), time(14, 30)]
    assert parse_times("") == []
    for bad in ("6.30", "24:00", "07:60", "noon"):
        with pytest.raises(ScheduleError):
            parse_times(bad)
    assert parse_offset("+05:30") == IST
    with pytest.raises(ScheduleError):
        parse_offset("IST")


def test_daily_times_pick_the_next_one_in_the_configured_zone():
    schedule = Schedule(times=[time(6, 30), time(14, 30)], interval_minutes=60, zone=IST, retry_minutes=5)
    now = datetime(2026, 11, 10, 10, 0, tzinfo=IST)
    assert schedule.next_scheduled(now) == datetime(2026, 11, 10, 14, 30, tzinfo=IST)
    late = datetime(2026, 11, 10, 15, 0, tzinfo=IST)
    assert schedule.next_scheduled(late) == datetime(2026, 11, 11, 6, 30, tzinfo=IST)  # tomorrow
    assert "Daily at 06:30, 14:30 (UTC+05:30)" == schedule.describe()


def test_interval_schedule_and_start_up_only():
    every_hour = Schedule(times=[], interval_minutes=60, zone=None, retry_minutes=5)
    now = datetime(2026, 11, 10, 8, 0, tzinfo=timezone.utc)
    assert every_hour.next_scheduled(now, last_run=now) == now + timedelta(hours=1)
    assert Schedule(times=[], interval_minutes=0, zone=None, retry_minutes=5).next_scheduled(now) is None


def test_failures_retry_sooner_with_backoff_but_never_after_the_next_run():
    schedule = Schedule(times=[], interval_minutes=60, zone=None, retry_minutes=5)
    now = datetime(2026, 11, 10, 8, 0, tzinfo=timezone.utc)
    assert schedule.next_run(now, now, 1) == now + timedelta(minutes=5)
    assert schedule.next_run(now, now, 2) == now + timedelta(minutes=10)
    assert schedule.next_run(now, now, 3) == now + timedelta(minutes=20)
    assert schedule.next_run(now, now, 9) == now + timedelta(hours=1)  # capped by the scheduled run


def test_schedule_reads_its_settings(monkeypatch):
    monkeypatch.setenv("INVOICE_SYNC_TIMES", "07:00")
    monkeypatch.setenv("INVOICE_SYNC_UTC_OFFSET", "+05:30")
    schedule = Schedule.from_env()
    assert schedule.times == [time(7, 0)] and schedule.stale_after_minutes == 26 * 60
    monkeypatch.setenv("INVOICE_REFRESH_MINUTES", "soon")
    with pytest.raises(ScheduleError, match="INVOICE_REFRESH_MINUTES"):
        Schedule.from_env()


# ---------- the sync itself ----------

def _rows(n):
    return [{"VENDOR_INVOICE_NO": f"INV-{i}"} for i in range(n)]


def test_every_attempt_is_recorded_with_the_reason(monkeypatch):
    monkeypatch.setattr(invoice_refresh.api_snapshot, "save", lambda *a: None)
    monkeypatch.setattr(srm, "refresh_from_api", lambda prepare: _rows(3))

    def expired(prepare):
        try:
            raise OSError("certificate has expired")
        except OSError as cause:
            raise RuntimeError("BigQuery API unreachable (ConnectError)") from cause
    monkeypatch.setattr(po, "refresh_from_api", expired)

    assert invoice_refresh.refresh_all() is True
    status = sync_status.snapshot(include_error=True)
    by_source = {s["source"]: s for s in status["sources"]}
    assert by_source["srm"]["lastSyncOk"] and by_source["srm"]["rows"] == 3
    assert not by_source["po-portal"]["lastSyncOk"]
    assert "certificate has expired" in by_source["po-portal"]["lastError"]
    with SessionLocal() as db:
        logged = {row.channel: row for row in db.query(SyncLog).all()}
    assert logged["Msetu / SRM"].status == "Success" and logged["Msetu / SRM"].records == 3
    assert logged["PO Portal"].status == "Failed" and "certificate has expired" in logged["PO Portal"].msg
    assert sync_status.consecutive_failures() == 1


def test_only_one_sync_runs_at_a_time():
    assert invoice_refresh._sync_lock.acquire(blocking=False)
    try:
        assert invoice_refresh.refresh_all() is False
    finally:
        invoice_refresh._sync_lock.release()


# ---------- endpoints ----------

def _fake_live_status(monkeypatch, *, as_of, ok=True, error=None):
    monkeypatch.setattr("app.api.v1.invoice_sync.use_api", lambda: True)
    sync_status.configure(live=True, schedule="Every 60 minutes")
    for name in ("srm", "po-portal"):
        sync_status.record_loaded(name, 10, as_of, "snapshot")
    if not ok:
        sync_status.record_attempt("po-portal", ok=False, error=error)


def test_staff_see_status_and_only_integration_managers_see_errors(monkeypatch):
    _fake_live_status(monkeypatch, as_of=datetime.now(timezone.utc), ok=False, error="certificate has expired")
    admin = client.get("/api/v1/invoice-sync/status", headers=_staff()).json()
    assert admin["live"] and admin["lastSyncOk"] is False and admin["dataAsOf"]
    assert any(s["lastError"] == "certificate has expired" for s in admin["sources"])
    l1 = client.get("/api/v1/invoice-sync/status", headers=_staff("sync_l1", "Invoice Team L1")).json()
    assert all(s["lastError"] is None for s in l1["sources"])


def test_suppliers_only_learn_how_current_the_data_is(monkeypatch):
    _fake_live_status(monkeypatch, as_of=datetime.now(timezone.utc))
    body = client.get("/api/v1/invoice-sync/status", headers=supplier_headers_for_code("SYNC-V1")).json()
    assert set(body) == {"dataAsOf", "stale"}


def test_sync_now_needs_manage_config_and_live_mode(monkeypatch):
    l1 = client.post("/api/v1/invoice-sync/run", headers=_staff("sync_l1", "Invoice Team L1"))
    assert l1.status_code == 403
    monkeypatch.setattr(invoice_refresh, "request_sync", lambda: "disabled")
    assert client.post("/api/v1/invoice-sync/run", headers=_staff()).status_code == 409
    monkeypatch.setattr(invoice_refresh, "request_sync", lambda: "running")
    assert "already running" in client.post("/api/v1/invoice-sync/run", headers=_staff()).json()["error"]["message"]
    monkeypatch.setattr(invoice_refresh, "request_sync", lambda: "started")
    assert client.post("/api/v1/invoice-sync/run", headers=_staff()).status_code == 202


def test_readiness_reports_starting_ready_and_degraded(monkeypatch):
    monkeypatch.setattr("app.api.v1.invoice_sync.use_api", lambda: True)
    sync_status.configure(live=True, schedule="Every 60 minutes", auto=True)
    starting = client.get("/health/ready")
    assert starting.status_code == 503 and starting.json()["status"] == "starting"

    sync_status.record_loaded("srm", 10, datetime.now(timezone.utc), "bigquery")
    assert client.get("/health/ready").json()["status"] == "ready"

    sync_status.record_loaded("srm", 10, datetime.now(timezone.utc) - timedelta(days=3), "snapshot")
    body = client.get("/health/ready").json()
    assert body["status"] == "degraded" and body["stale"] and "lastError" not in body


def test_the_sync_log_is_staff_only(monkeypatch):
    assert client.get("/api/v1/sync-log", headers=supplier_headers_for_code("SYNC-V1")).status_code == 403
    assert client.get("/api/v1/sync-log", headers=_staff()).status_code == 200


# ---------- INVOICE_AUTO_SYNC: automatic BigQuery calls can be switched off (the default) ----------

import time as _time  # noqa: E402

from app.services.sync_schedule import auto_sync_enabled  # noqa: E402


def test_automatic_sync_is_off_unless_switched_on(monkeypatch):
    monkeypatch.delenv("INVOICE_AUTO_SYNC", raising=False)
    assert auto_sync_enabled() is False
    for value in ("true", "1", "yes", "ON"):
        monkeypatch.setenv("INVOICE_AUTO_SYNC", value)
        assert auto_sync_enabled() is True
    monkeypatch.setenv("INVOICE_AUTO_SYNC", "false")
    assert auto_sync_enabled() is False


def _run_loop(monkeypatch, *, auto, stale_start=True):
    """Starts the real sync loop with BigQuery replaced by a counter; returns (calls, stop)."""
    calls = []
    monkeypatch.setenv("INVOICE_AUTO_SYNC", "true" if auto else "false")
    monkeypatch.setenv("INVOICE_REFRESH_MINUTES", "60")
    monkeypatch.setattr(invoice_refresh, "warm_up", lambda: stale_start)
    monkeypatch.setattr(invoice_refresh, "refresh_all", lambda: calls.append(1) or True)
    monkeypatch.setattr(invoice_refresh, "use_api", lambda: True)
    invoice_refresh.start()

    def stop():
        invoice_refresh.stop()
        invoice_refresh._thread.join(timeout=5)
    return calls, stop


def _wait_until(condition, seconds=3.0):
    deadline = _time.monotonic() + seconds
    while _time.monotonic() < deadline and not condition():
        _time.sleep(0.02)
    return condition()


def test_with_automatic_sync_off_bigquery_is_called_only_for_sync_now(monkeypatch):
    calls, stop = _run_loop(monkeypatch, auto=False)
    try:
        assert _wait_until(lambda: sync_status.snapshot(include_error=False)["schedule"] == invoice_refresh.OFF_DESCRIPTION)
        _time.sleep(0.3)
        assert calls == []  # no start-up sync, no schedule, no retries
        status = sync_status.snapshot(include_error=False)
        assert status["autoSync"] is False and status["nextSyncAt"] is None
        assert invoice_refresh.request_sync() == "started"
        assert _wait_until(lambda: calls == [1])  # Sync now still works
    finally:
        stop()


def test_with_automatic_sync_on_a_stale_start_syncs_at_once(monkeypatch):
    calls, stop = _run_loop(monkeypatch, auto=True)
    try:
        assert _wait_until(lambda: calls == [1])
        assert _wait_until(lambda: sync_status.snapshot(include_error=False)["nextSyncAt"] is not None)
        assert sync_status.snapshot(include_error=False)["autoSync"] is True
    finally:
        stop()


def test_old_data_is_not_an_alarm_while_automatic_sync_is_off(monkeypatch):
    monkeypatch.setattr("app.api.v1.invoice_sync.use_api", lambda: True)
    sync_status.configure(live=True, schedule=invoice_refresh.OFF_DESCRIPTION, auto=False)
    sync_status.record_loaded("srm", 10, datetime.now(timezone.utc) - timedelta(days=5), "snapshot")
    body = client.get("/health/ready").json()
    assert body["status"] == "ready" and body["stale"] is False and body["autoSync"] is False
    assert body["dataAgeMinutes"] > 5 * 24 * 60 - 5  # the age is still reported
