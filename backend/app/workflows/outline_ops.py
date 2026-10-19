"""Constrained outline mutations. Applied by the service, never by the model."""

from __future__ import annotations

import copy
import re
import uuid
from typing import Any

from app.ai.schemas import OutlineOp, OutlinePoint, OutlineProposal

MAX_POINT_CHARS = 280
MAX_POINTS_PER_SECTION = 12
CANONICAL_SECTION_IDS = ("intro", "body", "conclusion")
SECTION_ALIASES = {
    "intro": "intro",
    "mở bài": "intro",
    "mo bai": "intro",
    "opening": "intro",
    "body": "body",
    "thân bài": "body",
    "than bai": "body",
    "conclusion": "conclusion",
    "kết bài": "conclusion",
    "ket bai": "conclusion",
}

DEFAULT_SECTION_TITLES = {
    "intro": "I. Mở bài — Đặt vấn đề",
    "body": "II. Thân bài — Triển khai luận điểm",
    "conclusion": "III. Kết bài — Đánh giá & Thông điệp",
}


class OutlineOpError(Exception):
    def __init__(self, message: str, code: str = "OUTLINE_OP_INVALID"):
        self.message = message
        self.code = code
        super().__init__(message)


def _new_point_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def canonicalize_section_id(value: str | None) -> str | None:
    if not value:
        return None
    key = re.sub(r"\s+", " ", value).strip().lower()
    if key in SECTION_ALIASES:
        return SECTION_ALIASES[key]
    # "I. Mở bài — Đặt vấn đề"
    for alias, sid in SECTION_ALIASES.items():
        if alias in key:
            return sid
    return value.strip() or None


def _as_point(raw: Any, fallback_id: str) -> dict[str, Any]:
    if isinstance(raw, OutlinePoint):
        return raw.model_dump()
    if isinstance(raw, str):
        text = raw.strip()
        return {"id": fallback_id, "text": text, "kind": "claim", "source_chunk_id": None}
    if isinstance(raw, dict):
        text = str(raw.get("text") or raw.get("content") or "").strip()
        kind = raw.get("kind") or "claim"
        if kind not in {"claim", "evidence", "note"}:
            kind = "claim"
        return {
            "id": str(raw.get("id") or fallback_id),
            "text": text,
            "kind": kind,
            "source_chunk_id": raw.get("source_chunk_id") or raw.get("sourceChunkId"),
        }
    return {"id": fallback_id, "text": str(raw).strip(), "kind": "claim", "source_chunk_id": None}


def empty_outline(thesis: str = "") -> dict[str, Any]:
    return {
        "thesis": thesis,
        "sections": [
            {"id": sid, "title": DEFAULT_SECTION_TITLES[sid], "points": []}
            for sid in CANONICAL_SECTION_IDS
        ],
        "arguments": [],
        "counterArguments": [],
    }


def normalize_outline_content(content: dict[str, Any] | None) -> dict[str, Any]:
    """Coerce stored/AI/UI outline JSON into a canonical shape.

    Accepts legacy `points: string[]` and object points. Always returns
    object points with stable ids. Unknown extra keys are preserved.
    """
    data = copy.deepcopy(content) if isinstance(content, dict) else {}
    thesis = data.get("thesis")
    if thesis is not None:
        data["thesis"] = str(thesis).strip()

    raw_sections = data.get("sections") or []
    if not isinstance(raw_sections, list):
        raw_sections = []

    by_id: dict[str, dict[str, Any]] = {}
    extras: list[dict[str, Any]] = []
    for index, raw in enumerate(raw_sections):
        if not isinstance(raw, dict):
            continue
        sid = canonicalize_section_id(str(raw.get("id") or "")) or f"section-{index + 1}"
        title = str(raw.get("title") or DEFAULT_SECTION_TITLES.get(sid, sid))
        points_in = raw.get("points") or []
        if not isinstance(points_in, list):
            points_in = []
        points = [
            _as_point(item, f"{sid}-{i + 1}")
            for i, item in enumerate(points_in)
            if str(item).strip()
        ]
        section = {**raw, "id": sid, "title": title, "points": points}
        if sid in CANONICAL_SECTION_IDS and sid not in by_id:
            by_id[sid] = section
        else:
            extras.append(section)

    sections: list[dict[str, Any]] = []
    for sid in CANONICAL_SECTION_IDS:
        if sid in by_id:
            sections.append(by_id[sid])
        else:
            sections.append(
                {"id": sid, "title": DEFAULT_SECTION_TITLES[sid], "points": []}
            )
    sections.extend(extras)
    data["sections"] = sections
    if "arguments" not in data or not isinstance(data.get("arguments"), list):
        data["arguments"] = []
    if "counterArguments" not in data or not isinstance(data.get("counterArguments"), list):
        data["counterArguments"] = data.get("counter_arguments") or []
    return data


