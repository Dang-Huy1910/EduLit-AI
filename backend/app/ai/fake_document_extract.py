"""Heuristic DocumentAnalysisResult for FakeAiAdapter. Never calls a provider."""

from __future__ import annotations

import json
import re

from app.ai.schemas import DOCUMENT_EXTRACT_MARKER

_HEADING = re.compile(r"^#{1,3}\s+(.*)$")
_BULLET = re.compile(r"^[\-\*]\s+(.*)$")


def _section(text: str, headings: tuple[str, ...], until: tuple[str, ...] = ()) -> str:
    lower = text.lower()
    best: tuple[int, int] | None = None
    for heading in headings:
        needle = heading.lower()
        idx = lower.find(needle)
        if idx < 0:
            continue
        end = idx + len(needle)
        if best is None or idx < best[0] or (idx == best[0] and end > best[1]):
            best = (idx, end)
    if best is None:
        return ""
    rest = text[best[1] :].lstrip(" \t:.-")
    stop = len(rest)
    lower_rest = rest.lower()
    for heading in until:
        idx = lower_rest.find(heading.lower())
        if idx >= 0:
            stop = min(stop, idx)
    return rest[:stop].strip()


def _parse_locale_number(raw: str) -> float | None:
    text = raw.strip().replace(" ", "").replace("%", "")
    if re.fullmatch(r"-?\d+,\d+", text):
        text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def _parse_rubric_tables(markdown: str) -> list[dict]:
    rows = []
    for line in markdown.splitlines():
        if line.count("|") < 2:
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if not cells or set("".join(cells)) <= set("-: "):
            continue
        rows.append(cells)
    criteria = []
    for cells in rows:
        if not cells:
            continue
        headerish = " ".join(cells).lower()
        if any(token in headerish for token in ("tiêu chí", "tieu chi", "điểm", "diem", "mức")) and not _parse_locale_number(
            cells[-1]
        ):
            continue
        name = cells[0]
        if re.fullmatch(r"c\d+", name.lower()) and len(cells) > 1:
            name = f"{cells[0]} {cells[1]}".strip()
        score = None
        for cell in reversed(cells):
            score = _parse_locale_number(cell)
            if score is not None:
                break
        if score is None:
            continue
        cid = f"C{len(criteria) + 1}"
        levels = [
            {"score": 0, "descriptor": "Chưa đạt: 0 điểm"},
            {"score": score, "descriptor": "Đạt mức tối đa"},
        ]
        criteria.append(
            {
                "id": cid,
                "name": name[:255] or cid,
                "weight": score,
                "guide_note": "",
                "levels": levels,
                "required_elements": [],
                "anti_patterns": [],
                "ambiguous": False,
            }
        )
    if not criteria:
        return []
    max_score = sum(item["weight"] for item in criteria)
    return [
        {
            "id": "rubric-1",
            "title": "Barem nhập từ tài liệu",
            "short_title": "Barem nhập",
            "description": "",
            "max_score": max_score,
            "score_step": 0.25,
            "grade_level": 11,
            "criteria": criteria,
            "warnings": [],
            "ambiguous": False,
        }
    ]


def fake_document_analysis_json(prompt: str) -> str:
    text = prompt
    if DOCUMENT_EXTRACT_MARKER in prompt:
        text = prompt.split(DOCUMENT_EXTRACT_MARKER, 1)[1]
    text = text.replace("<<<", "").replace(">>>", "").strip()
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    title = "Tài liệu nhập"
    for line in lines[:8]:
        heading = _HEADING.match(line)
        candidate = heading.group(1).strip() if heading else line
        if candidate and not candidate.lower().startswith("tài liệu"):
            title = candidate[:255]
            break

    lower = text.lower()
    genre = "NLXH" if any(token in lower for token in ("nlxh", "nghị luận xã hội", "xa hoi")) else "NLVH"
    grade = 11
    for value in (10, 11, 12):
        if re.search(rf"\b(khối|lớp|lop)\s*{value}\b", lower):
            grade = value
            break

    material_content = _section(
        text,
        ("ngữ liệu", "ngu lieu", "văn bản", "van ban"),
        until=("yêu cầu viết", "yeu cau viet", "yêu cầu", "gợi ý", "barem", "tiêu chí"),
    )
    writing_task = _section(
        text,
        ("yêu cầu viết", "yeu cau viet", "yêu cầu", "đề bài"),
        until=("gợi ý", "các ý", "ngữ liệu", "barem", "tiêu chí"),
    )
    extra = _section(
        text,
        ("gợi ý", "các ý", "hướng dẫn", "dàn ý"),
        until=("yêu cầu viết", "ngữ liệu", "barem"),
    )
    bullets = []
    for raw in extra.splitlines():
        match = _BULLET.match(raw)
        item = (match.group(1) if match else raw).strip()
        if item:
            bullets.append(item[:280])
        if len(bullets) >= 8:
            break
    extra_guidance = "\n".join(f"- {item}" for item in bullets)

    constraints = []
    if "so sánh" in lower or "so sanh" in lower:
        constraints.append({"kind": "compare", "text": "Có yêu cầu so sánh/đối chiếu.", "missing": False})
    if re.search(r"\d+\s*(chữ|câu|trang)", lower):
        constraints.append({"kind": "length", "text": "Có ràng buộc độ dài trong yêu cầu viết.", "missing": False})
    if "dẫn chứng" in lower or "dan chung" in lower:
        constraints.append({"kind": "evidence", "text": "Yêu cầu dẫn chứng từ ngữ liệu.", "missing": False})
    constraints.append({"kind": "genre", "text": f"Dạng bài {genre}.", "missing": False})

    rubrics = _parse_rubric_tables(text)
    materials = []
    if material_content:
        materials.append(
            {
                "id": "mat-1",
                "title": title,
                "author": "",
                "source_info": "Nhập từ tài liệu giáo viên",
                "content": material_content[:80000],
                "warnings": ["Chưa có tác giả trong tài liệu."] if "tác giả" not in lower else [],
            }
        )
    elif len(text) > 80 and not writing_task and not rubrics:
        materials.append(
            {
                "id": "mat-1",
                "title": title,
                "author": "",
                "source_info": "Nhập từ tài liệu giáo viên",
                "content": text[:80000],
                "warnings": [],
            }
        )

    prompts = []
    if writing_task or extra_guidance:
        summary = writing_task.split(".")[0][:240] if writing_task else title
        prompts.append(
            {
                "id": "prompt-1",
                "title": title,
                "writing_task": writing_task or "Viết bài nghị luận bám sát ngữ liệu đã nhập.",
                "writing_task_summary": summary,
                "extra_guidance": extra_guidance,
                "genre": genre,
                "grade_level": grade,
                "constraints": constraints,
                "linked_material_ids": ["mat-1"] if materials else [],
                "warnings": [],
            }
        )

    kinds = []
    if materials:
        kinds.append("MATERIAL")
    if prompts:
        kinds.append("PROMPT")
    if rubrics:
        kinds.append("RUBRIC")
    document_kind = kinds[0] if len(kinds) == 1 else "MIXED"
    missing = []
    if not materials:
        missing.append("materials")
    if not prompts:
        missing.append("writingTask")
    payload = {
        "document_kind": document_kind if kinds else "MIXED",
        "materials": materials,
        "prompts": prompts,
        "rubrics": rubrics,
        "warnings": [],
        "missing": missing,
    }
    return json.dumps(payload, ensure_ascii=False)
