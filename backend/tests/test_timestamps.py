from datetime import datetime, timedelta, timezone

from pydantic import BaseModel

from app.schemas.common import UTCDateTime


class Stamped(BaseModel):
    at: UTCDateTime
    maybe: UTCDateTime | None = None


def test_naive_database_datetimes_are_sent_as_utc():
    # The database holds naive UTC; without the Z a browser shows the UTC clock time as local.
    assert Stamped(at=datetime(2026, 10, 6, 10, 52)).model_dump_json() == '{"at":"2026-10-06T10:52:00Z","maybe":null}'


def test_aware_datetimes_are_converted_to_utc():
    ist = timezone(timedelta(hours=5, minutes=30))
    assert Stamped(at=datetime(2026, 10, 6, 16, 22, tzinfo=ist)).model_dump_json().startswith('{"at":"2026-10-06T10:52:00Z"')
