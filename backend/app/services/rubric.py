"""Rubric import/validation.

`weight` is the criterion maximum, not a multiplier. Sum of weights must
equal the rubric maxScore. Score step is taken from the rubric, not hardcoded
to 4.0.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from app.core.errors import DomainError

TWO_PLACES = Decimal("0.01")
ALLOWED_GRADE_LEVELS = {10, 11, 12}
DEFAULT_SCORE_STEP = Decimal("0.25")


def _coerce_number_string(value: str) -> str:
    """Vietnamese decimal comma (`2,5`, `0,0`) without treating thousands groups."""
    text = value.strip().replace(" ", "").replace("\u00a0", "")
    if re.fullmatch(r"-?\d+,\d+", text):
        return text.replace(",", ".")
    return text


def _as_finite_decimal(value: Any, field: str) -> Decimal:
    if isinstance(value, bool) or value is None:
        raise DomainError("RUBRIC_SHAPE", f"{field} phải là số.")
    try:
        if isinstance(value, Decimal):
            number = value
        elif isinstance(value, str):
            number = Decimal(_coerce_number_string(value))
        else:
            number = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise DomainError("RUBRIC_SHAPE", f"{field} phải là số.") from exc
    if not number.is_finite():
        raise DomainError("RUBRIC_SHAPE", f"{field} phải là số hữu hạn.")
    return number.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def _as_decimal(value: Any, field: str) -> Decimal:
    number = _as_finite_decimal(value, field)
    if number <= 0:
        raise DomainError("RUBRIC_WEIGHT", f"{field} phải lớn hơn 0.")
    return number


def _as_level_score(value: Any, field: str, *, max_score: Decimal) -> Decimal:
    number = _as_finite_decimal(value, field)
    if number < 0:
        raise DomainError("RUBRIC_LEVEL_SCORE", f"{field} không được âm.")
    if number > max_score:
        raise DomainError(
            "RUBRIC_LEVEL_SCORE",
            f"{field} không được vượt điểm tối đa của tiêu chí.",
        )
    return number


def _as_nonempty(value: Any, field: str, *, max_len: int = 255) -> str:
    if not isinstance(value, str) or not value.strip():
        raise DomainError("RUBRIC_SHAPE", f"{field} không được để trống.")
    text = value.strip()
    if len(text) > max_len:
        raise DomainError("RUBRIC_SHAPE", f"{field} vượt quá độ dài cho phép.")
    return text


def _multiple_of_step(value: Decimal, step: Decimal) -> bool:
    if step <= 0:
        return False
    quotient = (value / step).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return (quotient * step).quantize(TWO_PLACES) == value.quantize(TWO_PLACES)


def decimal_to_number(value: Decimal) -> float:
    return float(value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP))


def parse_score(value: Any, field: str) -> Decimal:
    """Finite decimal, may be zero. Used when validating awarded scores."""
    return _as_finite_decimal(value, field)


def score_follows_step(value: Decimal, step: Decimal) -> bool:
    return _multiple_of_step(value, step)


def scale10(total: Decimal, max_score: Decimal) -> Decimal:
    if max_score <= 0:
        raise DomainError("RUBRIC_WEIGHT", "maxScore phải lớn hơn 0.")
    return (total / max_score * Decimal("10")).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def validate_rubric_payload(payload: Any) -> dict[str, Any]:
    """Validate a catalog/assignment rubric document. Returns a canonical dict."""
    if not isinstance(payload, dict):
        raise DomainError("RUBRIC_SHAPE", "Barem phải là một đối tượng JSON.")

    title = _as_nonempty(payload.get("title") or payload.get("name") or "", "title")
    short_title = str(payload.get("shortTitle") or payload.get("short_title") or title).strip()[:128]
    description = str(payload.get("description") or "").strip()
    version_label = str(payload.get("version") or "v1").strip()[:32] or "v1"

    grade_raw = payload.get("gradeLevel", payload.get("grade_level", 11))
    try:
        grade_level = int(grade_raw)
    except (TypeError, ValueError) as exc:
        raise DomainError("GRADE_LEVEL", "Khối lớp phải là 10, 11 hoặc 12.") from exc
    if grade_level not in ALLOWED_GRADE_LEVELS:
        raise DomainError("GRADE_LEVEL", "Khối lớp phải là 10, 11 hoặc 12.")

    max_score = _as_decimal(payload.get("maxScore", payload.get("max_score")), "maxScore")
    score_step = _as_decimal(
        payload.get("scoreStep", payload.get("score_step", DEFAULT_SCORE_STEP)),
        "scoreStep",
    )
    if not _multiple_of_step(max_score, score_step):
        raise DomainError("RUBRIC_WEIGHT", "maxScore phải là bội số của scoreStep.")

    criteria_raw = payload.get("criteria")
    if not isinstance(criteria_raw, list) or not criteria_raw:
        raise DomainError("RUBRIC_SHAPE", "Barem cần ít nhất một tiêu chí.")

    seen: set[str] = set()
    weight_sum = Decimal("0")
    criteria: list[dict[str, Any]] = []

    for item in criteria_raw:
        if not isinstance(item, dict):
            raise DomainError("RUBRIC_SHAPE", "Mỗi tiêu chí phải là một đối tượng.")
        criterion_id = _as_nonempty(
            item.get("id") or item.get("criterionId") or item.get("criterion_id") or "",
            "criteria.id",
            max_len=64,
        )
        if criterion_id in seen:
            raise DomainError("RUBRIC_CRITERION", f"Trùng mã tiêu chí {criterion_id}.")
        seen.add(criterion_id)
        name = _as_nonempty(item.get("name") or "", "criteria.name")
        weight = _as_decimal(item.get("weight"), f"weight của {criterion_id}")
        if not _multiple_of_step(weight, score_step):
            raise DomainError(
                "RUBRIC_WEIGHT",
                f"Điểm của {criterion_id} phải theo bước {decimal_to_number(score_step)}.",
            )
        weight_sum += weight

        criterion: dict[str, Any] = {
            "id": criterion_id,
            "name": name,
            "weight": decimal_to_number(weight),
        }
        guide = item.get("guideNote") or item.get("guide_note") or item.get("description")
        if isinstance(guide, str) and guide.strip():
            criterion["guideNote"] = guide.strip()

        levels = item.get("levels")
        if levels is not None:
            if not isinstance(levels, list):
                raise DomainError("RUBRIC_SHAPE", "levels phải là mảng.")
            normalized_levels = []
            for level in levels:
                if not isinstance(level, dict):
                    raise DomainError("RUBRIC_SHAPE", "Mỗi mức điểm phải là đối tượng.")
                score = _as_level_score(level.get("score"), "levels.score", max_score=weight)
                descriptor = _as_nonempty(level.get("descriptor") or "", "levels.descriptor", max_len=2000)
                normalized_levels.append(
                    {"score": decimal_to_number(score), "descriptor": descriptor}
                )
            criterion["levels"] = normalized_levels

        required = item.get("requiredElements") or item.get("required_elements")
        if required is not None:
            if not isinstance(required, list) or any(not isinstance(v, str) for v in required):
                raise DomainError("RUBRIC_SHAPE", "requiredElements phải là mảng chuỗi.")
            criterion["requiredElements"] = [v.strip() for v in required if v.strip()]

        penalty = item.get("penaltyPerError") or item.get("penalty_per_error")
        if penalty is not None:
            criterion["penaltyPerError"] = decimal_to_number(_as_decimal(penalty, "penaltyPerError"))

        anti = item.get("antiPatterns") or item.get("anti_patterns")
        if anti is not None:
            if not isinstance(anti, list) or any(not isinstance(v, str) for v in anti):
                raise DomainError("RUBRIC_SHAPE", "antiPatterns phải là mảng chuỗi.")
            criterion["antiPatterns"] = [v.strip() for v in anti if v.strip()]

        criteria.append(criterion)

    if weight_sum.quantize(TWO_PLACES) != max_score.quantize(TWO_PLACES):
        raise DomainError(
            "RUBRIC_WEIGHT_SUM",
            (
                f"Tổng điểm các tiêu chí phải bằng {decimal_to_number(max_score)} "
                f"(hiện tại {decimal_to_number(weight_sum)}). "
                "Weight là điểm tối đa, không phải hệ số nhân."
            ),
        )

    return {
        "title": title,
        "shortTitle": short_title,
        "description": description,
        "version": version_label,
        "gradeLevel": grade_level,
        "maxScore": decimal_to_number(max_score),
        "scoreStep": decimal_to_number(score_step),
        "criteria": criteria,
    }


def assignment_rubric_document(
    canonical: dict[str, Any],
    *,
    title: str | None = None,
) -> dict[str, Any]:
    """Copy used on an assignment instance; mutating it must not change the catalog."""
    copied = validate_rubric_payload({**canonical, "title": title or canonical["title"]})
    return copied
