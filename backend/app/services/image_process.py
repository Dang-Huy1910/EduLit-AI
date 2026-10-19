"""Validate handwritten page images and bake EXIF, rotation, and PII masks."""

from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from typing import Any

from app.config import Settings

try:
    from PIL import Image, ImageDraw, ImageOps, UnidentifiedImageError
except ImportError as exc:  # pragma: no cover
    raise RuntimeError("Pillow is required for submission image processing") from exc

ALLOWED_MIMES = {
    "image/jpeg": "JPEG",
    "image/jpg": "JPEG",
    "image/png": "PNG",
}
JPEG_MAGIC = (b"\xff\xd8\xff",)
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


class ImageProcessError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class ProcessedImage:
    original_mime: str
    original_sha256: str
    original_byte_size: int
    width: int
    height: int
    processed_bytes: bytes
    processed_mime: str
    processed_sha256: str
    processed_byte_size: int
    processed_width: int
    processed_height: int


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sniff_image_mime(data: bytes) -> str:
    if data.startswith(PNG_MAGIC):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    raise ImageProcessError(
        "SUBMISSION_IMAGE_TYPE",
        "Chỉ nhận ảnh JPEG hoặc PNG thật. File không phải ảnh hợp lệ.",
    )


def _open_image(data: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ImageProcessError(
            "SUBMISSION_IMAGE_TYPE",
            "Không đọc được ảnh. Hãy chọn file JPEG hoặc PNG rõ nét.",
        ) from exc
    return image


def validate_and_process(
    data: bytes,
    *,
    settings: Settings,
    rotation_degrees: int = 0,
    mask_regions: list[dict[str, Any]] | None = None,
    declared_mime: str | None = None,
) -> ProcessedImage:
    if not data:
        raise ImageProcessError("SUBMISSION_IMAGE_TYPE", "Ảnh trống.")
    max_bytes = int(settings.OCR_MAX_PAGE_BYTES or 8_000_000)
    if len(data) > max_bytes:
        raise ImageProcessError(
            "SUBMISSION_IMAGE_SIZE",
            f"Mỗi trang tối đa {max_bytes // (1024 * 1024)} MB.",
        )
    sniffed = sniff_image_mime(data)
    if declared_mime:
        declared = declared_mime.lower().split(";")[0].strip()
        if declared in ALLOWED_MIMES and sniffed.split("/")[-1] != (
            "jpeg" if declared.endswith("jpeg") or declared.endswith("jpg") else "png"
        ):
            if declared not in {"image/jpeg", "image/jpg", "image/png"}:
                raise ImageProcessError(
                    "SUBMISSION_IMAGE_TYPE",
                    "Chỉ nhận ảnh JPEG hoặc PNG.",
                )
    original_mime = sniffed
    image = _open_image(data)
    image = ImageOps.exif_transpose(image) or image
    if image.mode not in {"RGB", "L"}:
        image = image.convert("RGB")
    elif image.mode == "L":
        image = image.convert("RGB")

    min_edge = int(settings.OCR_MIN_EDGE or 200)
    max_edge = int(settings.OCR_MAX_EDGE or 8000)
    width, height = image.size
    if width < min_edge or height < min_edge:
        raise ImageProcessError(
            "SUBMISSION_IMAGE_SIZE",
            f"Ảnh quá nhỏ. Cạnh ngắn nhất cần từ {min_edge}px.",
        )
    if width > max_edge or height > max_edge:
        raise ImageProcessError(
            "SUBMISSION_IMAGE_SIZE",
            f"Ảnh quá lớn. Cạnh dài nhất tối đa {max_edge}px.",
        )

    rotation = int(rotation_degrees or 0) % 360
    if rotation not in {0, 90, 180, 270}:
        raise ImageProcessError("VALIDATION", "Góc xoay chỉ nhận 0, 90, 180 hoặc 270 độ.")
    if rotation:
        image = image.rotate(-rotation, expand=True)

    process_max = int(settings.OCR_PROCESS_MAX_EDGE or 2400)
    pw, ph = image.size
    longest = max(pw, ph)
    if longest > process_max:
        scale = process_max / float(longest)
        image = image.resize(
            (max(1, int(round(pw * scale))), max(1, int(round(ph * scale)))),
            Image.Resampling.LANCZOS,
        )

    _apply_masks(image, mask_regions or [])

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=92, optimize=True, subsampling=0)
    processed = buffer.getvalue()
    processed_w, processed_h = image.size
    return ProcessedImage(
        original_mime=original_mime,
        original_sha256=sha256_bytes(data),
        original_byte_size=len(data),
        width=width,
        height=height,
        processed_bytes=processed,
        processed_mime="image/jpeg",
        processed_sha256=sha256_bytes(processed),
        processed_byte_size=len(processed),
        processed_width=processed_w,
        processed_height=processed_h,
    )


def _apply_masks(image: Image.Image, regions: list[dict[str, Any]]) -> None:
    if not regions:
        return
    draw = ImageDraw.Draw(image)
    width, height = image.size
    for raw in regions:
        if not isinstance(raw, dict):
            continue
        try:
            x = float(raw.get("x", 0))
            y = float(raw.get("y", 0))
            w = float(raw.get("width", raw.get("w", 0)))
            h = float(raw.get("height", raw.get("h", 0)))
        except (TypeError, ValueError):
            continue
        if w <= 0 or h <= 0:
            continue
        left = int(max(0.0, min(1.0, x)) * width)
        top = int(max(0.0, min(1.0, y)) * height)
        right = int(max(0.0, min(1.0, x + w)) * width)
        bottom = int(max(0.0, min(1.0, y + h)) * height)
        if right - left < 2 or bottom - top < 2:
            continue
        draw.rectangle([left, top, right, bottom], fill=(0, 0, 0))
