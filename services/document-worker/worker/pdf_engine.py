from __future__ import annotations

import io
import os
import textwrap
from dataclasses import dataclass
from typing import Any

import pikepdf
from PIL import Image, ImageDraw, ImageEnhance, ImageOps
from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import Color
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


def _pymupdf_allowed() -> bool:
    return os.getenv("PDF_ENGINE_ALLOW_PYMUPDF", "false").lower() == "true"


def _try_import_fitz() -> Any | None:
    if not _pymupdf_allowed():
        return None
    try:
        import fitz  # type: ignore[import-not-found]

        return fitz
    except ImportError:
        return None


@dataclass(frozen=True)
class PdfPageInfo:
    page_no: int
    width: float
    height: float
    rotation: int


@dataclass(frozen=True)
class PdfInspectionResult:
    page_count: int
    is_encrypted: bool
    pages: list[PdfPageInfo]
    metadata: dict[str, str]
    js_stripped: bool


def parse_page_ranges(spec: str, total_pages: int) -> list[int]:
    """Parse 1-based page spec like '1-3,5,7-9' into sorted/ordered 1-based indices."""
    if not spec.strip():
        return list(range(1, total_pages + 1))
    pages: list[int] = []
    for part in spec.split(","):
        token = part.strip()
        if not token:
            continue
        if "-" in token:
            bounds = token.split("-", 1)
            start = int(bounds[0].strip())
            end = int(bounds[1].strip())
            if start < 1 or end > total_pages or start > end:
                raise ValueError(f"Invalid page range '{token}' for {total_pages}-page document.")
            pages.extend(range(start, end + 1))
        else:
            page = int(token)
            if page < 1 or page > total_pages:
                raise ValueError(f"Page {page} is out of bounds (1..{total_pages}).")
            pages.append(page)
    if not pages:
        raise ValueError("No valid pages specified.")
    return pages


def strip_pdf_javascript(pdf_bytes: bytes) -> tuple[bytes, bool]:
    """Remove JavaScript actions (/JS, /JavaScript, /AA, /OpenAction) from an untrusted PDF."""
    stripped = False
    with pikepdf.open(io.BytesIO(pdf_bytes)) as pdf:
        root = pdf.Root
        if "/OpenAction" in root:
            del root["/OpenAction"]
            stripped = True
        if "/AA" in root:
            del root["/AA"]
            stripped = True
        if "/Names" in root and isinstance(root["/Names"], pikepdf.Dictionary):
            names = root["/Names"]
            if "/JavaScript" in names:
                del names["/JavaScript"]
                stripped = True
        for page in pdf.pages:
            for key in ("/AA",):
                if key in page:
                    del page[key]
                    stripped = True
            if "/Annots" in page:
                for annot in page["/Annots"]:
                    if isinstance(annot, pikepdf.Dictionary):
                        for key in ("/A", "/AA"):
                            if key in annot and isinstance(annot[key], pikepdf.Dictionary):
                                action = annot[key]
                                if (
                                    action.get("/S") == pikepdf.Name("/JavaScript")
                                    or "/JS" in action
                                ):
                                    del annot[key]
                                    stripped = True
        out = io.BytesIO()
        pdf.save(out)
        return out.getvalue(), stripped


def inspect_pdf(pdf_bytes: bytes, max_pages: int = 1000) -> PdfInspectionResult:
    """Inspect PDF page count, dimensions, encryption, and safe metadata."""
    reader = PdfReader(io.BytesIO(pdf_bytes), strict=False)
    if reader.is_encrypted:
        return PdfInspectionResult(
            page_count=0,
            is_encrypted=True,
            pages=[],
            metadata={},
            js_stripped=False,
        )
    page_count = len(reader.pages)
    if page_count > max_pages:
        raise ValueError(f"PDF exceeds maximum allowed page limit ({page_count} > {max_pages}).")

    pages: list[PdfPageInfo] = []
    for idx, page in enumerate(reader.pages, start=1):
        box = page.mediabox
        width = float(box.width)
        height = float(box.height)
        rotation = int(page.get("/Rotate", 0) or 0) % 360
        if rotation not in (0, 90, 180, 270):
            rotation = 0
        pages.append(PdfPageInfo(page_no=idx, width=width, height=height, rotation=rotation))

    meta: dict[str, str] = {}
    if reader.metadata:
        for k in ("/Title", "/Author", "/Subject", "/Creator", "/Producer"):
            val = reader.metadata.get(k)
            if val is not None:
                meta[k.lstrip("/").lower()] = str(val)[:500]

    return PdfInspectionResult(
        page_count=page_count,
        is_encrypted=False,
        pages=pages,
        metadata=meta,
        js_stripped=False,
    )


