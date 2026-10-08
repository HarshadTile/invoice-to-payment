import os
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.models.ticket_activity import TicketAttachment


MAX_FILE_SIZE = 5 * 1024 * 1024
MAX_FILES_PER_COMMENT = 5
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".xlsx", ".csv", ".docx"}
STORAGE_ROOT = Path(os.getenv("TICKET_ATTACHMENT_DIR", Path(__file__).resolve().parents[2] / "data" / "attachments"))


def scan(content: bytes) -> None:
    """Antivirus integration hook. Development accepts content after signature checks."""


def _looks_valid(extension: str, content: bytes) -> bool:
    if extension == ".pdf":
        return content.startswith(b"%PDF")
    if extension == ".png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if extension in (".jpg", ".jpeg"):
        return content.startswith(b"\xff\xd8\xff")
    if extension in (".xlsx", ".docx"):
        return content.startswith(b"PK")
    if extension == ".csv":
        try:
            content[:4096].decode("utf-8-sig")
            return True
        except UnicodeDecodeError:
            return False
    return False


async def store_upload(
    db: Session,
    ticket_id: str,
    comment_id: int | None,
    uploaded_by: int | None,
    uploader_key: str,
    visibility: str,
    upload: UploadFile,
) -> TicketAttachment:
    original_name = Path(upload.filename or "attachment").name
    extension = Path(original_name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail={"error": {"code": "VALIDATION_ERROR", "message": "Unsupported attachment type."}})
    content = await upload.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=422, detail={"error": {"code": "VALIDATION_ERROR", "message": "Attachments must be 5 MB or smaller."}})
    if not _looks_valid(extension, content):
        raise HTTPException(status_code=422, detail={"error": {"code": "VALIDATION_ERROR", "message": "Attachment content does not match its file type."}})
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
        mime_type=upload.content_type or "application/octet-stream",
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
