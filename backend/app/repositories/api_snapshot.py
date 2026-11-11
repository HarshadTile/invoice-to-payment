"""On-disk snapshot of the invoices loaded from the BigQuery API, with their prepared index.

Loading from BigQuery and indexing takes 1-2 minutes; a snapshot loads in seconds, so a restart serves
the last data at once while fresh data is fetched in the background (app/services/invoice_refresh.py).
JSON only, never pickle. A snapshot is used only if it was written by the same code that builds the
rows and their index (a fingerprint of those source files), so a code change can't serve a stale index.
"""
import gzip
import hashlib
import json
import logging
import os
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

from app.repositories.workbook_cache import CACHE_DIR

logger = logging.getLogger("app.bigquery")
SNAPSHOT_VERSION = 1
_APP = Path(__file__).resolve().parents[1]
# The code that decides what a cached row and its index contain.
_SOURCES = ("repositories/srm_invoice.py", "repositories/po_portal_invoice.py", "services/invoice_index.py",
            "services/invoice_service.py", "services/po_portal_invoice_service.py", "schemas/invoice.py")
_code_version = None
# When each loaded snapshot was saved, i.e. when its data came from BigQuery (for "data as of").
last_saved_at: dict[str, datetime] = {}


def code_version() -> str:
    global _code_version
    if _code_version is None:
        digest = hashlib.sha256(str(SNAPSHOT_VERSION).encode())
        for name in _SOURCES:
            digest.update((_APP / name).read_bytes())
        _code_version = digest.hexdigest()
    return _code_version


def path_for(name: str) -> Path:
    return CACHE_DIR / f"bigquery-{name}.json.gz"


def load(name: str) -> list[dict] | None:
    """The saved rows, each with its index restored, or None when there is no usable snapshot."""
    from app.services.invoice_index import INDEX_KEY, index_from_json
    try:
        with gzip.open(path_for(name), "rt", encoding="utf-8") as stream:
            snapshot = json.load(stream)
        if snapshot.get("code") != code_version() or len(snapshot["rows"]) != len(snapshot["index"]):
            return None
        rows = snapshot["rows"]
        for row, index in zip(rows, snapshot["index"]):
            row[INDEX_KEY] = index_from_json(index)
        try:
            last_saved_at[name] = datetime.fromisoformat(snapshot["saved_at"])
        except (KeyError, TypeError, ValueError):
            last_saved_at.pop(name, None)
        logger.info("Loaded %s %s invoices from the snapshot of %s", len(rows), name, snapshot.get("saved_at"))
        return rows
    except FileNotFoundError:
        return None
    except (OSError, ValueError, TypeError, KeyError, AttributeError, EOFError):
        logger.warning("Ignoring an unreadable %s invoice snapshot", name)
        return None


def _remove_abandoned_temp_files(name: str, older_than_seconds: float = 900) -> None:
    """A process stopped mid-write leaves its temp file. Old ones are removed; a recent one may be another
    running server writing right now (several servers can share this folder), so it is left alone."""
    cutoff = time.time() - older_than_seconds
    for stale in CACHE_DIR.glob(f"bigquery-{name}-*.tmp"):
        try:
            if stale.stat().st_mtime < cutoff:
                stale.unlink()
        except OSError:
            pass


def save(name: str, rows: list[dict]) -> None:
    """Writes the rows and their index atomically. Every row must already be indexed. Failures are logged:
    the snapshot only speeds up the next start."""
    from app.services.invoice_index import INDEX_KEY, index_to_json, index_of
    _remove_abandoned_temp_files(name)
    temp_path = None
    try:
        payload = {
            "code": code_version(), "saved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "rows": [{key: value for key, value in row.items() if key != INDEX_KEY} for row in rows],
            "index": [index_to_json(index_of(row)) for row in rows],
        }
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        handle, filename = tempfile.mkstemp(prefix=f"bigquery-{name}-", suffix=".tmp", dir=CACHE_DIR)
        temp_path = Path(filename)
        os.close(handle)
        with gzip.open(temp_path, "wt", encoding="utf-8", compresslevel=1) as stream:
            json.dump(payload, stream, separators=(",", ":"), ensure_ascii=False)
        os.replace(temp_path, path_for(name))
        temp_path = None
    except (OSError, ValueError, TypeError):
        logger.warning("Could not write the %s invoice snapshot", name, exc_info=True)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
