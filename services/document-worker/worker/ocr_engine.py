from __future__ import annotations

import io
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pdfplumber
import pypdfium2 as pdfium
import pytesseract
from PIL import Image
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


@dataclass
class OcrResult:
    searchable_pdf_bytes: bytes
    extracted_text: str
    pages_processed: int
    pages_ocr_applied: int
    engine_used: str
    language: str
    mean_confidence: float | None
    warnings: list[str] = field(default_factory=list)


def find_tesseract_binary() -> str | None:
    found = shutil.which("tesseract")
    if found:
        return found
    win_p = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
    if win_p.exists():
        return str(win_p)
    return None


def _get_available_tesseract_langs(tesseract_bin: str) -> set[str]:
    pytesseract.pytesseract.tesseract_cmd = tesseract_bin
    try:
        return set(pytesseract.get_languages(config=""))
    except Exception:
        return set()


def _register_ocr_unicode_font() -> str:
    for name, path in (
        ("NotoSansTamil", "/usr/share/fonts/truetype/noto/NotoSansTamil-Regular.ttf"),
        ("Nirmala", r"C:\Windows\Fonts\Nirmala.ttc"),
    ):
        if Path(path).exists():
            try:
                if name not in pdfmetrics.getRegisteredFontNames():
                    if path.lower().endswith(".ttc"):
                        pdfmetrics.registerFont(TTFont(name, path, subfontIndex=0))
                    else:
                        pdfmetrics.registerFont(TTFont(name, path))
                return name
            except Exception:
                continue
    return "Helvetica"


def _run_rapidocr(img: Image.Image) -> tuple[list[dict[str, Any]], float | None]:
    from rapidocr_onnxruntime import RapidOCR

    engine = RapidOCR()
    arr = np.asarray(img.convert("RGB"))
    res, _ = engine(arr)
    boxes: list[dict[str, Any]] = []
    confs: list[float] = []
    if res:
        for item in res:
            poly, text, score = item[0], str(item[1]), float(item[2])
            xs = [pt[0] for pt in poly]
            ys = [pt[1] for pt in poly]
            boxes.append(
                {
                    "text": text,
                    "x0": min(xs),
                    "y0": min(ys),
                    "x1": max(xs),
                    "y1": max(ys),
                    "conf": round(score * 100.0, 2),
                }
            )
            confs.append(score * 100.0)
    mean_c = round(sum(confs) / len(confs), 2) if confs else None
    return boxes, mean_c


def _run_tesseract(
    img: Image.Image, tesseract_bin: str, lang: str
) -> tuple[list[dict[str, Any]], float | None]:
    pytesseract.pytesseract.tesseract_cmd = tesseract_bin
    data = pytesseract.image_to_data(img, lang=lang, output_type=pytesseract.Output.DICT)
    boxes: list[dict[str, Any]] = []
    confs: list[float] = []
    n = len(data.get("text", []))
    for i in range(n):
        txt = (data["text"][i] or "").strip()
        if not txt:
            continue
        c_val = float(data["conf"][i])
        if c_val >= 0:
            confs.append(c_val)
        x, y, w, h = (
            float(data["left"][i]),
            float(data["top"][i]),
            float(data["width"][i]),
            float(data["height"][i]),
        )
        boxes.append(
            {"text": txt, "x0": x, "y0": y, "x1": x + w, "y1": y + h, "conf": c_val}
        )
    mean_c = round(sum(confs) / len(confs), 2) if confs else None
    return boxes, mean_c


def _ocr_single_image(
    img: Image.Image, *, language: str
) -> tuple[list[dict[str, Any]], str, float | None, list[str]]:
    warnings: list[str] = []
    tess_bin = find_tesseract_binary()
    if tess_bin:
        avail = _get_available_tesseract_langs(tess_bin)
        req_langs = [p.strip() for p in language.split("+") if p.strip()]
        if all(lang in avail for lang in req_langs):
            boxes, conf = _run_tesseract(img, tess_bin, language)
            return boxes, f"tesseract:{language}", conf, warnings
        missing = [lang for lang in req_langs if lang not in avail]
        warnings.append(
            f"Tesseract missing language pack(s) {missing}; "
            "falling back to RapidOCR (Latin/English only)."
        )
    else:
        if "tam" in language:
            warnings.append(
                "Tamil OCR requires Tesseract with 'tam' traineddata on host; "
                "using RapidOCR fallback (English/Latin only)."
            )
    boxes, conf = _run_rapidocr(img)
    return boxes, "rapidocr_onnxruntime", conf, warnings


