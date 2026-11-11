"""When the invoice sync runs: the schedule comes from settings, so the team that owns the BigQuery
tables can change it without a code change.

Two ways to set it (backend/.env or the server's environment):
  INVOICE_SYNC_TIMES=06:30,14:30   fixed times every day (e.g. shortly after the warehouse loads);
                                   when set, the interval below is not used
  INVOICE_REFRESH_MINUTES=60       otherwise: every N minutes (0 = only once, at start-up)

Times are in the server's local time zone unless INVOICE_SYNC_UTC_OFFSET (e.g. +05:30) says
otherwise, so "06:30" means 06:30 IST even on a server whose clock runs in UTC.

After a failed sync it retries sooner than the next scheduled run: INVOICE_SYNC_RETRY_MINUTES
(default 5) after the first failure, then doubling (5, 10, 20, ...), never later than the next
scheduled run.
"""
import os
import re
from datetime import datetime, time, timedelta, timezone, tzinfo

_TIME = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")
_OFFSET = re.compile(r"^([+-])(\d{1,2}):?(\d{2})$")


def auto_sync_enabled() -> bool:
    """INVOICE_AUTO_SYNC=true lets the backend call BigQuery by itself (start-up sync, schedule,
    retries). Off by default: until the GCP team approves automatic use of their API, data only
    changes when an administrator presses "Sync now" (or, on a server with no saved snapshot yet,
    once, to get any data at all)."""
    return os.getenv("INVOICE_AUTO_SYNC", "false").strip().lower() in ("1", "true", "yes", "on")


class ScheduleError(ValueError):
    """A sync setting that can't be understood; the message names the setting."""


def parse_times(text: str | None) -> list[time]:
    """'06:30, 14:30' -> [06:30, 14:30], sorted and without duplicates. Empty -> []."""
    times = set()
    for part in (text or "").split(","):
        part = part.strip()
        if not part:
            continue
        match = _TIME.match(part)
        if not match:
            raise ScheduleError(f"INVOICE_SYNC_TIMES: '{part}' is not a time like 06:30")
        times.add(time(int(match.group(1)), int(match.group(2))))
    return sorted(times)


def parse_offset(text: str | None) -> tzinfo | None:
    """'+05:30' -> UTC+05:30. Empty -> None (the server's own time zone)."""
    text = (text or "").strip()
    if not text:
        return None
    match = _OFFSET.match(text)
    if not match:
        raise ScheduleError(f"INVOICE_SYNC_UTC_OFFSET: '{text}' is not an offset like +05:30")
    sign = -1 if match.group(1) == "-" else 1
    hours, minutes = int(match.group(2)), int(match.group(3))
    if hours > 14 or minutes > 59:
        raise ScheduleError(f"INVOICE_SYNC_UTC_OFFSET: '{text}' is out of range")
    return timezone(sign * timedelta(hours=hours, minutes=minutes))


def _number(name: str, default: float) -> float:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        raise ScheduleError(f"{name}: '{raw}' is not a number")
    if value < 0:
        raise ScheduleError(f"{name}: must not be negative")
    return value


class Schedule:
    def __init__(self, times: list[time], interval_minutes: float, zone: tzinfo | None,
                 retry_minutes: float, stale_after_minutes: float | None = None):
        self.times = times
        self.interval_minutes = interval_minutes
        self.zone = zone
        self.retry_minutes = max(1.0, retry_minutes)
        if stale_after_minutes is None:
            # Old enough to be a problem: a missed daily run, or three missed interval runs.
            stale_after_minutes = 26 * 60 if times else max(180.0, 3 * interval_minutes)
        self.stale_after_minutes = stale_after_minutes

    @classmethod
    def from_env(cls) -> "Schedule":
        stale = os.getenv("INVOICE_STALE_AFTER_MINUTES", "").strip()
        return cls(
            times=parse_times(os.getenv("INVOICE_SYNC_TIMES")),
            interval_minutes=_number("INVOICE_REFRESH_MINUTES", 60),
            zone=parse_offset(os.getenv("INVOICE_SYNC_UTC_OFFSET")),
            retry_minutes=_number("INVOICE_SYNC_RETRY_MINUTES", 5),
            stale_after_minutes=_number("INVOICE_STALE_AFTER_MINUTES", 0) if stale else None,
        )

    def describe(self) -> str:
        if self.times:
            zone = self._local(datetime.now(timezone.utc)).strftime("UTC%z")
            zone = f"{zone[:-2]}:{zone[-2:]}"
            return "Daily at " + ", ".join(t.strftime("%H:%M") for t in self.times) + f" ({zone})"
        if self.interval_minutes > 0:
            minutes = self.interval_minutes
            return f"Every {int(minutes)} minutes" if minutes == int(minutes) else f"Every {minutes} minutes"
        return "Only at start-up (no repeat schedule)"

    def _local(self, moment: datetime) -> datetime:
        return moment.astimezone(self.zone) if self.zone else moment.astimezone()

    def next_scheduled(self, now: datetime, last_run: datetime | None = None) -> datetime | None:
        """The next planned run after `now` (aware datetimes), or None when nothing repeats."""
        if self.times:
            local_now = self._local(now)
            for day in range(0, 2):
                date = (local_now + timedelta(days=day)).date()
                for at in self.times:
                    candidate = datetime.combine(date, at, tzinfo=local_now.tzinfo)
                    if candidate > local_now:
                        return candidate.astimezone(timezone.utc)
            return None  # unreachable with at least one time
        if self.interval_minutes > 0:
            base = last_run or now
            planned = base + timedelta(minutes=self.interval_minutes)
            return planned if planned > now else now
        return None

    def retry_delay(self, consecutive_failures: int) -> timedelta:
        """5, 10, 20, 40 ... minutes (with the default retry setting), capped at 6 hours."""
        steps = max(0, consecutive_failures - 1)
        return timedelta(minutes=min(self.retry_minutes * (2 ** min(steps, 10)), 6 * 60))

    def next_run(self, now: datetime, last_run: datetime | None, consecutive_failures: int) -> datetime | None:
        scheduled = self.next_scheduled(now, last_run)
        if consecutive_failures <= 0:
            return scheduled
        retry = now + self.retry_delay(consecutive_failures)
        return min(retry, scheduled) if scheduled else retry

    def local_display(self, moment: datetime) -> str:
        """'10 Nov 2026, 02:30 PM' in the schedule's time zone (the Sync Log's format)."""
        return self._local(moment).strftime("%d %b %Y, %I:%M %p")