def render_page_thumbnails(
    pdf_bytes: bytes,
    max_pages: int = 50,
    thumb_width: int = 280,
) -> list[tuple[int, bytes]]:
    """Generate PNG thumbnails for PDF pages (PyMuPDF if allowed, else Pillow+pypdf)."""
    fitz = _try_import_fitz()
    if fitz is not None:
        thumbs: list[tuple[int, bytes]] = []
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        try:
            for idx in range(min(len(doc), max_pages)):
                page = doc[idx]
                scale = thumb_width / max(page.rect.width, 1.0)
                pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
                thumbs.append((idx + 1, pix.tobytes("png")))
        finally:
            doc.close()
        return thumbs

    # Permissive fallback: render structural thumbnail with page dimensions & extracted text snippet
    reader = PdfReader(io.BytesIO(pdf_bytes), strict=False)
    if reader.is_encrypted:
        return []
    thumbs = []
    for idx in range(min(len(reader.pages), max_pages)):
        page = reader.pages[idx]
        w_pt = max(float(page.mediabox.width), 100.0)
        h_pt = max(float(page.mediabox.height), 100.0)
        thumb_h = max(140, min(520, int(thumb_width * (h_pt / w_pt))))
        img = Image.new("RGB", (thumb_width, thumb_h), (255, 255, 255))
        draw = ImageDraw.Draw(img)
        draw.rectangle([0, 0, thumb_width - 1, thumb_h - 1], outline=(220, 224, 232), width=2)
        draw.rectangle([14, 14, thumb_width - 14, 34], fill=(241, 243, 249))
        draw.text((20, 19), f"Page {idx + 1}", fill=(79, 70, 229))

        try:
            extracted = (page.extract_text() or "").strip()
        except Exception:
            extracted = ""
        if extracted:
            lines = textwrap.wrap(extracted[:420], width=36)[:14]
            y = 48
            for line in lines:
                draw.text((16, y), line, fill=(38, 42, 54))
                y += 16
        else:
            draw.text((16, 56), "[Vector / Scanned Page]", fill=(120, 128, 145))

        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        thumbs.append((idx + 1, buf.getvalue()))
    return thumbs


def merge_pdfs(items: list[tuple[bytes, list[int] | None]]) -> bytes:
    """Merge multiple PDFs (with optional 1-based page lists) into a single PDF."""
    if not items:
        raise ValueError("At least one PDF is required to merge.")
    writer = PdfWriter()
    for pdf_bytes, page_list in items:
        reader = PdfReader(io.BytesIO(pdf_bytes), strict=False)
        if reader.is_encrypted:
            raise ValueError("Cannot merge a password-protected PDF. Unlock it first.")
        total = len(reader.pages)
        selected = page_list if page_list is not None else list(range(1, total + 1))
        for page_no in selected:
            if page_no < 1 or page_no > total:
                raise ValueError(f"Page {page_no} out of range (1..{total}).")
            writer.add_page(reader.pages[page_no - 1])
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def split_pdf(pdf_bytes: bytes, page_groups: list[list[int]]) -> list[bytes]:
    """Split a PDF into multiple PDFs, one per 1-based page list."""
    reader = PdfReader(io.BytesIO(pdf_bytes), strict=False)
    if reader.is_encrypted:
        raise ValueError("Cannot split an encrypted PDF. Unlock it first.")
    total = len(reader.pages)
    outputs: list[bytes] = []
    for group in page_groups:
        if not group:
            continue
        writer = PdfWriter()
        for page_no in group:
            if page_no < 1 or page_no > total:
                raise ValueError(f"Page {page_no} out of range (1..{total}).")
            writer.add_page(reader.pages[page_no - 1])
        buf = io.BytesIO()
        writer.write(buf)
        outputs.append(buf.getvalue())
    if not outputs:
        raise ValueError("No pages matched the split specification.")
    return outputs