def _draw_searchable_page(
    c: canvas.Canvas,
    img: Image.Image,
    boxes: list[dict[str, Any]],
    font_name: str,
) -> None:
    iw, ih = img.size
    page_w = 595.28
    page_h = page_w * (ih / max(1, iw))
    c.setPageSize((page_w, page_h))

    rgb = img.convert("RGB")
    buf = io.BytesIO()
    rgb.save(buf, format="JPEG", quality=88)
    buf.seek(0)
    c.drawImage(ImageReader(buf), 0, 0, width=page_w, height=page_h)

    scale_x = page_w / max(1, iw)
    scale_y = page_h / max(1, ih)

    for b in boxes:
        txt = b["text"].strip()
        if not txt:
            continue
        x_pt = b["x0"] * scale_x
        y_pt = page_h - (b["y1"] * scale_y)
        box_h = max(6.0, (b["y1"] - b["y0"]) * scale_y * 0.85)
        t_obj = c.beginText()
        t_obj.setTextRenderMode(3)  # Invisible searchable text layer
        t_obj.setFont(font_name, min(36.0, box_h))
        t_obj.setTextOrigin(x_pt, max(2.0, y_pt))
        try:
            t_obj.textOut(txt)
            c.drawText(t_obj)
        except Exception:
            # Skip glyphs unsupported by fallback Helvetica when Unicode font absent
            pass
    c.showPage()


def run_ocr(
    source_bytes: bytes,
    *,
    is_pdf: bool,
    language: str = "eng",
    force_ocr: bool = False,
) -> OcrResult:
    """Run OCR on a scanned PDF or image (eng / tam / eng+tam) and build a Searchable PDF."""
    if language not in ("eng", "tam", "eng+tam"):
        raise ValueError("Supported OCR languages are 'eng', 'tam', or 'eng+tam'.")

    font_name = _register_ocr_unicode_font()
    out_buf = io.BytesIO()
    c = canvas.Canvas(out_buf)

    all_warnings: list[str] = []
    seen_warns: set[str] = set()
    page_texts: list[str] = []
    confs: list[float] = []
    engines_used: set[str] = set()
    pages_ocr_applied = 0
    pages_processed = 0

    if not is_pdf:
        pages_processed = 1
        pages_ocr_applied = 1
        with Image.open(io.BytesIO(source_bytes)) as img:
            boxes, eng, conf, warns = _ocr_single_image(img, language=language)
            engines_used.add(eng)
            if conf is not None:
                confs.append(conf)
            for w in warns:
                if w not in seen_warns:
                    seen_warns.add(w)
                    all_warnings.append(w)
            _draw_searchable_page(c, img, boxes, font_name)
            page_texts.append(" ".join(b["text"] for b in boxes))
    else:
        existing_texts: list[str] = []
        with pdfplumber.open(io.BytesIO(source_bytes)) as plum:
            for pg in plum.pages:
                existing_texts.append((pg.extract_text() or "").strip())

        pdf_doc = pdfium.PdfDocument(source_bytes)
        try:
            pages_processed = len(pdf_doc)
            for idx in range(pages_processed):
                existing = existing_texts[idx] if idx < len(existing_texts) else ""
                p = pdf_doc[idx]
                try:
                    pil_img = p.render(scale=200.0 / 72.0).to_pil()
                finally:
                    p.close()

                if len(existing) >= 40 and not force_ocr:
                    # Digital text already present; keep extracted text cleanly
                    page_texts.append(f"--- Page {idx + 1} (digital text detected) ---\n{existing}")
                    _draw_searchable_page(
                        c,
                        pil_img,
                        [{"text": existing[:2000], "x0": 20, "y0": 20, "x1": 100, "y1": 34}],
                        font_name,
                    )
                    engines_used.add("digital_text_bypass")
                else:
                    pages_ocr_applied += 1
                    boxes, eng, conf, warns = _ocr_single_image(pil_img, language=language)
                    engines_used.add(eng)
                    if conf is not None:
                        confs.append(conf)
                    for w in warns:
                        if w not in seen_warns:
                            seen_warns.add(w)
                            all_warnings.append(w)
                    _draw_searchable_page(c, pil_img, boxes, font_name)
                    page_texts.append(
                        f"--- Page {idx + 1} ---\n" + " ".join(b["text"] for b in boxes)
                    )
        finally:
            pdf_doc.close()

    c.save()
    mean_conf = round(sum(confs) / len(confs), 2) if confs else None
    return OcrResult(
        searchable_pdf_bytes=out_buf.getvalue(),
        extracted_text="\n\n".join(page_texts),
        pages_processed=pages_processed,
        pages_ocr_applied=pages_ocr_applied,
        engine_used=", ".join(sorted(engines_used)) or "none",
        language=language,
        mean_confidence=mean_conf,
        warnings=all_warnings,
    )
