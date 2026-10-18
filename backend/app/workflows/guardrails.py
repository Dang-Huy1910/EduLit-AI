"""Socratic Guardrails.

Pre-call and post-call checks per SRS BR-01 to BR-04.

Heuristics here reduce write-for-me and invented citations. They do not
guarantee that every sample paragraph or fabricated quote is caught.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Iterable

from app.ai.schemas import SourceReference

# Patterns that indicate the student wants the AI to write for them
WRITE_FOR_ME_PATTERNS = [
    r"viết\s+hộ",
    r"viết\s+giùm",
    r"viết\s+giúp",
    r"viết\s+cho\s+tôi",
    r"làm\s+bài\s+hộ",
    r"làm\s+bài\s+giùm",
    r"làm\s+bài\s+giúp",
    r"làm\s+hộ",
    r"làm\s+giúp",
    r"để\s+tôi\s+copy",
    r"copy\s+cho\s+tôi",
    r"đánh\s+giúp",
    r"dịch\s+hộ",
    r"tóm\s+tắt\s+hộ",
    r"dàn\s+ý\s+hoàn\s+chỉnh",
    r"bài\s+mẫu",
    r"bài\s+văn\s+mẫu",
    r"đoạn\s+văn\s+mẫu",
]

OUT_OF_SCOPE_PATTERNS = [
    r"giải\s+bài\s+toán",
    r"làm\s+bài\s+vật\s+lý",
    r"làm\s+bài\s+hóa",
    r"làm\s+bài\s+anh",
    r"dịch\s+sang\s+tiếng",
    r"dịch\s+tiếng\s+anh",
    r"viết\s+code",
    r"làm\s+bài\s+tin\s+học",
]

SAMPLE_WRITING_PATTERNS = [
    r"mở\s+bài\s*:",
    r"thân\s+bài\s*:",
    r"kết\s+bài\s*:",
    r"đoạn\s+văn\s+mẫu",
    r"bài\s+văn\s+mẫu",
    r"em\s+có\s+thể\s+chép",
    r"em\s+có\s+thể\s+copy",
]

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?…])\s+")


def detect_write_for_me(student_input: str) -> bool:
    """Check if student is asking the AI to write for them."""
    text = student_input.lower().strip()
    for pattern in WRITE_FOR_ME_PATTERNS:
        if re.search(pattern, text):
            return True
    return False


def detect_out_of_scope(student_input: str) -> bool:
    """Check if student request is outside the literature rubric scope."""
    text = student_input.lower().strip()
    for pattern in OUT_OF_SCOPE_PATTERNS:
        if re.search(pattern, text):
            return True
    return False


def split_sentences(response_text: str) -> list[str]:
    sentences = _SENTENCE_SPLIT.split(response_text.strip())
    return [s.strip() for s in sentences if s.strip()]


def detect_sample_writing(response_text: str) -> bool:
    """Heuristic: assistant is drafting a sample paragraph/essay for the student.

    A valid Socratic turn is a short sequence of guiding questions, not a
    block of declarative sentences finished with a courtesy question.

    Limits: this is pattern-based. Short guiding statements plus one question
    are allowed. Three or more declarative sentences (even with a final '?')
    are treated as sample writing.
    """
    text = response_text.strip()
    lowered = text.lower()
    for pattern in SAMPLE_WRITING_PATTERNS:
        if re.search(pattern, lowered):
            return True

    sentences = split_sentences(text)
    if not sentences:
        return False
    declarative = [s for s in sentences if not s.endswith("?")]
    if len(declarative) >= 3:
        return True
    long_declarative = [s for s in declarative if len(s) >= 140]
    if len(long_declarative) >= 2:
        return True
    return False


def validate_response(response_text: str) -> tuple[bool, str]:
    """Validate that a response meets guardrail requirements.

    Checks:
    1. Not more than 4 sentences
    2. Ends with a question mark
    3. Does not look like sample writing for the student
    """
    text = response_text.strip()
    if not text:
        return False, "Phản hồi trống"

    sentences = split_sentences(text)
    if len(sentences) > 4:
        return False, f"Phản hồi có {len(sentences)} câu, tối đa 4 câu"

    if not text.endswith("?"):
        return False, "Phản hồi phải kết thúc bằng câu hỏi (?)"

    if detect_sample_writing(text):
        return False, "Phản hồi giống đoạn văn mẫu / viết hộ học sinh"

    return True, ""


def normalize_quote(value: str) -> str:
    """NFC, collapse whitespace, strip wrapping quotation marks."""
    text = unicodedata.normalize("NFC", value or "")
    text = re.sub(r"\s+", " ", text).strip()
    return text.strip("«»\"'“”‘’")


def context_chunk_id(chunk: dict[str, Any], index: int) -> str:
    return str(chunk.get("chunk_id") or chunk.get("id") or f"chunk_{index}")


def context_chunk_text(chunk: dict[str, Any]) -> str:
    return str(chunk.get("text") or chunk.get("content") or "")


def parse_source_references(sources: Any) -> tuple[list[SourceReference] | None, str]:
    """Parse sources into SourceReference list. Invalid structure is an error."""
    if sources is None:
        return [], ""
    if not isinstance(sources, list):
        return None, "Nguồn phải là danh sách SourceReference"
    parsed: list[SourceReference] = []
    for item in sources:
        if isinstance(item, SourceReference):
            parsed.append(item)
            continue
        if not isinstance(item, dict):
            return None, "Nguồn phải có chunk_id và quote"
        try:
            parsed.append(SourceReference.model_validate(item))
        except Exception:
            return None, "Nguồn thiếu chunk_id/quote hoặc sai cấu trúc"
    return parsed, ""


def validate_sources(
    sources: Any,
    available_chunks: Iterable[dict[str, Any]] | set[str],
) -> tuple[bool, str]:
    """Validate source references against allowed context.

    Quote matching uses normalize_quote (NFC + whitespace collapse + strip
    wrapping quotes) and requires the normalized quote to be a substring of
    the normalized chunk text. Invented quotes on a real chunk_id fail.
    """
    parsed, error = parse_source_references(sources)
    if error:
        return False, error
    assert parsed is not None
    if not parsed:
        return True, ""

    if isinstance(available_chunks, set):
        # Legacy ID-only check used by older tests; quotes cannot be verified.
        for source in parsed:
            if source.chunk_id not in available_chunks:
                return False, f"chunk_id không thuộc ngữ cảnh: {source.chunk_id}"
        return True, ""

    chunks = list(available_chunks)
    by_id = {context_chunk_id(c, i): c for i, c in enumerate(chunks)}
    for source in parsed:
        chunk = by_id.get(source.chunk_id)
        if chunk is None:
            return False, f"chunk_id không thuộc ngữ cảnh: {source.chunk_id}"
        haystack = normalize_quote(context_chunk_text(chunk))
        needle = normalize_quote(source.quote)
        if not needle or needle not in haystack:
            return False, "Trích dẫn không khớp nội dung nguồn"
    return True, ""


FALLBACK_RESPONSES = {
    "INIT": "Bạn có thể chia sẻ suy nghĩ đầu tiên về đề bài này không? Đâu là điều em quan tâm nhất?",
    "THESIS": "Em có thể nói rõ hơn về hướng triển khai mà em muốn chọn không? Điều gì khiến em thấy hấp dẫn ở hướng đó?",
    "OUTLINE": "Trước khi phát triển chi tiết, em có muốn chia sẻ thêm về cách em định sắp xếp các ý chính không?",
    "REVIEW": "Em cảm thấy dàn ý hiện tại đã sẵn sàng để viết bài hoàn chỉnh chưa? Có phần nào em muốn điều chỉnh thêm không?",
}


def get_fallback_response(state: str) -> str:
    """Pre-approved question for the current FSM state. No source claims."""
    return FALLBACK_RESPONSES.get(state, FALLBACK_RESPONSES["INIT"])
