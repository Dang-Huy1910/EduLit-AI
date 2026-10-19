"""Small Vietnamese fixtures for MarkItDown import tests.

Generators return bytes. Tests call MarkItDown on these, not live AI.
"""

from __future__ import annotations

import io
import zipfile
from xml.sax.saxutils import escape

from openpyxl import Workbook

POEM_LINES = (
    "Dữ dội và dịu êm",
    "Ồn ào và lặng lẽ",
    "Sóng biển đêm khuya",
)

FACTORY_MATERIAL = (
    "Buổi sáng thành phố mở mắt trong lớp sương xám của khói nhà máy. "
    "Ống khói đứng thẳng như những cây bút chì khổng lồ."
)

WRITING_TASK_FULL = (
    "Viết bài nghị luận xã hội về trách nhiệm của người trẻ trước khói nhà máy. "
    "Bài khoảng 600 chữ. So sánh trách nhiệm cá nhân với trách nhiệm nhà máy. "
    "Có dẫn chứng từ ngữ liệu."
)


def _w_p(text: str) -> str:
    return f"<w:p><w:r><w:t xml:space=\"preserve\">{escape(text)}</w:t></w:r></w:p>"


def _w_tc(text: str) -> str:
    return (
        "<w:tc><w:tcPr><w:tcW w:w=\"2400\" w:type=\"dxa\"/></w:tcPr>"
        f"{_w_p(text)}</w:tc>"
    )


def _w_tr(cells: list[str]) -> str:
    return "<w:tr>" + "".join(_w_tc(cell) for cell in cells) + "</w:tr>"


def poetry_rubric_docx_bytes() -> bytes:
    """DOCX: poem line breaks + rubric table with a 0-point level and decimal comma."""
    rows = [
        ["Tiêu chí", "Điểm tối đa"],
        ["Nội dung", "2,5"],
        ["Hình thức", "1,5"],
    ]
    table = "<w:tbl><w:tblPr><w:tblW w:w=\"0\" w:type=\"auto\"/></w:tblPr>" + "".join(
        _w_tr(row) for row in rows
    ) + "</w:tbl>"
    body = (
        _w_p("Sóng")
        + "".join(_w_p(line) for line in POEM_LINES)
        + _w_p("Barem")
        + table
        + "<w:sectPr/>"
    )
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body}</w:body></w:document>"
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/>'
        "</Relationships>"
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", rels)
        archive.writestr("word/document.xml", document_xml)
    return buffer.getvalue()


def _pdf_utf16_hex(text: str) -> str:
    return "FEFF" + text.encode("utf-16-be").hex().upper()


def _wrap_pdf(objects: list[str]) -> bytes:
    parts = [b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"]
    offsets = [0]
    body = b"".join(parts)
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(body))
        chunk = f"{index} 0 obj\n{obj}\nendobj\n".encode("latin-1")
        parts.append(chunk)
        body += chunk
    xref_at = len(body)
    xref = [f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("latin-1")]
    for offset in offsets[1:]:
        xref.append(f"{offset:010d} 00000 n \n".encode("latin-1"))
    trailer = (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_at}\n%%EOF\n"
    ).encode("latin-1")
    return b"".join(parts + xref + [trailer])


def text_layer_pdf_bytes() -> bytes:
    """PDF with a visible text layer. Helvetica holds ASCII; ActualText carries Vietnamese."""
    text = "Khói nhà máy và không gian đô thị. " + FACTORY_MATERIAL
    hex_text = _pdf_utf16_hex(text)
    visible = (
        "Khoi nha may va khong gian do thi. "
        "Buoi sang thanh pho mo mat trong lop suong xam cua khoi nha may. "
        "Ong khoi dung thang nhu nhung cay but chi khong lo."
    )
    stream = (
        "BT\n/Span << /ActualText <" + hex_text + " >> BDC\n"
        f"/F1 12 Tf\n72 720 Td\n({visible}) Tj\nEMC\nET\n"
    )
    stream_bytes = stream.encode("latin-1")
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        "/Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(stream_bytes)} >>\nstream\n{stream}endstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    return _wrap_pdf(objects)


def scanned_pdf_bytes() -> bytes:
    """PDF page with no text operators — conversion must not become READY."""
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
    ]
    return _wrap_pdf(objects)


def rubric_xlsx_bytes() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Barem"
    sheet["A1"] = "Tiêu chí"
    sheet["B1"] = "Điểm tối đa"
    sheet["A2"] = "Nội dung"
    sheet["B2"] = "2,5"
    sheet["A3"] = "Lập luận"
    sheet["B3"] = "5"
    sheet["A4"] = "Diễn đạt"
    sheet["B4"] = "2,5"
    sheet["A5"] = "Mức 0"
    sheet["B5"] = "0,0 điểm = chưa đạt (không phải tiêu chí cha)"
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def mixed_markdown_bytes() -> bytes:
    text = "\n".join(
        [
            "# Nghị luận về khói nhà máy",
            "",
            "## Ngữ liệu",
            "",
            FACTORY_MATERIAL,
            "",
            "## Yêu cầu viết",
            "",
            WRITING_TASK_FULL,
            "",
            "## Gợi ý",
            "",
            "- Mở bài nêu vấn đề ô nhiễm không khí",
            "- Thân bài phân tích trách nhiệm người trẻ",
            "- Kết bài liên hệ bản thân",
            "",
            "## Barem",
            "",
            "| Tiêu chí | Điểm tối đa |",
            "| --- | --- |",
            "| Nội dung | 6 |",
            "| Hình thức | 4 |",
            "",
        ]
    )
    return text.encode("utf-8")


def broken_pdf_bytes() -> bytes:
    return b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nnot-a-valid-pdf"


def corrupt_docx_bytes() -> bytes:
    """Sniffs as DOCX (word/) but document.xml is not readable."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "not-xml")
        archive.writestr("_rels/.rels", "not-xml")
        archive.writestr("word/document.xml", "<<<<not-a-word-document")
    return buffer.getvalue()
