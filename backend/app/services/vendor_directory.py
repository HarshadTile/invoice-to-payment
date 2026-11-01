"""Vendors (supplier name, PAN, vendor codes) as they appear in the invoice data.

The SRM workbook and PO Portal CSV supply PAN/vendor ownership. This module reads
both sources so the Suppliers screen can search and validate existing vendor codes.
"""
import re
from itertools import chain

from app.repositories.srm_invoice import get_all_cached_invoices
from app.repositories.po_portal_invoice import get_all_cached_invoices as get_po_invoices

PAN_REGEX = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")

# Rebuilt only when the cached invoice list object changes (it is cached once in memory).
_cache = {"rows": None, "po_rows": None, "directory": {}, "codes": {}}


def _clean(value) -> str:
    return str(value or "").strip()


def _build():
    rows = get_all_cached_invoices()
    po_rows = get_po_invoices()
    if _cache["rows"] is rows and _cache.get("po_rows") is po_rows:
        return
    directory: dict[str, dict] = {}
    by_code: dict[str, dict] = {}
    for channel, source in (("msetuSrm", rows), ("poPortal", po_rows)):
        for row in source:
            code = _clean(row.get("SUPPLIER"))
            if not code:
                continue
            pan = _clean(row.get("PAN_NO")).upper()
            pan = pan if PAN_REGEX.match(pan) else ""
            name = _clean(row.get("SUPPLIER_NAME"))
            known = by_code.setdefault(code.lower(), {"code": code, "name": name, "pan": pan, "channels": set()})
            known["channels"].add(channel)
            known["name"] = known["name"] or name
            known["pan"] = known["pan"] or pan
            if not pan:
                continue
            entry = directory.setdefault(pan, {"pan": pan, "name": name, "names": set(), "codes": {}})
            if name:
                entry["names"].add(name.lower())
                entry["name"] = entry["name"] or name
            entry["codes"].setdefault(code.lower(), code)
    _cache["rows"], _cache["po_rows"] = rows, po_rows
    _cache["directory"], _cache["codes"] = directory, by_code


def _directory() -> dict[str, dict]:
    _build()
    return _cache["directory"]


def get_vendor_code(code: str) -> dict | None:
    """One vendor code as the invoice data knows it: {code, name, pan ('' when blank), channels},
    whether or not the vendor has a PAN."""
    _build()
    return _cache["codes"].get(_clean(code).lower())


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
    # Vendors with no PAN in the data are listed one vendor code at a time.
    for known in _cache["codes"].values():
        if not known["pan"] and (needle in known["code"].lower() or needle in known["name"].lower()):
            matches.append({"pan": "", "name": known["name"], "vendorCodes": [known["code"]]})
    matches.sort(key=lambda m: (m["name"].lower(), m["pan"]))
    return matches[:limit]


def get_vendor_by_pan(pan: str) -> dict | None:
    return _directory().get(_clean(pan).upper())
