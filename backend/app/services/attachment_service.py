"""Ticket attachments: what may be uploaded, how it is checked, stored and served.

Checks on upload (every one must pass):
  * extension on the allow-list, size <= 5 MB;
  * the content really is that type (file signature), not just renamed;
  * PDF: no JavaScript, launch actions or embedded files;
  * Word / Excel: a genuine Office package, no macros, and not a zip bomb;
  * CSV: readable text with no spreadsheet formulas (CSV injection);
  * the antivirus hook (`scan`).
Stored under a random name outside any web root. On download the content type comes from the
server's own table (never from what the uploader's browser claimed) and the file is always sent
as a download, so a disguised file can't run in the browser.
"""
import csv
import io
import os
import re
import uuid
import zipfile
from pathlib import Path

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.models.ticket_activity import TicketAttachment


MAX_FILE_SIZE = 5 * 1024 * 1024
MAX_FILES_PER_COMMENT = 5
# The server decides the content type from the extension; the uploader's claim is ignored.
CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".csv": "text/csv",
}
ALLOWED_EXTENSIONS = set(CONTENT_TYPES)
STORAGE_ROOT = Path(os.getenv("TICKET_ATTACHMENT_DIR", Path(__file__).resolve().parents[2] / "data" / "attachments"))

# Office packages: limits that stop a "zip bomb" from filling memory or disk when opened.
MAX_UNPACKED_BYTES = 50 * 1024 * 1024
MAX_PACKAGE_ENTRIES = 2000
MAX_COMPRESSION_RATIO = 100
# PDF features that run code or carry other files.
_PDF_NAME = re.compile(rb"/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|AA)(?![A-Za-z0-9])")
# Compressed page / image data is skipped: random bytes there could look like "/JS" by chance.
_PDF_STREAM = re.compile(rb"stream\r?\n.*?endstream", re.DOTALL)
# A CSV cell Excel would treat as a formula. Plain signed numbers ("-1250.50") are fine.
_FORMULA_CELL = re.compile(r"^[=@\t\r]|^[+-](?![\d.,\s]*$)")
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


def _invalid(message: str) -> HTTPException:
    return HTTPException(status_code=422, detail={"error": {"code": "VALIDATION_ERROR", "message": message}})


def scan(content: bytes) -> None:
    """Antivirus hook: call the organisation's scanner here (e.g. ClamAV) and raise on a finding.
    Until one is connected, uploads rely on the type, content and size checks in this module."""


def _signature_ok(extension: str, content: bytes) -> bool:
    if extension == ".pdf":
        return content.startswith(b"%PDF-")
    if extension == ".png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if extension in (".jpg", ".jpeg"):
        return content.startswith(b"\xff\xd8\xff")
    if extension in (".xlsx", ".docx"):
        return content.startswith(b"PK\x03\x04")
    if extension == ".csv":
        return True  # checked as text below
    return False


def _check_pdf(content: bytes) -> None:
    # Defence in depth: names hidden inside compressed object streams aren't seen, which is why
    # downloads are also forced to save-as and sandboxed (app/api/v1/tickets.py).
    if _PDF_NAME.search(_PDF_STREAM.sub(b"", content)):
        raise _invalid("PDFs with scripts, actions or embedded files can't be attached. Print it to a new PDF and try again.")


def _check_office(extension: str, content: bytes) -> None:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as package:
            entries = package.infolist()
            names = {entry.filename for entry in entries}
            if len(entries) > MAX_PACKAGE_ENTRIES:
                raise _invalid("This file is not a valid Word or Excel document.")
            unpacked = sum(entry.file_size for entry in entries)
            if unpacked > MAX_UNPACKED_BYTES or unpacked > MAX_COMPRESSION_RATIO * max(len(content), 1):
                raise _invalid("This file is not a valid Word or Excel document.")
            folder = "xl/" if extension == ".xlsx" else "word/"
            if "[Content_Types].xml" not in names or not any(name.startswith(folder) for name in names):
                raise _invalid("This file is not a valid Word or Excel document.")
            if any(name.lower().endswith("vbaproject.bin") or "/activex/" in name.lower() for name in names):
                raise _invalid("Files with macros can't be attached. Save it as a normal .xlsx / .docx and try again.")
    except zipfile.BadZipFile:
        raise _invalid("This file is not a valid Word or Excel document.")


def _check_csv(content: bytes) -> None:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise _invalid("CSV files must be UTF-8 text.")
    if "\x00" in text:
        raise _invalid("CSV files must be plain text.")
    for row in csv.reader(io.StringIO(text)):
        for cell in row:
            if _FORMULA_CELL.match(cell):
                raise _invalid("CSV files can't contain spreadsheet formulas (cells starting with =, +, - or @).")


def check_content(extension: str, content: bytes) -> None:
    """Raises a 422 when the content isn't a safe file of that type."""
    if not _signature_ok(extension, content):
        raise _invalid("Attachment content does not match its file type.")
    if extension == ".pdf":
        _check_pdf(content)
    elif extension in (".xlsx", ".docx"):
        _check_office(extension, content)
    elif extension == ".csv":
        _check_csv(content)


def clean_name(filename: str | None) -> str:
    """The uploader's file name without any folder part or control characters, at most 150 characters."""
    name = _CONTROL_CHARS.sub("", Path((filename or "").replace("\\", "/")).name).strip() or "attachment"
    stem, extension = os.path.splitext(name)
    return f"{stem[:150 - len(extension)]}{extension}"


def content_type_for(name: str) -> str:
    return CONTENT_TYPES.get(Path(name).suffix.lower(), "application/octet-stream")


async def store_upload(
    db: Session,
    ticket_id: str,
    comment_id: int | None,
    uploaded_by: int | None,
    uploader_key: str,
    visibility: str,
    upload: UploadFile,
) -> TicketAttachment:
    original_name = clean_name(upload.filename)
    extension = Path(original_name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise _invalid("Unsupported attachment type.")
    content = await upload.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise _invalid("Attachments must be 5 MB or smaller.")
    if not content:
        raise _invalid("The attachment is empty.")
    check_content(extension, content)
    scan(content)
    STORAGE_ROOT.mkdir(parents=True, exist_ok=True)
    stored_key = f"{uuid.uuid4().hex}{extension}"
    destination = STORAGE_ROOT / stored_key
    destination.write_bytes(content)
    attachment = TicketAttachment(
        ticket_id=ticket_id,
        comment_id=comment_id,
        uploaded_by=uploaded_by,
        uploader_key=uploader_key,
        original_name=original_name,
        stored_key=stored_key,
        mime_type=CONTENT_TYPES[extension],
        size_bytes=len(content),
        visibility=visibility,
    )
    db.add(attachment)
    return attachment


def stored_path(attachment: TicketAttachment) -> Path:
    path = (STORAGE_ROOT / attachment.stored_key).resolve()
    root = STORAGE_ROOT.resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Attachment file not found."}})
    return path
