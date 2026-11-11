from __future__ import annotations

import io
import zipfile

import pytest
from app.services.clamav import EICAR_SIGNATURE, scan_bytes_for_malware
from app.services.file_validation import sanitize_filename, validate_upload_bytes
from PIL import Image


def test_validate_rejects_magic_byte_spoofing() -> None:
    fake_pdf = b"MZ\x90\x00This is actually an executable disguised as PDF"
    with pytest.raises(ValueError, match="missing %PDF-"):
        validate_upload_bytes("notes.pdf", fake_pdf, max_bytes=10 * 1024 * 1024)


def test_validate_rejects_disallowed_extension() -> None:
    with pytest.raises(ValueError, match="Unsupported file extension"):
        validate_upload_bytes("script.exe", b"MZ...", max_bytes=10 * 1024 * 1024)


def test_validate_rejects_empty_and_oversized() -> None:
    with pytest.raises(ValueError, match="empty"):
        validate_upload_bytes("a.pdf", b"", max_bytes=1024)
    with pytest.raises(ValueError, match="exceeds"):
        validate_upload_bytes("a.txt", b"x" * 2048, max_bytes=1024)


def test_validate_images_txt_and_ooxml() -> None:
    png_buf = io.BytesIO()
    Image.new("RGB", (20, 20), (10, 20, 30)).save(png_buf, format="PNG")
    res_png = validate_upload_bytes("photo.png", png_buf.getvalue(), max_bytes=1024 * 1024)
    assert res_png.mime_type == "image/png"

    jpg_buf = io.BytesIO()
    Image.new("RGB", (20, 20), (40, 50, 60)).save(jpg_buf, format="JPEG")
    res_jpg = validate_upload_bytes("photo.jpg", jpg_buf.getvalue(), max_bytes=1024 * 1024)
    assert res_jpg.mime_type == "image/jpeg"

    with pytest.raises(ValueError, match="PNG"):
        validate_upload_bytes("bad.png", b"NOTPNG1234", max_bytes=1024 * 1024)
    with pytest.raises(ValueError, match="JPEG"):
        validate_upload_bytes("bad.jpg", b"NOTJPG1234", max_bytes=1024 * 1024)
    with pytest.raises(ValueError, match="Corrupted"):
        validate_upload_bytes("broken.png", b"\x89PNG\r\n\x1a\nbroken", max_bytes=1024 * 1024)

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w") as zf:
        zf.writestr("[Content_Types].xml", "<Types/>")
    res_docx = validate_upload_bytes("doc.docx", zip_buf.getvalue(), max_bytes=1024 * 1024)
    assert res_docx.extension == ".docx"

    bad_zip_buf = io.BytesIO()
    with zipfile.ZipFile(bad_zip_buf, "w") as zf:
        zf.writestr("hello.txt", "world")
    with pytest.raises(ValueError, match="Content_Types"):
        validate_upload_bytes("bad.docx", bad_zip_buf.getvalue(), max_bytes=1024 * 1024)
    with pytest.raises(ValueError, match="Corrupted"):
        validate_upload_bytes("bad2.docx", b"PK\x03\x04corrupt", max_bytes=1024 * 1024)

    res_txt = validate_upload_bytes("notes.txt", b"Hello Tamil \xe0\xae\xa4", max_bytes=1024)
    assert res_txt.mime_type == "text/plain"
    with pytest.raises(ValueError, match="UTF-8"):
        validate_upload_bytes("bad.txt", b"\xff\xfe\x00\x00", max_bytes=1024)


def test_sanitize_filename_strips_traversal() -> None:
    assert sanitize_filename("../../etc/passwd.pdf") == "passwd.pdf"


@pytest.mark.asyncio
async def test_clamav_blocks_eicar_and_allows_clean() -> None:
    res = await scan_bytes_for_malware(b"%PDF-1.4\n" + EICAR_SIGNATURE)
    assert res.clean is False
    assert "EICAR" in (res.detail or "")

    clean_res = await scan_bytes_for_malware(b"%PDF-1.4\n% clean file\n")
    assert clean_res.clean is True


@pytest.mark.asyncio
async def test_purge_expired_guest_documents_empty_run() -> None:
    from app.db.models import Base
    from app.db.session import engine
    from app.services.retention import purge_expired_guest_documents

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    purged = await purge_expired_guest_documents()
    assert purged >= 0