def rotate_pdf(pdf_bytes: bytes, angle: int, pages: list[int] | None = None) -> bytes:
    """Rotate selected pages (or all pages) by 90, 180, or 270 degrees clockwise."""
    if angle not in (90, 180, 270, -90):
        raise ValueError("Angle must be 90, 180, 270, or -90.")
    reader = PdfReader(io.BytesIO(pdf_bytes), strict=False)
    if reader.is_encrypted:
        raise ValueError("Cannot rotate an encrypted PDF.")
    target_set = set(pages) if pages else None
    writer = PdfWriter()
    for idx, page in enumerate(reader.pages, start=1):
        if target_set is None or idx in target_set:
            page.rotate(angle)
        writer.add_page(page)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def select_or_reorder_pages(pdf_bytes: bytes, ordered_pages: list[int]) -> bytes:
    """Extract, delete (by omitting), or reorder pages according to a 1-based page sequence."""
    if not ordered_pages:
        raise ValueError("Resulting document must have at least one page.")
    reader = PdfReader(io.BytesIO(pdf_bytes), strict=False)
    if reader.is_encrypted:
        raise ValueError("Cannot modify pages of an encrypted PDF.")
    total = len(reader.pages)
    writer = PdfWriter()
    for page_no in ordered_pages:
        if page_no < 1 or page_no > total:
            raise ValueError(f"Page {page_no} out of range (1..{total}).")
        writer.add_page(reader.pages[page_no - 1])
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def _recompress_pdf_images(
    pdf_bytes: bytes,
    jpeg_quality: int,
    max_dimension: int | None,
) -> bytes:
    """Optimize PDF streams and recompress embedded raster images via pikepdf + Pillow."""
    with pikepdf.open(io.BytesIO(pdf_bytes)) as pdf:
        pdf.remove_unreferenced_resources()
        for page in pdf.pages:
            resources = page.get("/Resources")
            if not isinstance(resources, pikepdf.Dictionary):
                continue
            xobjects = resources.get("/XObject")
            if not isinstance(xobjects, pikepdf.Dictionary):
                continue
            for name in list(xobjects.keys()):
                obj = xobjects[name]
                if not isinstance(obj, pikepdf.Stream):
                    continue
                if obj.get("/Subtype") != pikepdf.Name("/Image"):
                    continue
                # Skip masked/indexed images to prevent visual corruption
                if "/SMask" in obj or "/Mask" in obj or "/ImageMask" in obj:
                    continue
                try:
                    pdf_img = pikepdf.PdfImage(obj)
                    pil_img = pdf_img.as_pil_image()
                except Exception:
                    continue

                if pil_img.mode not in ("RGB", "L"):
                    pil_img = pil_img.convert("RGB")

                if max_dimension and max(pil_img.size) > max_dimension:
                    pil_img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)

                img_buf = io.BytesIO()
                pil_img.save(img_buf, format="JPEG", quality=jpeg_quality, optimize=True)
                obj.write(img_buf.getvalue(), filter=pikepdf.Name("/DCTDecode"))
                obj["/Width"] = pil_img.width
                obj["/Height"] = pil_img.height
                obj["/BitsPerComponent"] = 8
                obj["/ColorSpace"] = (
                    pikepdf.Name("/DeviceGray")
                    if pil_img.mode == "L"
                    else pikepdf.Name("/DeviceRGB")
                )

        out = io.BytesIO()
        pdf.save(
            out,
            compress_streams=True,
            object_stream_mode=pikepdf.ObjectStreamMode.generate,
            recompress_flate=True,
        )
        return out.getvalue()


