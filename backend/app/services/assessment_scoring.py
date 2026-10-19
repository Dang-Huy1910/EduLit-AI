"""Validate AI/teacher rubric scores against the frozen assignment rubric.

Server totals use Decimal. Evidence quotes are taken from the confirmed
transcription, not from model-copied text.
"""

from __future__ import annotations

import hashlib
from decimal import Decimal
from typing import Any

from app.ai.schemas import AssessmentOutput
from app.core.errors import DomainError
from app.services.rubric import (
    decimal_to_number,
    parse_score,
    scale10,
    score_follows_step,
    validate_rubric_payload,
)


class AssessmentInvalidOutput(DomainError):
    def __init__(self, message: str) -> None:
        super().__init__("AI_INVALID_OUTPUT", message)


def transcription_index(pages: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for page in pages or []:
        if not isinstance(page, dict):
            continue
        page_id = str(page.get("pageId") or "")
        page_index = int(page.get("pageIndex") or 0)
        for segment in page.get("segments") or []:
            if not isinstance(segment, dict):
                continue
            segment_id = str(segment.get("segmentId") or "")
            if not segment_id:
                continue
            index[segment_id] = {
                "pageId": page_id,
                "pageIndex": page_index,
                "segmentId": segment_id,
                "order": int(segment.get("order") or 0),
                "text": str(segment.get("text") or ""),
            }
    return index


def _quotes(segment_ids: list[str], index: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in segment_ids or []:
        sid = str(raw or "").strip()
        if not sid or sid in seen:
            continue
        seen.add(sid)
        item = index.get(sid)
        if item is None:
            raise AssessmentInvalidOutput(f"Bằng chứng trỏ tới đoạn không có trong bản chép ({sid}).")
        out.append(
            {
                "pageId": item["pageId"],
                "pageIndex": item["pageIndex"],
                "segmentId": item["segmentId"],
                "order": item["order"],
                "quote": item["text"],
            }
        )
    return out


def issue_occurrence_id(criterion_id: str, code: str, kind: str, segment_ids: list[str]) -> str:
    segs = ",".join(sorted({str(item).strip() for item in segment_ids if str(item).strip()}))
    raw = f"{criterion_id}|{code}|{kind}|{segs}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def _issue_segment_ids(issue: Any) -> list[str]:
    if hasattr(issue, "segment_ids"):
        raw = list(issue.segment_ids or [])
    elif isinstance(issue, dict):
        if issue.get("evidence"):
            raw = [
                str(ev.get("segmentId") or "")
                for ev in issue.get("evidence") or []
                if isinstance(ev, dict)
            ]
            raw = [item for item in raw if item] or list(
                issue.get("segmentIds") or issue.get("segment_ids") or []
            )
        else:
            raw = list(issue.get("segmentIds") or issue.get("segment_ids") or [])
    else:
        raw = []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        sid = str(item or "").strip()
        if not sid or sid in seen:
            continue
        seen.add(sid)
        out.append(sid)
    return out


def _clean_strings(values: Any, *, limit: int = 12, max_len: int = 500) -> list[str]:
    if not isinstance(values, list):
        return []
    out: list[str] = []
    for item in values:
        if not isinstance(item, str):
            continue
        text = item.strip()
        if not text:
            continue
        out.append(text[:max_len])
        if len(out) >= limit:
            break
    return out


def rubric_from_revision(revision_rubric: dict[str, Any] | None, snapshot: dict[str, Any] | None) -> dict[str, Any]:
    raw = None
    if isinstance(snapshot, dict) and snapshot.get("rubric"):
        raw = snapshot.get("rubric")
    elif isinstance(revision_rubric, dict) and revision_rubric:
        raw = revision_rubric
    if not isinstance(raw, dict):
        raise AssessmentInvalidOutput("Bài tập chưa có barem đã chốt để chấm.")
    try:
        return validate_rubric_payload(raw)
    except DomainError as exc:
        raise AssessmentInvalidOutput(exc.message) from exc


def finalize_payload(
    *,
    rubric: dict[str, Any],
    output: AssessmentOutput | dict[str, Any],
    pages: list[dict[str, Any]],
    overall_comment: str | None = None,
    improvement_guidance: list[str] | None = None,
) -> dict[str, Any]:
    """Build a stored/API payload. Raises AssessmentInvalidOutput on bad scores/evidence."""
    if isinstance(output, AssessmentOutput):
        criteria_in = output.criteria
        overall = (overall_comment if overall_comment is not None else output.overall_comment) or ""
        guidance = (
            improvement_guidance
            if improvement_guidance is not None
            else list(output.improvement_guidance or [])
        )
    else:
        criteria_in = output.get("criteria") or output.get("evaluations") or []
        overall = overall_comment if overall_comment is not None else str(output.get("overallComment") or "")
        guidance = (
            improvement_guidance
            if improvement_guidance is not None
            else list(output.get("improvementGuidance") or [])
        )

    expected = [item["id"] for item in rubric["criteria"]]
    expected_set = set(expected)
    parsed: list[dict[str, Any]] = []
    seen: set[str] = set()
    index = transcription_index(pages)

    for item in criteria_in:
        if isinstance(item, dict):
            cid = str(item.get("criterion_id") or item.get("criterionId") or "").strip()
            awarded_raw = item.get("awarded_score", item.get("awardedScore"))
            comment = str(item.get("comment") or "")
            strengths = item.get("strengths") or []
            weaknesses = item.get("weaknesses") or []
            missing = item.get("missing_elements") or item.get("missingElements") or []
            issues_raw = item.get("issues") or []
            evidence_ids = item.get("evidence_segment_ids") or item.get("evidenceSegmentIds") or []
        else:
            cid = str(item.criterion_id).strip()
            awarded_raw = item.awarded_score
            comment = item.comment
            strengths = item.strengths
            weaknesses = item.weaknesses
            missing = item.missing_elements
            issues_raw = item.issues
            evidence_ids = item.evidence_segment_ids
        if not cid:
            raise AssessmentInvalidOutput("Thiếu mã tiêu chí trong kết quả chấm.")
        if cid in seen:
            raise AssessmentInvalidOutput(f"Trùng mã tiêu chí {cid}.")
        seen.add(cid)
        parsed.append(
            {
                "criterionId": cid,
                "awarded": awarded_raw,
                "comment": comment,
                "strengths": strengths,
                "weaknesses": weaknesses,
                "missing": missing,
                "issues": issues_raw,
                "evidenceIds": evidence_ids,
            }
        )

    if seen != expected_set:
        missing_ids = sorted(expected_set - seen)
        extra_ids = sorted(seen - expected_set)
        raise AssessmentInvalidOutput(
            "Danh sách tiêu chí không khớp barem đã giao"
            + (f" (thiếu {', '.join(missing_ids)})" if missing_ids else "")
            + (f" (thừa {', '.join(extra_ids)})" if extra_ids else "")
            + "."
        )

    by_id = {row["criterionId"]: row for row in parsed}
    spec_by_id = {item["id"]: item for item in rubric["criteria"]}
    score_step = parse_score(rubric["scoreStep"], "scoreStep")
    max_score = parse_score(rubric["maxScore"], "maxScore")
    evaluations: list[dict[str, Any]] = []
    total = Decimal("0")
    seen_occurrence_ids: set[str] = set()

    for cid in expected:
        spec = spec_by_id[cid]
        row = by_id[cid]
        weight = parse_score(spec["weight"], f"weight {cid}")
        awarded = parse_score(row["awarded"], f"điểm {cid}")
        if awarded < 0 or awarded > weight:
            raise AssessmentInvalidOutput(
                f"Điểm {cid} phải trong khoảng 0–{decimal_to_number(weight)}."
            )
        if not score_follows_step(awarded, score_step):
            raise AssessmentInvalidOutput(
                f"Điểm {cid} phải theo bước {decimal_to_number(score_step)}."
            )
        evidence = _quotes([str(v) for v in row["evidenceIds"] or []], index)
        issues: list[dict[str, Any]] = []
        for issue in row["issues"] or []:
            if hasattr(issue, "code"):
                code = issue.code
                kind = issue.kind
                message = issue.message
                source = "ai"
            elif isinstance(issue, dict):
                code = str(issue.get("code") or "").strip().upper()
                kind = str(issue.get("kind") or "located")
                message = str(issue.get("message") or "").strip()
                source = str(issue.get("source") or "ai").strip() or "ai"
            else:
                continue
            if kind not in {"located", "missing"}:
                raise AssessmentInvalidOutput(f"Loại lỗi không hợp lệ trên {cid}.")
            if not code or not message:
                raise AssessmentInvalidOutput(f"Lỗi trên {cid} thiếu mã hoặc mô tả.")
            segs = _issue_segment_ids(issue)
            occurrence_id = issue_occurrence_id(cid, code, kind, segs if kind == "located" else [])
            if occurrence_id in seen_occurrence_ids:
                continue
            seen_occurrence_ids.add(occurrence_id)
            if kind == "missing":
                issues.append(
                    {
                        "occurrenceId": occurrence_id,
                        "code": code,
                        "kind": "missing",
                        "message": message[:500],
                        "source": source if source in {"ai", "teacher"} else "ai",
                        "evidence": [],
                    }
                )
                continue
            quotes = _quotes(segs, index)
            if not quotes:
                raise AssessmentInvalidOutput(
                    f"Lỗi có vị trí trên {cid} phải trỏ tới đoạn trong bản chép."
                )
            issues.append(
                {
                    "occurrenceId": occurrence_id,
                    "code": code,
                    "kind": "located",
                    "message": message[:500],
                    "source": source if source in {"ai", "teacher"} else "ai",
                    "evidence": quotes,
                }
            )
        evaluations.append(
            {
                "criterionId": cid,
                "criterionName": spec["name"],
                "awardedScore": decimal_to_number(awarded),
                "maxScore": decimal_to_number(weight),
                "comment": str(row["comment"] or "").strip()[:4000],
                "strengths": _clean_strings(row["strengths"]),
                "weaknesses": _clean_strings(row["weaknesses"]),
                "missingElements": _clean_strings(row["missing"]),
                "issues": issues,
                "evidence": evidence,
            }
        )
        total += awarded

    computed_scale = scale10(total, max_score)
    return {
        "evaluations": evaluations,
        "overallComment": str(overall or "").strip()[:4000],
        "improvementGuidance": _clean_strings(guidance, limit=8, max_len=500),
        "totalScore": decimal_to_number(total),
        "maxScore": decimal_to_number(max_score),
        "scoreStep": decimal_to_number(score_step),
        "scoreScale10": decimal_to_number(computed_scale),
    }


def apply_teacher_overlay(
    *,
    rubric: dict[str, Any],
    base_payload: dict[str, Any],
    body: dict[str, Any],
    pages: list[dict[str, Any]],
) -> dict[str, Any]:
    """Merge teacher edits onto AI payload then re-validate scores."""
    base_evals = {item["criterionId"]: dict(item) for item in base_payload.get("evaluations") or []}
    edits = body.get("evaluations") or body.get("criteria") or []
    merged: list[dict[str, Any]] = []
    for spec in rubric["criteria"]:
        cid = spec["id"]
        current = dict(base_evals.get(cid) or {})
        patch = next(
            (
                item
                for item in edits
                if isinstance(item, dict)
                and str(item.get("criterionId") or item.get("criterion_id") or "") == cid
            ),
            None,
        )
        if patch:
            if "awardedScore" in patch or "awarded_score" in patch:
                current["awardedScore"] = patch.get("awardedScore", patch.get("awarded_score"))
            if "comment" in patch:
                current["comment"] = patch.get("comment")
            if "strengths" in patch:
                current["strengths"] = patch.get("strengths")
            if "weaknesses" in patch:
                current["weaknesses"] = patch.get("weaknesses")
            if "missingElements" in patch or "missing_elements" in patch:
                current["missingElements"] = patch.get("missingElements", patch.get("missing_elements"))
            if "issues" in patch:
                current["issues"] = patch.get("issues")
                current["_issuesPatched"] = True
        merged.append(
            {
                "criterionId": cid,
                "awardedScore": current.get("awardedScore"),
                "comment": current.get("comment") or "",
                "strengths": current.get("strengths") or [],
                "weaknesses": current.get("weaknesses") or [],
                "missingElements": current.get("missingElements") or [],
                "issues": [
                    {
                        **issue,
                        "segmentIds": [
                            ev.get("segmentId")
                            for ev in (issue.get("evidence") or [])
                            if isinstance(ev, dict)
                        ]
                        or issue.get("segmentIds")
                        or issue.get("segment_ids")
                        or [],
                    }
                    if isinstance(issue, dict)
                    else issue
                    for issue in (current.get("issues") or [])
                ],
                "evidenceSegmentIds": [
                    ev.get("segmentId")
                    for ev in (current.get("evidence") or [])
                    if isinstance(ev, dict)
                ],
            }
        )
    overall = body.get("overallComment", body.get("overall_comment", base_payload.get("overallComment")))
    guidance = body.get(
        "improvementGuidance",
        body.get("improvement_guidance", base_payload.get("improvementGuidance")),
    )
    finalized = finalize_payload(
        rubric=rubric,
        output={"criteria": merged, "overallComment": overall, "improvementGuidance": guidance},
        pages=pages,
        overall_comment=str(overall or ""),
        improvement_guidance=list(guidance or []),
    )
    patched_ids = {
        spec["id"]
        for spec in rubric["criteria"]
        if (by := next(
            (
                item
                for item in edits
                if isinstance(item, dict)
                and str(item.get("criterionId") or item.get("criterion_id") or "") == spec["id"]
            ),
            None,
        ))
        and "issues" in by
    }
    for item in finalized["evaluations"]:
        cid = item["criterionId"]
        if cid not in patched_ids:
            original = base_evals.get(cid) or {}
            orig_issues = original.get("issues")
            if isinstance(orig_issues, list):
                item["issues"] = orig_issues
        else:
            for issue in item.get("issues") or []:
                issue["source"] = "teacher"
    return finalized
