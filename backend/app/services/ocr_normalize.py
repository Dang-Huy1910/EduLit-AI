"""Assign stable page/segment IDs and copy OCR into a student draft."""

from __future__ import annotations

import copy
import uuid
from typing import Any

from app.ai.schemas import OcrPageModel


def public_segment(raw: dict[str, Any]) -> dict[str, Any]:
    confidence = raw.get("confidence")
    if confidence is not None:
        try:
            confidence = float(confidence)
        except (TypeError, ValueError):
            confidence = None
        else:
            if confidence < 0 or confidence > 1:
                confidence = None
    source = "model-self-report" if confidence is not None else "unavailable"
    return {
        "segmentId": raw.get("segmentId") or "",
        "order": int(raw.get("order") or 0),
        "text": str(raw.get("text") or ""),
        "needsReview": bool(raw.get("needsReview")),
        "reviewReason": raw.get("reviewReason") or None,
        "confidence": confidence,
        "confidenceSource": source,
    }


def public_page(raw: dict[str, Any]) -> dict[str, Any]:
    segments = [public_segment(item) for item in raw.get("segments") or [] if isinstance(item, dict)]
    return {
        "pageId": raw.get("pageId") or "",
        "pageIndex": int(raw.get("pageIndex") or 0),
        "needsReview": bool(raw.get("needsReview")) or any(s["needsReview"] for s in segments),
        "reviewReason": raw.get("reviewReason") or None,
        "segments": segments,
    }


def materialize_page(
    *,
    page_id: uuid.UUID,
    page_index: int,
    model_page: OcrPageModel,
) -> dict[str, Any]:
    segments: list[dict[str, Any]] = []
    for offset, segment in enumerate(model_page.segments, start=1):
        order = int(segment.order or offset)
        segments.append(
            {
                "segmentId": f"{page_id}:s{order}",
                "order": order,
                "text": segment.text or "",
                "needsReview": bool(segment.needs_review),
                "reviewReason": segment.review_reason,
                "confidence": segment.confidence,
                "confidenceSource": (
                    "model-self-report" if segment.confidence is not None else "unavailable"
                ),
            }
        )
    if not segments:
        segments.append(
            {
                "segmentId": f"{page_id}:s1",
                "order": 1,
                "text": "[không rõ]",
                "needsReview": True,
                "reviewReason": "Trang không có dòng đọc được.",
                "confidence": None,
                "confidenceSource": "unavailable",
            }
        )
    page_needs = bool(model_page.needs_review) or any(item["needsReview"] for item in segments)
    return {
        "pageId": str(page_id),
        "pageIndex": page_index,
        "needsReview": page_needs,
        "reviewReason": model_page.review_reason,
        "segments": segments,
    }


def clone_pages(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return copy.deepcopy(pages)


def apply_segment_edits(
    current_pages: list[dict[str, Any]],
    edits: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for page in edits:
        if not isinstance(page, dict):
            continue
        for segment in page.get("segments") or []:
            if not isinstance(segment, dict):
                continue
            sid = str(segment.get("segmentId") or "")
            if sid:
                by_id[sid] = segment
    next_pages = clone_pages(current_pages)
    for page in next_pages:
        for segment in page.get("segments") or []:
            incoming = by_id.get(str(segment.get("segmentId") or ""))
            if incoming is None:
                continue
            if "text" in incoming:
                segment["text"] = str(incoming.get("text") or "")
            if "needsReview" in incoming:
                segment["needsReview"] = bool(incoming.get("needsReview"))
            if "reviewReason" in incoming:
                reason = incoming.get("reviewReason")
                segment["reviewReason"] = str(reason) if reason else None
        page["needsReview"] = any(bool(s.get("needsReview")) for s in page.get("segments") or [])
    return next_pages