def find_point(
    content: dict[str, Any], target_id: str | None, section_id: str | None = None
) -> tuple[dict[str, Any] | None, int | None, dict[str, Any] | None]:
    """Return (point, index, section) or (None, None, None)."""
    if not target_id:
        return None, None, None
    sections = content.get("sections") or []
    matches: list[tuple[dict[str, Any], int, dict[str, Any]]] = []
    wanted_section = canonicalize_section_id(section_id) if section_id else None
    for section in sections:
        if wanted_section and section.get("id") != wanted_section:
            continue
        for index, point in enumerate(section.get("points") or []):
            if str(point.get("id")) == str(target_id):
                matches.append((point, index, section))
    if len(matches) == 1:
        return matches[0]
    return None, None, None


def find_section(content: dict[str, Any], section_id: str | None) -> dict[str, Any] | None:
    sid = canonicalize_section_id(section_id)
    if not sid:
        return None
    for section in content.get("sections") or []:
        if section.get("id") == sid:
            return section
    return None


def op_is_complete(op: OutlineOp, selected_point: dict[str, Any] | None) -> bool:
    if op.op == "add":
        return bool(canonicalize_section_id(op.section_id) and (op.text or "").strip())
    if op.op == "update":
        return bool((op.target_id or (selected_point or {}).get("id")) and (op.text or "").strip())
    if op.op == "delete":
        return bool(op.target_id or (selected_point or {}).get("id"))
    return False


def bind_ops_to_selection(
    ops: list[OutlineOp], selected_point: dict[str, Any] | None
) -> list[OutlineOp]:
    if not selected_point:
        return ops
    bound: list[OutlineOp] = []
    for op in ops:
        data = op.model_dump()
        if op.op in {"update", "delete"} and not op.target_id:
            data["target_id"] = selected_point.get("id")
            data["section_id"] = data.get("section_id") or selected_point.get("section_id")
        if op.op == "add" and not op.section_id:
            data["section_id"] = selected_point.get("section_id")
        bound.append(OutlineOp.model_validate(data))
    return bound


def describe_op(op: OutlineOp) -> dict[str, Any]:
    return {
        "op": op.op,
        "targetId": op.target_id,
        "sectionId": canonicalize_section_id(op.section_id),
        "text": (op.text or "").strip() or None,
        "kind": op.kind,
    }


