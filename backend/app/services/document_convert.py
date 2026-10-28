"""Convert teacher uploads to Markdown with MarkItDown. Local only, no plugins/LLM."""

from __future__ import annotations

import hashlib
import io
import logging
import re
import threading
import zipfile
from dataclasses import dataclass

from markitdown import MarkItDown
from markitdown._stream_info import StreamInfo
import pypdfium2 as pdfium
from PIL import Image

from app.config import Settings, get_settings
from app.core.errors import ERROR_MESSAGES
from app.services.catalog_errors import CatalogError

logger = logging.getLogger("edulit.import.convert")

_PDF_MAGIC = b"%PDF"
_ZIP_MAGIC = b"PK"
_PAGE_COMMENT = re.compile(r"<!--.*?-->", re.S)
_WHITESPACE = re.compile(r"\s+")
# PDFium calls must not overlap across the request/worker rendering threads.
_PDFIUM_LOCK = threading.Lock()

MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MIME_PDF = "application/pdf"
MIME_TXT = "text/plain"
MIME_MD = "text/markdown"


@dataclass
class ConversionOutcome:
    markdown: str
    title: str | None
    extension: str
    mime_type: str
    needs_ocr: bool
    truncated: bool
    warning: str


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def pdf_page_count(data: bytes) -> int:
    with _PDFIUM_LOCK, pdfium.PdfDocument(data) as pdf:
        return len(pdf)


def render_pdf_page(data: bytes, page_index: int, dpi: int) -> bytes:
    """Render one page to JPEG without retaining or persisting the bitmap."""
    with _PDFIUM_LOCK, pdfium.PdfDocument(data) as pdf:
        page = pdf[page_index]
        try:
            # Cap before rendering to avoid allocating huge scanned page bitmaps.
            scale = min(max(1, dpi) / 72, 2000 / max(page.get_size()))
            bitmap = page.render(scale=scale)
            try:
                with bitmap.to_pil() as rendered, rendered.convert("RGB") as image:
                    image.thumbnail((2000, 2000), Image.Resampling.LANCZOS)
                    output = io.BytesIO()
                    image.save(output, format="JPEG", quality=85)
                    return output.getvalue()
            finally:
                bitmap.close()
        finally:
            page.close()


def safe_filename(name: str | None) -> str:
    raw = (name or "").replace("\\", "/").split("/")[-1].strip()
    cleaned = re.sub(r"[\x00-\x1f]", "", raw)
    cleaned = cleaned[:255].strip() or "tai-lieu"
    if cleaned in {".", ".."}:
        return "tai-lieu"
    return cleaned


def _zip_names(data: bytes) -> list[str]:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            return [info.filename.replace("\\", "/") for info in archive.infolist()]
    except zipfile.BadZipFile as exc:
        raise CatalogError(400, "IMPORT_TYPE", ERROR_MESSAGES["IMPORT_TYPE"]) from exc


def sniff_upload(filename: str, data: bytes) -> tuple[str, str]:
    """Detect type from magic bytes. Filename is metadata only."""
    if data.startswith(_PDF_MAGIC):
        return ".pdf", MIME_PDF
    if data.startswith(_ZIP_MAGIC):
        names = _zip_names(data)
        if any(name.startswith("word/") for name in names):
            return ".docx", MIME_DOCX
        if any(name.startswith("xl/") for name in names):
            return ".xlsx", MIME_XLSX
        raise CatalogError(400, "IMPORT_TYPE", ERROR_MESSAGES["IMPORT_TYPE"])
    # Text / markdown
    for encoding in ("utf-8-sig", "utf-8"):
        try:
            text = data.decode(encoding)
        except UnicodeDecodeError:
            continue
        if "\x00" in text:
            break
        lower_name = filename.lower()
        if lower_name.endswith(".md") or text.lstrip().startswith("#"):
            return ".md", MIME_MD
        return ".txt", MIME_TXT
    raise CatalogError(400, "IMPORT_TYPE", ERROR_MESSAGES["IMPORT_TYPE"])


def _visible_text_len(markdown: str) -> int:
    stripped = _PAGE_COMMENT.sub("", markdown)
    stripped = re.sub(r"[#|*_`>\-\[\]()]", " ", stripped)
    return len(_WHITESPACE.sub("", stripped))


def _run_markitdown(data: bytes, extension: str, mime_type: str, filename: str) -> ConversionOutcome:
    converter = MarkItDown(enable_plugins=False)
    stream = io.BytesIO(data)
    result = converter.convert_stream(
        stream,
        stream_info=StreamInfo(
            mimetype=mime_type,
            extension=extension,
            filename=filename,
        ),
    )
    markdown = (result.markdown or "").replace("\x00", "")
    return ConversionOutcome(
        markdown=markdown,
        title=result.title,
        extension=extension,
        mime_type=mime_type,
        needs_ocr=False,
        truncated=False,
        warning="",
    )


def convert_upload(data: bytes, filename: str, *, settings: Settings | None = None) -> ConversionOutcome:
    settings = settings or get_settings()
    if len(data) > settings.IMPORT_MAX_BYTES:
        raise CatalogError(400, "IMPORT_TOO_LARGE", ERROR_MESSAGES["IMPORT_TOO_LARGE"])
    if not data:
        raise CatalogError(400, "IMPORT_TYPE", "File trống.")
    safe_name = safe_filename(filename)
    extension, mime_type = sniff_upload(safe_name, data)
    try:
        outcome = _run_markitdown(data, extension, mime_type, safe_name)
    except CatalogError:
        raise
    except Exception as exc:
        logger.error("markitdown_failed type=%s", type(exc).__name__)
        if extension == ".pdf":
            raise CatalogError(422, "IMPORT_NEEDS_OCR", ERROR_MESSAGES["IMPORT_NEEDS_OCR"]) from exc
        raise CatalogError(400, "IMPORT_TYPE", "Không chuyển được tài liệu sang Markdown.") from exc

    visible = _visible_text_len(outcome.markdown)
    if extension == ".pdf" and visible < settings.IMPORT_MIN_TEXT_CHARS:
        outcome.needs_ocr = True
        outcome.warning = ERROR_MESSAGES["IMPORT_NEEDS_OCR"]
        return outcome
    if visible < 1 and extension not in {".xlsx"}:
        if extension == ".pdf":
            outcome.needs_ocr = True
            outcome.warning = ERROR_MESSAGES["IMPORT_NEEDS_OCR"]
            return outcome
        raise CatalogError(400, "IMPORT_TYPE", "Tài liệu không có chữ để xử lý.")
    if len(outcome.markdown) > settings.IMPORT_MAX_MARKDOWN_CHARS:
        outcome.truncated = True
        outcome.warning = (
            "Markdown dài hơn giới hạn hiển thị/phân tích. File gốc vẫn còn đủ; "
            "agent chỉ đọc phần đầu và không được xem là đã xử lý đầy đủ."
        )
    return outcome
