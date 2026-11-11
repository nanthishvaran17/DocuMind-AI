from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = 40_000_000  # Decompression-bomb guard (~40MP)

ALLOWED_EXTENSIONS: dict[str, str] = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

MAX_ZIP_UNCOMPRESSED_BYTES = 150 * 1024 * 1024


@dataclass(frozen=True)
class ValidatedUpload:
    safe_filename: str
    extension: str
    mime_type: str
    size_bytes: int


def sanitize_filename(raw_name: str) -> str:
    base = Path(raw_name).name.strip()
    cleaned = "".join(ch if ch.isalnum() or ch in ("-", "_", ".", " ") else "_" for ch in base)
    return (cleaned[:200] or "document").strip()


def validate_upload_bytes(filename: str, data: bytes, max_bytes: int) -> ValidatedUpload:
    if not data:
        raise ValueError("Uploaded file is empty.")
    if len(data) > max_bytes:
        raise ValueError(
            f"File exceeds the maximum allowed size of {max_bytes // (1024 * 1024)} MB."
        )

    safe_name = sanitize_filename(filename)
    ext = Path(safe_name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file extension '{ext or 'none'}'. "
            f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS.keys()))}."
        )

    expected_mime = ALLOWED_EXTENSIONS[ext]

    if ext == ".pdf":
        # PDF magic bytes can appear within the first 1024 bytes per PDF spec
        if b"%PDF-" not in data[:1024]:
            raise ValueError("Invalid PDF file: missing %PDF- header signature.")
    elif ext == ".png":
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("Invalid PNG file: magic bytes mismatch.")
        _verify_image(data)
    elif ext in (".jpg", ".jpeg"):
        if not data.startswith(b"\xff\xd8\xff"):
            raise ValueError("Invalid JPEG file: magic bytes mismatch.")
        _verify_image(data)
    elif ext in (".docx", ".xlsx", ".pptx"):
        if not data.startswith(b"PK\x03\x04"):
            raise ValueError(f"Invalid {ext.upper()} archive: magic bytes mismatch.")
        _verify_ooxml_zip(data, ext)
    elif ext in (".txt", ".md", ".markdown"):
        try:
            data.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError("Text/Markdown file must be valid UTF-8.") from exc

    return ValidatedUpload(
        safe_filename=safe_name,
        extension=ext,
        mime_type=expected_mime,
        size_bytes=len(data),
    )


def _verify_image(data: bytes) -> None:
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.verify()
    except Image.DecompressionBombError as exc:
        raise ValueError("Image exceeds safe pixel dimensions (decompression bomb guard).") from exc
    except Exception as exc:
        raise ValueError("Corrupted or unreadable image file.") from exc


def _verify_ooxml_zip(data: bytes, ext: str) -> None:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            total_uncompressed = sum(info.file_size for info in zf.infolist())
            if total_uncompressed > MAX_ZIP_UNCOMPRESSED_BYTES:
                raise ValueError("Archive uncompressed size exceeds safety limit.")
            names = set(zf.namelist())
            if "[Content_Types].xml" not in names:
                raise ValueError(f"Invalid {ext.upper()} file: missing [Content_Types].xml.")
    except zipfile.BadZipFile as exc:
        raise ValueError(f"Corrupted {ext.upper()} archive.") from exc