def compress_pdf(
    pdf_bytes: bytes,
    preset: str = "medium",
    target_kb: int | None = None,
) -> tuple[bytes, dict[str, Any]]:
    """
    Compress a PDF with 3 real presets ('low', 'medium', 'high') or an exact target KB budget.
    Returns (compressed_bytes, real_metrics_dict). Never fakes size or quality.
    """
    original_size = len(pdf_bytes)
    preset_map: dict[str, tuple[int, int | None]] = {
        "low": (85, None),
        "medium": (65, 1600),
        "high": (45, 1100),
    }

    if target_kb is None:
        if preset not in preset_map:
            raise ValueError("Preset must be 'low', 'medium', or 'high'.")
        quality, max_dim = preset_map[preset]
        candidate = _recompress_pdf_images(pdf_bytes, jpeg_quality=quality, max_dimension=max_dim)
        best = candidate if len(candidate) < original_size else pdf_bytes
        return best, {
            "mode": f"preset:{preset}",
            "before_bytes": original_size,
            "after_bytes": len(best),
            "saved_percent": round(max(0.0, (1 - len(best) / max(original_size, 1)) * 100), 2),
            "target_kb": None,
            "target_met": True,
            "warning": (
                "Already compact; returned original size without inflating."
                if len(best) == original_size
                else None
            ),
        }

    if target_kb < 10:
        raise ValueError("Target size must be at least 10 KB.")
    target_bytes = target_kb * 1024

    if original_size <= target_bytes:
        # Still run lossless stream optimization if beneficial
        candidate = _recompress_pdf_images(pdf_bytes, jpeg_quality=88, max_dimension=None)
        best = candidate if len(candidate) < original_size else pdf_bytes
        return best, {
            "mode": "target_kb",
            "before_bytes": original_size,
            "after_bytes": len(best),
            "saved_percent": round(max(0.0, (1 - len(best) / max(original_size, 1)) * 100), 2),
            "target_kb": target_kb,
            "target_met": True,
            "warning": None,
        }

    # Try progressively tighter image recompression profiles
    profiles = [
        (75, 1600),
        (60, 1400),
        (45, 1200),
        (35, 1000),
        (25, 800),
        (18, 650),
    ]
    best = pdf_bytes
    for quality, max_dim in profiles:
        candidate = _recompress_pdf_images(pdf_bytes, jpeg_quality=quality, max_dimension=max_dim)
        if len(candidate) < len(best):
            best = candidate
        if len(best) <= target_bytes:
            break

    target_met = len(best) <= target_bytes
    warning = None
    if not target_met:
        warning = (
            f"Achieved {round(len(best) / 1024, 1)} KB (target was {target_kb} KB). "
            "Further reduction requires splitting pages or lowering scan resolution."
        )
    elif len(best) < original_size * 0.4:
        warning = (
            "Heavy compression applied; verify small text and image sharpness before submitting."
        )

    return best, {
        "mode": "target_kb",
        "before_bytes": original_size,
        "after_bytes": len(best),
        "saved_percent": round(max(0.0, (1 - len(best) / max(original_size, 1)) * 100), 2),
        "target_kb": target_kb,
        "target_met": target_met,
        "warning": warning,
    }


