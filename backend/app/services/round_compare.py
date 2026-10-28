"""Pure comparisons of published round snapshots, matched by criterion ID."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.services.rubric import decimal_to_number


def score_delta(previous: Any, current: Any) -> int | float | None:
    if previous is None or current is None:
        return None
    return decimal_to_number(Decimal(str(current)) - Decimal(str(previous)))


def compare_rounds(previous: dict[str, Any], current: dict[str, Any]) -> dict[str, Any]:
    """Missing criteria have no delta; an absent score must never count as zero."""
    before = {item["criterionId"]: item for item in previous.get("evaluations") or []}
    after = {item["criterionId"]: item for item in current.get("evaluations") or []}
    criteria = []
    for criterion_id in dict.fromkeys([*before, *after]):
        old = before.get(criterion_id)
        new = after.get(criterion_id)
        criteria.append({
            "criterionId": criterion_id,
            "criterionName": (new or old).get("criterionName") or criterion_id,
            "previousScore": old.get("awardedScore") if old else None,
            "currentScore": new.get("awardedScore") if new else None,
            "previousMaxScore": old.get("maxScore") if old else None,
            "currentMaxScore": new.get("maxScore") if new else None,
            "delta": score_delta(old.get("awardedScore"), new.get("awardedScore")) if old and new else None,
            "status": "matched" if old and new else "added" if new else "removed",
        })
    return {
        "previousRound": previous["round"],
        "currentRound": current["round"],
        "totalScoreDelta": score_delta(previous.get("totalScore"), current.get("totalScore")),
        "scoreScale10Delta": score_delta(previous.get("scoreScale10"), current.get("scoreScale10")),
        "criteria": criteria,
    }
