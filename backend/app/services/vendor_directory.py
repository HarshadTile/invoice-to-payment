"""Vendors (supplier name, PAN, vendor codes) as they appear in the invoice data.

The invoice Excel is the only source of truth for which PAN owns which vendor codes; this
module reads it (read-only) so the Suppliers screen can search it and validate against it.
"""
import re

from app.repositories.gcp_invoice import get_all_cached_invoices

PAN_REGEX = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")

# Rebuilt only when the cached invoice list object changes (it is cached once in memory).
_cache = {"rows": None, "directory": {}}


def _clean(value) -> str:
    return str(value or "").strip()


def _directory() -> dict[str, dict]:
    rows = get_all_cached_invoices()
    if _cache["rows"] is rows:
        return _cache["directory"]
    directory: dict[str, dict] = {}
    for row in rows:
        pan = _clean(row.get("PAN_NO")).upper()
        code = _clean(row.get("SUPPLIER"))
        if not code or not PAN_REGEX.match(pan):
            continue
        name = _clean(row.get("SUPPLIER_NAME"))
        entry = directory.setdefault(pan, {"pan": pan, "name": name, "names": set(), "codes": {}})
        if name:
            entry["names"].add(name.lower())
            entry["name"] = entry["name"] or name
        entry["codes"].setdefault(code.lower(), code)
    _cache["rows"], _cache["directory"] = rows, directory
    return directory


def search_vendors(query: str, limit: int = 50) -> list[dict]:
    """Vendors whose name, PAN or any vendor code contains `query` (case-insensitive, partial),
    grouped by PAN."""
    needle = _clean(query).lower()
    if not needle:
        return []
    matches = []
    for entry in _directory().values():
        haystack = [entry["pan"].lower(), *entry["names"], *entry["codes"]]
        if any(needle in text for text in haystack):
            matches.append({
                "pan": entry["pan"],
                "name": entry["name"],
                "vendorCodes": sorted(entry["codes"].values()),
            })
    matches.sort(key=lambda m: (m["name"].lower(), m["pan"]))
    return matches[:limit]


def get_vendor_by_pan(pan: str) -> dict | None:
    return _directory().get(_clean(pan).upper())