def add_watermark(
    pdf_bytes: bytes,
    text: str,
    opacity: float = 0.22,
    angle: int = 45,
    font_size: int = 40,
) -> bytes:
    """Stamp a diagonal vector text watermark onto every page."""
    if not text.strip():
        raise ValueError("Watermark text cannot be empty.")
    reader = PdfReader(io.BytesIO(pdf_bytes), strict=False)
    if reader.is_encrypted:
        raise ValueError("Cannot watermark an encrypted PDF.")
    writer = PdfWriter()
    for page in reader.pages:
        writer_page = writer.add_page(page)
        width = float(writer_page.mediabox.width)
        height = float(writer_page.mediabox.height)
        overlay_buf = io.BytesIO()
        c = canvas.Canvas(overlay_buf, pagesize=(width, height))
        c.saveState()
        c.setFillColor(Color(0.39, 0.40, 0.95, alpha=max(0.05, min(opacity, 0.85))))
        c.setFont("Helvetica-Bold", max(10, min(font_size, 120)))
        c.translate(width / 2.0, height / 2.0)
        c.rotate(angle)
        c.drawCentredString(0, 0, text[:80])
        c.restoreState()
        c.save()

        overlay_reader = PdfReader(io.BytesIO(overlay_buf.getvalue()))
        writer_page.merge_page(overlay_reader.pages[0])

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def add_page_numbers(
    pdf_bytes: bytes,
    position: str = "bottom-center",
    template: str = "Page {n} of {total}",
    start_no: int = 1,
) -> bytes:
    """Add page numbers to every page."""
    valid_positions = {
        "bottom-left",
        "bottom-center",
        "bottom-right",
        "top-left",
        "top-center",
        "top-right",
    }
    if position not in valid_positions:
        raise ValueError(f"Position must be one of: {', '.join(sorted(valid_positions))}")

    reader = PdfReader(io.BytesIO(pdf_bytes), strict=False)
    if reader.is_encrypted:
        raise ValueError("Cannot add page numbers to an encrypted PDF.")
    total_pages = len(reader.pages)
    writer = PdfWriter()

    for idx, page in enumerate(reader.pages):
        writer_page = writer.add_page(page)
        num = start_no + idx
        label = template.format(n=num, total=start_no + total_pages - 1)
        width = float(writer_page.mediabox.width)
        height = float(writer_page.mediabox.height)

        overlay_buf = io.BytesIO()
        c = canvas.Canvas(overlay_buf, pagesize=(width, height))
        c.setFont("Helvetica", 10)
        c.setFillColor(Color(0.22, 0.25, 0.32, alpha=0.9))

        margin_x = 36.0
        y = 22.0 if position.startswith("bottom") else height - 28.0
        if position.endswith("left"):
            c.drawString(margin_x, y, label)
        elif position.endswith("right"):
            c.drawRightString(width - margin_x, y, label)
        else:
            c.drawCentredString(width / 2.0, y, label)
        c.save()

        overlay_reader = PdfReader(io.BytesIO(overlay_buf.getvalue()))
        writer_page.merge_page(overlay_reader.pages[0])

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def protect_pdf(pdf_bytes: bytes, user_password: str, owner_password: str | None = None) -> bytes:
    """Encrypt a PDF with AES-256."""
    if not user_password:
        raise ValueError("Password cannot be empty.")
    with pikepdf.open(io.BytesIO(pdf_bytes)) as pdf:
        out = io.BytesIO()
        pdf.save(
            out,
            encryption=pikepdf.Encryption(
                user=user_password,
                owner=owner_password or user_password,
                R=6,
            ),
        )
        return out.getvalue()


def unlock_pdf(pdf_bytes: bytes, password: str) -> bytes:
    """Decrypt a password-protected PDF only when the exact valid password is provided."""
    if not password:
        raise ValueError("Password is required to unlock the PDF.")
    try:
        with pikepdf.open(io.BytesIO(pdf_bytes), password=password) as pdf:
            out = io.BytesIO()
            pdf.save(out)
            return out.getvalue()
    except pikepdf.PasswordError as exc:
        raise ValueError("Incorrect PDF password.") from exc


