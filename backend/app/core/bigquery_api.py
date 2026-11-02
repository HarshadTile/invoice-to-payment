"""Read-only client for the internal BigQuery query API, the live source behind the invoice files.

Only fixed queries built from code constants are sent; nothing from a request ever reaches the SQL.
"""
import logging
import os
import re
import ssl
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import truststore
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env")

logger = logging.getLogger("app.bigquery")

API_URL = os.getenv("BIGQUERY_API_URL", "https://bigqueryapi.m-devsecops.com").rstrip("/")
# A whole table in one response fails server-side (HTTP 500); 10,000 rows is ~12 MB / ~10 s.
PAGE_SIZE = int(os.getenv("BIGQUERY_PAGE_SIZE", "10000"))
TIMEOUT = float(os.getenv("BIGQUERY_TIMEOUT", "120"))
WORKERS = int(os.getenv("BIGQUERY_WORKERS", "4"))

_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class InvoiceSourceError(RuntimeError):
    """The live invoice source could not be read. Messages never contain the token."""


def use_api() -> bool:
    """INVOICE_SOURCE=api reads BigQuery; anything else keeps the files in backend/data."""
    return os.getenv("INVOICE_SOURCE", "file").strip().lower() == "api"


def _token() -> str:
    token = (os.getenv("BIGQUERY_API_TOKEN") or "").strip()
    if not token:
        raise InvoiceSourceError("BIGQUERY_API_TOKEN is not set in backend/.env")
    return token


def make_client() -> httpx.Client:
    # The corporate network re-signs HTTPS with its own root certificate, which Windows trusts but
    # Python's bundled list does not; truststore makes httpx use the OS store instead.
    tls = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    return httpx.Client(
        base_url=API_URL, timeout=TIMEOUT,
        headers={"Authorization": f"Bearer {_token()}"},
        transport=httpx.HTTPTransport(verify=tls, retries=2),  # retries cover dropped connections only
    )


def _redact(text: str) -> str:
    token = (os.getenv("BIGQUERY_API_TOKEN") or "").strip()
    return text.replace(token, "***") if token else text


def run_sql(sql: str, *, client: httpx.Client | None = None) -> list[dict]:
    """POST one query to /query/sql and return its rows ({"data": [...], "row_count": n})."""
    owns_client = client is None
    client = client or make_client()
    try:
        response = client.post("/query/sql", json={"sql": sql})
    except httpx.HTTPError as exc:
        raise InvoiceSourceError(f"BigQuery API unreachable ({type(exc).__name__})") from exc
    finally:
        if owns_client:
            client.close()
    if response.status_code != 200:
        try:
            detail = response.json().get("detail")
        except ValueError:
            detail = response.text
        raise InvoiceSourceError(_redact(f"BigQuery API returned HTTP {response.status_code}: {str(detail)[:200]}"))
    payload = response.json()
    rows = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        raise InvoiceSourceError("BigQuery API response has no 'data' list")
    return rows


def fetch_columns(table: str, columns: tuple[str, ...], *, client: httpx.Client | None = None) -> list[dict]:
    """Every row of `table`, limited to `columns`, fetched in parallel pages.

    No column set is unique in these tables, so pages are ordered by every selected column: that gives
    one fixed order across requests, and rows that tie are identical, so neither is lost or repeated.
    """
    for name in (table, *columns):
        if not _IDENTIFIER.match(name):
            raise ValueError(f"Unsafe SQL identifier: {name!r}")
    column_list = ", ".join(columns)
    owns_client = client is None
    client = client or make_client()
    try:
        total = int(run_sql(f"SELECT COUNT(*) AS n FROM {table}", client=client)[0]["n"])
        queries = [f"SELECT {column_list} FROM {table} ORDER BY {column_list} LIMIT {PAGE_SIZE} OFFSET {offset}"
                   for offset in range(0, total, PAGE_SIZE)]
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            pages = list(pool.map(lambda sql: run_sql(sql, client=client), queries))
    finally:
        if owns_client:
            client.close()
    rows = [row for page in pages for row in page]
    # A refresh of the table between the count and the last page would mix two versions of it.
    if len(rows) != total:
        raise InvoiceSourceError(f"{table}: expected {total} rows, received {len(rows)}; the table may be refreshing")
    logger.info("Loaded %s rows from %s in %s pages", total, table, len(queries))
    return rows
