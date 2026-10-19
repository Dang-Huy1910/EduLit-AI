"""Socratic Guardrails.

Pre-call and post-call checks per SRS BR-01 to BR-04.

Heuristics here reduce write-for-me and invented citations. They do not
guarantee that every sample paragraph or fabricated quote is caught.
"""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Callable, Iterable

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


def detect_sample_writing(response_text: str, *, task: str = "turn") -> bool:
    """Heuristic: assistant is drafting a sample paragraph/essay for the student.

    Limits: this is pattern-based. Short guiding statements plus one question
    are allowed. Classic conversation turns treat three or more declarative
    sentences (even with a final '?') as sample writing. Explain/edit intents
    and outline-init use a looser check so valid lists and explanations pass.
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
    long_declarative = [s for s in declarative if len(s) >= 140]
    if len(long_declarative) >= 2:
        return True
    if task == "outline_init":
        # Welcome copy plus a question is fine; long prose is not.
        if len(declarative) >= 5:
            return True
        return False
    if task in {"explain", "edit", "propose", "mixed"}:
        if len(long_declarative) >= 1 and len(declarative) >= 4:
            return True
        return False
    if len(declarative) >= 3:
        return True
    return False


def _max_sentences_for(task: str, intent: str | None) -> int:
    if task == "outline_init":
        return 8
    key = (intent or "").upper()
    if key == "EXPLAIN":
        return 8
    if key in {"PROPOSE", "EDIT"}:
        return 6
    if key == "MIXED":
        return 8
    if key == "CLARIFY":
        return 4
    return 4


def _requires_trailing_question(task: str, intent: str | None) -> bool:
    if task == "outline_init":
        return False
    key = (intent or "").upper()
    if key in {"EXPLAIN", "PROPOSE", "EDIT", "MIXED"}:
        return False
    if key == "CLARIFY":
        return True
    return True


def validate_response(
    response_text: str,
    *,
    task: str = "turn",
    intent: str | None = None,
) -> tuple[bool, str]:
    """Validate that a response meets the guardrail for this task/intent.

    Classic conversation turns (no intent) keep: max 4 sentences, trailing
    question, no sample writing. Outline init and labelled intents relax
    length/question so lists and explanations are not blocked.
    """
    text = response_text.strip()
    if not text:
        return False, "Phản hồi trống"

    sentences = split_sentences(text)
    max_sentences = _max_sentences_for(task, intent)
    if len(sentences) > max_sentences:
        return False, f"Phản hồi có {len(sentences)} câu, tối đa {max_sentences} câu"

    if _requires_trailing_question(task, intent) and not text.endswith("?"):
        return False, "Phản hồi phải kết thúc bằng câu hỏi (?)"

    sample_task = "turn"
    key = (intent or "").upper()
    if task == "outline_init":
        sample_task = "outline_init"
    elif key == "EXPLAIN":
        sample_task = "explain"
    elif key in {"EDIT", "PROPOSE", "MIXED"}:
        sample_task = key.lower()
    if detect_sample_writing(text, task=sample_task):
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


_LEGACY_CHUNK_REF = re.compile(r"^chunk[-_]\d+$", re.IGNORECASE)
_SOURCE_CHUNK_KEYS = ("source_chunk_id", "sourceChunkId")


def compact_log_reason(reason: str, limit: int = 180) -> str:
    """Short validation reason for logs. Never include documents or secrets."""
    text = re.sub(r"\s+", " ", str(reason or "")).strip()
    if len(text) > limit:
        return text[:limit] + "…"
    return text


@dataclass(frozen=True)
class SourceAliasMap:
    """Per-request aliases (src_1, src_2, …) mapped to stored full chunk IDs."""

    alias_to_full: dict[str, str]
    full_to_alias: dict[str, str]
    unique_short: dict[str, str]
    ambiguous_short: frozenset[str]

    @property
    def aliases(self) -> list[str]:
        return list(self.alias_to_full.keys())


def _legacy_short_keys(full_id: str) -> set[str]:
    """Old model forms such as chunk_2 / chunk-2 derived from a full ID."""
    suffix = full_id.rsplit(":", 1)[-1].strip()
    candidates = {suffix, suffix.replace("-", "_"), suffix.replace("_", "-")}
    return {item for item in candidates if item and _LEGACY_CHUNK_REF.match(item)}


def build_source_alias_map(
    chunks: Iterable[dict[str, Any]] | None,
) -> SourceAliasMap:
    """Build unique src_N aliases for this request. Full IDs stay canonical."""
    alias_to_full: dict[str, str] = {}
    full_to_alias: dict[str, str] = {}
    short_owners: dict[str, set[str]] = defaultdict(set)

    for index, chunk in enumerate(chunks or []):
        if not isinstance(chunk, dict):
            continue
        full_id = context_chunk_id(chunk, index)
        alias = f"src_{index + 1}"
        alias_to_full[alias] = full_id
        if full_id not in full_to_alias:
            full_to_alias[full_id] = alias
        for short in _legacy_short_keys(full_id):
            short_owners[short].add(full_id)

    unique_short = {
        key: next(iter(owners))
        for key, owners in short_owners.items()
        if len(owners) == 1
    }
    ambiguous = frozenset(key for key, owners in short_owners.items() if len(owners) > 1)
    return SourceAliasMap(
        alias_to_full=alias_to_full,
        full_to_alias=full_to_alias,
        unique_short=unique_short,
        ambiguous_short=ambiguous,
    )


def format_aliased_chunks(
    chunks: Iterable[dict[str, Any]] | None,
    alias_map: SourceAliasMap,
    *,
    truncate: Callable[[str, int], str],
    per_chunk_chars: int = 800,
) -> str:
    lines: list[str] = []
    for index, chunk in enumerate(chunks or []):
        if not isinstance(chunk, dict):
            continue
        alias = f"src_{index + 1}"
        if alias not in alias_map.alias_to_full:
            continue
        text = truncate(context_chunk_text(chunk), per_chunk_chars)
        lines.append(f"[{alias}]: {text}")
    return "\n\n".join(lines)


def source_alias_retry_hint(alias_map: SourceAliasMap) -> str:
    aliases = alias_map.aliases
    if not aliases:
        return (
            "Không có alias nguồn; để sources rỗng và không điền source_chunk_id."
        )
    listed = ", ".join(aliases)
    return (
        f"Chỉ dùng đúng các alias nguồn sau cho sources[].chunk_id và "
        f"source_chunk_id: {listed}. Sao chép nguyên alias (ví dụ src_1). "
        "Không rút gọn thành chunk_2 hay chunk-2."
    )


def source_alias_init_retry_hint(alias_map: SourceAliasMap) -> str:
    return source_alias_retry_hint(alias_map)


def materialize_init_sources(
    sources: Any,
    alias_map: SourceAliasMap,
    context_chunks: list[dict[str, Any]] | None,
) -> tuple[list[SourceReference], str]:
    """Resolve aliases and store a verbatim excerpt from the cited chunk."""
    normalized, err = normalize_cited_sources(sources, alias_map)
    if err:
        return [], err
    by_id = {
        context_chunk_id(chunk, index): chunk
        for index, chunk in enumerate(context_chunks or [])
    }
    materialized: list[SourceReference] = []
    for source in normalized:
        chunk = by_id.get(source.chunk_id)
        if chunk is None:
            return [], f"chunk_id không thuộc ngữ cảnh: {source.chunk_id}"
        raw = context_chunk_text(chunk)
        haystack = normalize_quote(raw)
        needle = normalize_quote(source.quote)
        if needle and needle in haystack:
            materialized.append(source)
            continue
        excerpt = raw.strip()[:280]
        if not excerpt:
            return [], "Trích dẫn không khớp nội dung nguồn"
        materialized.append(SourceReference(chunk_id=source.chunk_id, quote=excerpt))
    return materialized, ""


def resolve_source_id(
    alias_map: SourceAliasMap,
    raw_id: str | None,
    *,
    field: str = "chunk_id",
) -> tuple[str | None, str]:
    """Map an AI citation to the stored full chunk ID.

    Accepts src_N aliases, already-valid full IDs, and a unique legacy
    chunk_2 / chunk-2 form. Ambiguous short refs are rejected.
    """
    if raw_id is None:
        return None, ""
    key = str(raw_id).strip()
    if not key:
        return None, ""

    full = alias_map.alias_to_full.get(key)
    if full:
        return full, ""
    if key in alias_map.full_to_alias:
        return key, ""
    if key in alias_map.ambiguous_short:
        return None, f"{field} mơ hồ, trùng nhiều nguồn: {key}"
    unique = alias_map.unique_short.get(key)
    if unique:
        return unique, ""
    return None, f"{field} không thuộc ngữ cảnh: {key}"


def normalize_cited_sources(
    sources: Any,
    alias_map: SourceAliasMap,
) -> tuple[list[SourceReference] | list[dict[str, Any]], str]:
    parsed, error = parse_source_references(sources)
    if error:
        return [], error
    assert parsed is not None
    normalized: list[SourceReference] = []
    for source in parsed:
        full_id, err = resolve_source_id(alias_map, source.chunk_id, field="chunk_id")
        if err:
            return [], err
        if not full_id:
            return [], f"chunk_id không thuộc ngữ cảnh: {source.chunk_id}"
        normalized.append(SourceReference(chunk_id=full_id, quote=source.quote))
    return normalized, ""


def _rewrite_source_chunk_field(data: dict[str, Any], alias_map: SourceAliasMap) -> str:
    raw = None
    for key in _SOURCE_CHUNK_KEYS:
        value = data.get(key)
        if value:
            raw = value
            break
    if not raw:
        return ""
    full_id, err = resolve_source_id(alias_map, str(raw), field="source_chunk_id")
    if err:
        return err
    if not full_id:
        return ""
    if "source_chunk_id" in data or "sourceChunkId" not in data:
        data["source_chunk_id"] = full_id
    if "sourceChunkId" in data:
        data["sourceChunkId"] = full_id
    return ""


def normalize_outline_source_ids(
    content: dict[str, Any] | None,
    alias_map: SourceAliasMap,
) -> str:
    """Rewrite source_chunk_id on outline points to full IDs. Does not touch point.id."""
    data = content or {}
    for section in data.get("sections") or []:
        if not isinstance(section, dict):
            continue
        for point in _iter_point_dicts(section.get("points")):
            err = _rewrite_source_chunk_field(point, alias_map)
            if err:
                return err
    return ""


def normalize_turn_source_ids(
    *,
    sources: list[Any] | None,
    outline_ops: list[Any] | None,
    proposals: list[Any] | None,
    alias_map: SourceAliasMap,
) -> tuple[list[dict[str, Any]], list[Any], list[Any], str]:
    """Normalize citations on a conversation turn. Does not touch target_id/section_id."""
    normalized_sources, err = normalize_cited_sources(sources, alias_map)
    if err:
        return [], outline_ops or [], proposals or [], err
    source_dicts: list[dict[str, Any]] = [
        item.model_dump() if isinstance(item, SourceReference) else item
        for item in normalized_sources
    ]

    next_ops: list[Any] = []
    for op in outline_ops or []:
        if isinstance(op, dict):
            data = dict(op)
            err = _rewrite_source_chunk_field(data, alias_map)
            if err:
                return source_dicts, outline_ops or [], proposals or [], err
            next_ops.append(data)
        else:
            next_ops.append(op)

    next_proposals: list[Any] = []
    for proposal in proposals or []:
        if isinstance(proposal, dict):
            data = dict(proposal)
            err = _rewrite_source_chunk_field(data, alias_map)
            if err:
                return source_dicts, next_ops, proposals or [], err
            next_proposals.append(data)
        elif hasattr(proposal, "source_chunk_id"):
            raw = getattr(proposal, "source_chunk_id", None)
            if raw:
                full_id, err = resolve_source_id(
                    alias_map, str(raw), field="source_chunk_id"
                )
                if err:
                    return source_dicts, next_ops, proposals or [], err
                proposal.source_chunk_id = full_id
            next_proposals.append(proposal)
        else:
            next_proposals.append(proposal)
    return source_dicts, next_ops, next_proposals, ""


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


MAX_STORED_POINT_CHARS = 280
MAX_SECTION_CONTENT_CHARS = 1200


def allowed_chunk_ids(available_chunks: Iterable[dict[str, Any]] | set[str]) -> set[str]:
    if isinstance(available_chunks, set):
        return {str(item) for item in available_chunks}
    return {
        context_chunk_id(chunk, index)
        for index, chunk in enumerate(available_chunks or [])
        if isinstance(chunk, dict)
    }


def _validate_stored_text(text: str, *, field: str, max_chars: int) -> tuple[bool, str]:
    value = (text or "").strip()
    if not value:
        return True, ""
    if len(value) > max_chars:
        return False, f"{field} vượt quá {max_chars} ký tự"
    if detect_sample_writing(value, task="turn"):
        return False, f"{field} giống đoạn văn mẫu / viết hộ học sinh"
    return True, ""


def _validate_source_chunk_id(
    chunk_id: str | None, available_chunks: Iterable[dict[str, Any]] | set[str]
) -> tuple[bool, str]:
    if not chunk_id:
        return True, ""
    if str(chunk_id) not in allowed_chunk_ids(available_chunks):
        return False, f"source_chunk_id không thuộc ngữ liệu: {chunk_id}"
    return True, ""


def _iter_point_dicts(raw_points: Any) -> Iterable[dict[str, Any]]:
    for index, item in enumerate(raw_points or []):
        if isinstance(item, str):
            yield {"id": f"p-{index + 1}", "text": item}
        elif isinstance(item, dict):
            yield item


def validate_structured_outline(
    content: dict[str, Any] | None,
    available_chunks: Iterable[dict[str, Any]] | set[str],
) -> tuple[bool, str]:
    """Reject invented sources and sample essays in fields that can be stored."""
    data = content or {}
    ok, err = _validate_stored_text(
        str(data.get("thesis") or ""), field="thesis", max_chars=MAX_STORED_POINT_CHARS
    )
    if not ok:
        return False, err
    for argument in data.get("arguments") or []:
        if not isinstance(argument, dict):
            continue
        ok, err = _validate_stored_text(
            str(argument.get("content") or ""),
            field="argument",
            max_chars=MAX_STORED_POINT_CHARS,
        )
        if not ok:
            return False, err
    for section in data.get("sections") or []:
        if not isinstance(section, dict):
            continue
        ok, err = _validate_stored_text(
            str(section.get("content") or ""),
            field="section.content",
            max_chars=MAX_SECTION_CONTENT_CHARS,
        )
        if not ok:
            return False, err
        for point in _iter_point_dicts(section.get("points")):
            ok, err = _validate_stored_text(
                str(point.get("text") or point.get("content") or ""),
                field="outline point",
                max_chars=MAX_STORED_POINT_CHARS,
            )
            if not ok:
                return False, err
            source_id = point.get("source_chunk_id") or point.get("sourceChunkId")
            ok, err = _validate_source_chunk_id(
                str(source_id) if source_id else None, available_chunks
            )
            if not ok:
                return False, err
    return True, ""


def validate_structured_turn(
    *,
    outline_ops: Iterable[Any] | None,
    proposals: Iterable[Any] | None,
    available_chunks: Iterable[dict[str, Any]] | set[str],
) -> tuple[bool, str]:
    """Validate model-proposed outline mutations and suggestions."""
    for op in outline_ops or []:
        data = op.model_dump() if hasattr(op, "model_dump") else (op if isinstance(op, dict) else {})
        text = str(data.get("text") or "")
        if text:
            ok, err = _validate_stored_text(
                text, field="outline_ops.text", max_chars=MAX_STORED_POINT_CHARS
            )
            if not ok:
                return False, err
        source_id = data.get("source_chunk_id") or data.get("sourceChunkId")
        ok, err = _validate_source_chunk_id(
            str(source_id) if source_id else None, available_chunks
        )
        if not ok:
            return False, err
    for proposal in proposals or []:
        data = (
            proposal.model_dump()
            if hasattr(proposal, "model_dump")
            else (proposal if isinstance(proposal, dict) else {})
        )
        ok, err = _validate_stored_text(
            str(data.get("text") or ""),
            field="proposal",
            max_chars=MAX_STORED_POINT_CHARS,
        )
        if not ok:
            return False, err
        source_id = data.get("source_chunk_id") or data.get("sourceChunkId")
        ok, err = _validate_source_chunk_id(
            str(source_id) if source_id else None, available_chunks
        )
        if not ok:
            return False, err
    return True, ""


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
