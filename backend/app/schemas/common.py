from datetime import datetime, timezone
from typing import Annotated

from pydantic import PlainSerializer


def _as_utc_iso(value: datetime) -> str:
    # The database stores naive UTC datetimes (datetime.utcnow). Sent as-is, a browser reads
    # "2026-10-06T10:52:00" as *local* time and shows the wrong hour; the trailing Z says UTC,
    # so the frontend converts it to the viewer's own time zone.
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


UTCDateTime = Annotated[datetime, PlainSerializer(_as_utc_iso, return_type=str, when_used="json")]
