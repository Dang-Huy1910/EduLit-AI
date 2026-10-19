"""Real MarkItDown conversion on Vietnamese fixtures. No live AI."""

from __future__ import annotations

import pytest

from app.services.document_convert import convert_upload, sha256_bytes, sniff_upload
from tests.catalog.fixtures import (
    mixed_markdown_bytes,
    poetry_rubric_docx_bytes,
    rubric_xlsx_bytes,
    scanned_pdf_bytes,
    text_layer_pdf_bytes,
)


def test_sniff_does_not_trust_filename() -> None:
    data = poetry_rubric_docx_bytes()
    extension, mime = sniff_upload("malware.exe", data)
    assert extension == ".docx"
    assert "wordprocessingml" in mime


def test_docx_keeps_poetry_breaks_and_table() -> None:
    outcome = convert_upload(poetry_rubric_docx_bytes(), "tho-barem.docx")
    assert outcome.needs_ocr is False
    assert "Dữ dội và dịu êm" in outcome.markdown
    assert "Ồn ào và lặng lẽ" in outcome.markdown
    assert "Sóng biển đêm khuya" in outcome.markdown
    assert "2,5" in outcome.markdown or "2.5" in outcome.markdown
    assert "Nội dung" in outcome.markdown


def test_text_pdf_has_readable_layer() -> None:
    outcome = convert_upload(text_layer_pdf_bytes(), "van-ban.pdf")
    assert outcome.needs_ocr is False
    lower = outcome.markdown.lower()
    assert "khói nhà máy" in lower or "khoi nha may" in lower


def test_scanned_pdf_needs_ocr() -> None:
    outcome = convert_upload(scanned_pdf_bytes(), "scan.pdf")
    assert outcome.needs_ocr is True


def test_xlsx_rubric_table() -> None:
    outcome = convert_upload(rubric_xlsx_bytes(), "barem.xlsx")
    assert "Nội dung" in outcome.markdown
    assert "2,5" in outcome.markdown or "2.5" in outcome.markdown
    assert "Lập luận" in outcome.markdown


def test_markdown_passthrough_keeps_constraints() -> None:
    data = mixed_markdown_bytes()
    outcome = convert_upload(data, "tong-hop.md")
    assert "600 chữ" in outcome.markdown
    assert "so sánh" in outcome.markdown.lower()
    assert sha256_bytes(data) == sha256_bytes(mixed_markdown_bytes())


def test_empty_file_rejected() -> None:
    from app.services.catalog_errors import CatalogError

    with pytest.raises(CatalogError) as exc:
        convert_upload(b"", "empty.txt")
    assert exc.value.code == "IMPORT_TYPE"