def apply_outline_ops(
    content: dict[str, Any] | None,
    ops: list[OutlineOp],
    *,
    selected_point: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Apply constrained ops. Raises OutlineOpError if any op is ambiguous."""
    if not ops:
        return normalize_outline_content(content), []

    current = normalize_outline_content(content)
    applied: list[dict[str, Any]] = []
    bound = bind_ops_to_selection(ops, selected_point)

    for op in bound:
        if not op_is_complete(op, selected_point):
            raise OutlineOpError("Thao tác dàn ý thiếu đối tượng hoặc nội dung", "OUTLINE_OP_AMBIGUOUS")
        section = find_section(current, op.section_id) if op.section_id else None
        if op.op == "add":
            if section is None:
                raise OutlineOpError("Không xác định được phần dàn ý để thêm ý", "OUTLINE_OP_AMBIGUOUS")
            text = (op.text or "").strip()
            if len(text) > MAX_POINT_CHARS:
                raise OutlineOpError("Ý dàn ý vượt quá độ dài cho phép", "OUTLINE_OP_INVALID")
            points: list[dict[str, Any]] = list(section.get("points") or [])
            if len(points) >= MAX_POINTS_PER_SECTION:
                raise OutlineOpError("Phần dàn ý đã đủ số ý tối đa", "OUTLINE_OP_INVALID")
            if any(str(p.get("text", "")).strip() == text for p in points):
                continue
            new_id = _new_point_id(str(section["id"]))
            point = {
                "id": new_id,
                "text": text,
                "kind": op.kind or "claim",
                "source_chunk_id": None,
            }
            insert_at = len(points)
            if op.after_point_id:
                for i, existing in enumerate(points):
                    if existing.get("id") == op.after_point_id:
                        insert_at = i + 1
                        break
            points.insert(insert_at, point)
            section["points"] = points
            applied.append({**describe_op(op), "targetId": new_id, "sectionId": section["id"]})
            continue

        point, index, found_section = find_point(current, op.target_id, op.section_id)
        if point is None or found_section is None or index is None:
            raise OutlineOpError("Không xác định được ý cần sửa/xóa", "OUTLINE_OP_AMBIGUOUS")
        if op.op == "update":
            text = (op.text or "").strip()
            if len(text) > MAX_POINT_CHARS:
                raise OutlineOpError("Ý dàn ý vượt quá độ dài cho phép", "OUTLINE_OP_INVALID")
            point["text"] = text
            if op.kind:
                point["kind"] = op.kind
            found_section["points"][index] = point
            applied.append(
                {**describe_op(op), "targetId": point["id"], "sectionId": found_section["id"]}
            )
        elif op.op == "delete":
            del found_section["points"][index]
            applied.append(
                {**describe_op(op), "targetId": point["id"], "sectionId": found_section["id"]}
            )
    return current, applied


def proposals_as_dicts(proposals: list[OutlineProposal] | list[dict]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for item in proposals or []:
        if isinstance(item, OutlineProposal):
            data = item.model_dump()
        elif isinstance(item, dict):
            data = dict(item)
        else:
            continue
        sid = canonicalize_section_id(str(data.get("section_id") or data.get("sectionId") or ""))
        text = str(data.get("text") or "").strip()
        if not sid or not text:
            continue
        result.append(
            {
                "sectionId": sid,
                "text": text[:MAX_POINT_CHARS],
                "kind": data.get("kind") or "claim",
                "sourceChunkId": data.get("source_chunk_id") or data.get("sourceChunkId"),
            }
        )
    return result


def assignment_has_essential_context(
    title: str | None,
    instructions: dict[str, Any] | None,
    context_chunks: list | None,
    rubric: dict[str, Any] | None,
) -> bool:
    has_title = bool((title or "").strip())
    instr = instructions or {}
    has_task = bool(instr) and any(str(v).strip() for v in instr.values() if v is not None)
    chunks = context_chunks or []
    has_chunks = any(
        str(c.get("text") or c.get("content") or "").strip()
        for c in chunks
        if isinstance(c, dict)
    )
    has_rubric = bool(rubric)
    return has_title and (has_task or has_chunks or has_rubric)


def validate_init_points(content: dict[str, Any]) -> tuple[bool, str]:
    sections = content.get("sections") or []
    if not isinstance(sections, list) or not sections:
        return False, "Dàn ý thiếu các phần"
    ids = {str(s.get("id")) for s in sections if isinstance(s, dict)}
    if not {"intro", "body", "conclusion"} <= ids:
        return False, "Dàn ý phải có mở bài, thân bài, kết bài"
    for section in sections:
        if not isinstance(section, dict):
            continue
        points = section.get("points") or []
        if not points:
            return False, f"Phần {section.get('id')} chưa có ý"
        for point in points:
            text = str(point.get("text") if isinstance(point, dict) else point)
            if len(text) > MAX_POINT_CHARS:
                return False, "Có ý dàn ý quá dài, giống đoạn văn mẫu"
    thesis = str(content.get("thesis") or "").strip()
    if not thesis:
        return False, "Dàn ý thiếu luận đề"
    return True, ""
