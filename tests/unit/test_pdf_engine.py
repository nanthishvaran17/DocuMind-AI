from __future__ import annotations

import io
from pathlib import Path

import pikepdf
import pytest
from PIL import Image
from pypdf import PdfReader
from worker import pdf_engine

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


def test_inspect_and_thumbnails() -> None:
    pdf_bytes = (FIXTURES / "sample_multipage.pdf").read_bytes()
    info = pdf_engine.inspect_pdf(pdf_bytes)
    assert info.page_count == 5
    assert info.is_encrypted is False
    assert len(info.pages) == 5

    thumbs = pdf_engine.render_page_thumbnails(pdf_bytes, max_pages=3)
    assert len(thumbs) == 3
    for page_no, png in thumbs:
        assert page_no >= 1
        assert png.startswith(b"\x89PNG\r\n\x1a\n")


def test_merge_split_rotate_reorder() -> None:
    single = (FIXTURES / "sample_english.pdf").read_bytes()
    multi = (FIXTURES / "sample_multipage.pdf").read_bytes()

    merged = pdf_engine.merge_pdfs([(single, None), (multi, [1, 3])])
    assert len(PdfReader(io.BytesIO(merged)).pages) == 3

    parts = pdf_engine.split_pdf(multi, [[1, 2], [3, 4, 5]])
    assert len(parts) == 2
    assert len(PdfReader(io.BytesIO(parts[0])).pages) == 2
    assert len(PdfReader(io.BytesIO(parts[1])).pages) == 3

    rotated = pdf_engine.rotate_pdf(single, 90)
    assert int(PdfReader(io.BytesIO(rotated)).pages[0].get("/Rotate", 0)) == 90

    reordered = pdf_engine.select_or_reorder_pages(multi, [5, 1])
    reader = PdfReader(io.BytesIO(reordered))
    assert len(reader.pages) == 2
    assert "Page 5 of 5" in (reader.pages[0].extract_text() or "")
    assert "Page 1 of 5" in (reader.pages[1].extract_text() or "")


def test_compress_presets_and_target_kb() -> None:
    multi = (FIXTURES / "sample_multipage.pdf").read_bytes()
    out_bytes, metrics = pdf_engine.compress_pdf(multi, preset="high")
    assert len(out_bytes) <= len(multi)
    assert metrics["before_bytes"] == len(multi)
    assert metrics["after_bytes"] == len(out_bytes)

    target_out, target_metrics = pdf_engine.compress_pdf(multi, target_kb=200)
    assert target_metrics["target_kb"] == 200
    assert len(target_out) < len(multi)


def test_watermark_and_page_numbers() -> None:
    single = (FIXTURES / "sample_english.pdf").read_bytes()
    wm = pdf_engine.add_watermark(single, "CONFIDENTIAL")
    wm_text = PdfReader(io.BytesIO(wm)).pages[0].extract_text() or ""
    assert "CONFIDENTIAL" in wm_text

    numbered = pdf_engine.add_page_numbers(single, position="bottom-center")
    num_text = PdfReader(io.BytesIO(numbered)).pages[0].extract_text() or ""
    assert "Page 1 of 1" in num_text


def test_protect_and_unlock_strict_password() -> None:
    single = (FIXTURES / "sample_english.pdf").read_bytes()
    protected = pdf_engine.protect_pdf(single, "StudentPass123!")
    assert PdfReader(io.BytesIO(protected)).is_encrypted is True

    with pytest.raises(ValueError, match="Incorrect PDF password"):
        pdf_engine.unlock_pdf(protected, "WrongPassword")

    unlocked = pdf_engine.unlock_pdf(protected, "StudentPass123!")
    assert PdfReader(io.BytesIO(unlocked)).is_encrypted is False


def test_strip_pdf_javascript() -> None:
    single = (FIXTURES / "sample_english.pdf").read_bytes()
    with pikepdf.open(io.BytesIO(single)) as pdf:
        pdf.Root["/OpenAction"] = pikepdf.Dictionary(
            S=pikepdf.Name("/JavaScript"), JS=pikepdf.String("app.alert('xss');")
        )
        dirty = io.BytesIO()
        pdf.save(dirty)

    cleaned, stripped = pdf_engine.strip_pdf_javascript(dirty.getvalue())
    assert stripped is True
    with pikepdf.open(io.BytesIO(cleaned)) as pdf_clean:
        assert "/OpenAction" not in pdf_clean.Root


def test_photo_resizer_and_camera_scan() -> None:
    photo = (FIXTURES / "sample_photo.jpg").read_bytes()
    resized, metrics = pdf_engine.resize_photo_or_signature(
        photo, width_px=413, height_px=531, dpi=300, max_kb=100, output_format="JPEG"
    )
    assert len(resized) <= 100 * 1024
    assert metrics["target_met"] is True
    with Image.open(io.BytesIO(resized)) as img:
        assert img.size == (413, 531)

    scanned_pdf, scan_metrics = pdf_engine.images_to_scanned_pdf(
        [photo, photo], enhance_mode="document"
    )
    assert scan_metrics["page_count"] == 2
    assert len(PdfReader(io.BytesIO(scanned_pdf)).pages) == 2