def resize_photo_or_signature(
    image_bytes: bytes,
    width_px: int,
    height_px: int,
    dpi: int = 300,
    max_kb: int = 100,
    output_format: str = "JPEG",
    enhance_background: bool = False,
) -> tuple[bytes, dict[str, Any]]:
    """
    Resize a student photo or signature to exact pixel, DPI, and max-KB constraints.
    Uses white canvas padding / aspect-preserving contain fit so heads/signatures are never clipped.
    """
    if width_px < 32 or height_px < 32 or width_px > 4000 or height_px > 4000:
        raise ValueError("Target dimensions must be between 32 and 4000 pixels.")

    before_bytes = len(image_bytes)
    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img)

    if enhance_background:
        # Ideal for signatures on paper: boost contrast & push off-white paper toward pure white
        gray = img.convert("L")
        gray = ImageOps.autocontrast(gray, cutoff=2)
        gray = ImageEnhance.Contrast(gray).enhance(1.5)
        img = gray.point(lambda p: 255 if p > 205 else p).convert("RGB")
    elif img.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        rgba = img.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[3])
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    # Fit inside target canvas cleanly without distortion
    fitted = ImageOps.contain(img, (width_px, height_px), Image.Resampling.LANCZOS)
    canvas_img = Image.new("RGB", (width_px, height_px), (255, 255, 255))
    offset_x = (width_px - fitted.width) // 2
    offset_y = (height_px - fitted.height) // 2
    canvas_img.paste(fitted, (offset_x, offset_y))

    fmt = output_format.upper()
    if fmt not in ("JPEG", "PNG"):
        raise ValueError("Output format must be JPEG or PNG.")

    target_bytes = max_kb * 1024
    best_bytes = b""

    if fmt == "PNG":
        buf = io.BytesIO()
        canvas_img.save(buf, format="PNG", dpi=(dpi, dpi), optimize=True)
        best_bytes = buf.getvalue()
        if len(best_bytes) > target_bytes:
            quantized = canvas_img.quantize(colors=128)
            q_buf = io.BytesIO()
            quantized.save(q_buf, format="PNG", dpi=(dpi, dpi), optimize=True)
            if len(q_buf.getvalue()) < len(best_bytes):
                best_bytes = q_buf.getvalue()
    else:
        for quality in (95, 90, 82, 74, 65, 55, 45, 35, 25):
            buf = io.BytesIO()
            canvas_img.save(buf, format="JPEG", quality=quality, dpi=(dpi, dpi), optimize=True)
            best_bytes = buf.getvalue()
            if len(best_bytes) <= target_bytes:
                break

    target_met = len(best_bytes) <= target_bytes
    return best_bytes, {
        "before_bytes": before_bytes,
        "after_bytes": len(best_bytes),
        "width_px": width_px,
        "height_px": height_px,
        "dpi": dpi,
        "format": fmt,
        "target_kb": max_kb,
        "target_met": target_met,
        "warning": None
        if target_met
        else f"Output is {round(len(best_bytes) / 1024, 1)} KB (above {max_kb} KB).",
    }


def images_to_scanned_pdf(
    images: list[bytes],
    enhance_mode: str = "document",
) -> tuple[bytes, dict[str, Any]]:
    """Convert camera/gallery images into an enhanced multi-page PDF."""
    if not images:
        raise ValueError("At least one image is required.")
    if enhance_mode not in ("original", "document", "grayscale"):
        raise ValueError("enhance_mode must be 'original', 'document', or 'grayscale'.")

    out = io.BytesIO()
    c = canvas.Canvas(out)

    for raw in images:
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img)
        if img.mode != "RGB":
            img = img.convert("RGB")

        if enhance_mode == "document":
            img = ImageOps.autocontrast(img, cutoff=1)
            img = ImageEnhance.Contrast(img).enhance(1.25)
            img = ImageEnhance.Sharpness(img).enhance(1.3)
        elif enhance_mode == "grayscale":
            img = ImageOps.autocontrast(img.convert("L"), cutoff=2)
            img = ImageEnhance.Contrast(img).enhance(1.35).convert("RGB")

        # Normalize to crisp A4-equivalent pt size keeping orientation
        w_px, h_px = img.size
        if w_px > h_px:
            page_w, page_h = 842.0, 595.0
        else:
            page_w, page_h = 595.0, 842.0

        c.setPageSize((page_w, page_h))
        img_buf = io.BytesIO()
        img.save(img_buf, format="JPEG", quality=85, optimize=True)
        img_buf.seek(0)

        scale = min((page_w - 24.0) / max(w_px, 1), (page_h - 24.0) / max(h_px, 1))
        draw_w = w_px * scale
        draw_h = h_px * scale
        c.drawImage(
            ImageReader(img_buf),
            (page_w - draw_w) / 2.0,
            (page_h - draw_h) / 2.0,
            width=draw_w,
            height=draw_h,
        )
        c.showPage()

    c.save()
    pdf_bytes = out.getvalue()
    return pdf_bytes, {
        "page_count": len(images),
        "after_bytes": len(pdf_bytes),
        "enhance_mode": enhance_mode,
    }
