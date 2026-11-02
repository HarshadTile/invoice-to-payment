"""Keeps the BigQuery invoices loaded, indexed and fresh, without making anyone wait.

At start: load each source (from the on-disk snapshot when there is one, in seconds), index it, and save
a snapshot if it came from BigQuery. Then, in the background, fetch fresh data from BigQuery, index it and
swap it in, once straight away if the start used a snapshot, and every INVOICE_REFRESH_MINUTES after that.
"""
import logging
import os
from threading import Event, Thread

from app.repositories import api_snapshot, po_portal_invoice, srm_invoice
from app.services.invoice_index import index_of

logger = logging.getLogger("app.bigquery")
REFRESH_MINUTES = float(os.getenv("INVOICE_REFRESH_MINUTES", "60"))
SOURCES = ((srm_invoice, srm_invoice._load_excel_data), (po_portal_invoice, po_portal_invoice.get_all_cached_invoices))
_stop = Event()


def _index_all(rows):
    for row in rows:
        index_of(row)


def warm_up() -> bool:
    """Loads and indexes every source. True when any of them came from a snapshot (so may be old)."""
    stale = False
    for repository, load in SOURCES:
        try:
            rows = load()
            _index_all(rows)
            if repository.loaded_from_snapshot:
                stale = True
            else:
                api_snapshot.save(repository.SNAPSHOT_NAME, rows)
        except Exception:  # a failed warm-up is retried by the first request that needs the data
            logger.exception("Invoice warm-up failed for %s", repository.SNAPSHOT_NAME)
    return stale


def refresh_all() -> None:
    """Fresh data from BigQuery for every source, swapped in only once it is fully indexed."""
    for repository, _ in SOURCES:
        try:
            rows = repository.refresh_from_api(prepare=_index_all)
            api_snapshot.save(repository.SNAPSHOT_NAME, rows)
            logger.info("Refreshed %s %s invoices from BigQuery", len(rows), repository.SNAPSHOT_NAME)
        except Exception:  # keep serving the data already loaded
            logger.exception("Invoice refresh failed for %s; keeping the loaded data", repository.SNAPSHOT_NAME)


def _run():
    if warm_up():
        refresh_all()
    while REFRESH_MINUTES > 0 and not _stop.wait(REFRESH_MINUTES * 60):
        refresh_all()


def start() -> None:
    _stop.clear()
    Thread(target=_run, name="invoice-refresh", daemon=True).start()


def stop() -> None:
    _stop.set()
