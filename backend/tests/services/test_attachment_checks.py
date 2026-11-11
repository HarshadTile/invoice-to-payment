"""Attachment content checks: disguised files, active PDFs, macro / bomb Office files, CSV formulas."""
import io
import zipfile

import pytest
from fastapi import HTTPException

from app.services.attachment_service import CONTENT_TYPES, check_content, clean_name, content_type_for


def _office(extension, extra=None, filler=b""):
    buffer = io.BytesIO()
    folder = "xl/workbook.xml" if extension == ".xlsx" else "word/document.xml"
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as package:
        package.writestr("[Content_Types].xml", "<Types/>")
        package.writestr(folder, "<doc/>")
        if filler:
            package.writestr("xl/media/big.bin", filler)
        for name in extra or ():
            package.writestr(name, b"x")
    return buffer.getvalue()


def _rejected(extension, content):
    with pytest.raises(HTTPException) as caught:
        check_content(extension, content)
    return caught.value.detail["error"]["message"]


def test_genuine_files_are_accepted():
    check_content(".pdf", b"%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n%%EOF")
    check_content(".png", b"\x89PNG\r\n\x1a\n" + b"\0" * 20)
    check_content(".jpg", b"\xff\xd8\xff\xe0" + b"\0" * 20)
    check_content(".xlsx", _office(".xlsx"))
    check_content(".docx", _office(".docx"))
    check_content(".csv", "Invoice,Amount,Note\nINV-1,-1250.50,short paid\nINV-2,+300,\n".encode())


def test_a_renamed_file_is_rejected():
    assert "does not match" in _rejected(".pdf", b"<html><script>alert(1)</script>")
    assert "does not match" in _rejected(".png", b"%PDF-1.4")


@pytest.mark.parametrize("payload", [b"/JavaScript", b"/JS (app.alert(1))", b"/Launch", b"/EmbeddedFile", b"/AA <<>>"])
def test_pdfs_with_active_content_are_rejected(payload):
    assert "scripts" in _rejected(".pdf", b"%PDF-1.7\n1 0 obj<<" + payload + b">>endobj")


def test_compressed_pdf_data_that_happens_to_contain_js_is_fine():
    stream = b"%PDF-1.7\n4 0 obj<</Length 12>>stream\r\n\x01/JS\x02/AA\x03\nendstream endobj\n%%EOF"
    check_content(".pdf", stream)


def test_office_files_with_macros_are_rejected():
    assert "macros" in _rejected(".xlsx", _office(".xlsx", ["xl/vbaProject.bin"]))
    assert "macros" in _rejected(".docx", _office(".docx", ["word/vbaProject.bin"]))


def test_a_zip_that_is_not_an_office_document_is_rejected():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as package:
        package.writestr("payload.exe", b"MZ")
    assert "not a valid" in _rejected(".xlsx", buffer.getvalue())
    assert "not a valid" in _rejected(".docx", _office(".xlsx"))  # an Excel file renamed .docx


def test_a_zip_bomb_is_rejected():
    assert "not a valid" in _rejected(".xlsx", _office(".xlsx", filler=b"\0" * (60 * 1024 * 1024)))


@pytest.mark.parametrize("cell", ["=1+1", "@SUM(A1)", "+cmd|' /C calc'!A0", "-2+3+cmd|' /C calc'!A0", "=HYPERLINK(\"http://x\")"])
def test_csv_formulas_are_rejected(cell):
    assert "formulas" in _rejected(".csv", f"Invoice,Note\nINV-1,{cell}\n".encode())


def test_csv_must_be_text():
    assert "UTF-8" in _rejected(".csv", b"\xff\xfe\x00I\x00n")
    assert "plain text" in _rejected(".csv", b"a,b\x00c\n")


def test_file_names_are_cleaned_and_types_come_from_the_server():
    assert clean_name("..\\..\\evil\\report.pdf") == "report.pdf"
    assert clean_name("in\x00voice\r\n.pdf") == "invoice.pdf"
    assert clean_name("") == "attachment"
    assert len(clean_name("a" * 300 + ".pdf")) == 150
    assert content_type_for("x.PDF") == CONTENT_TYPES[".pdf"]
    assert content_type_for("x.html") == "application/octet-stream"
