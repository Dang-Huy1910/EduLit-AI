from __future__ import annotations

import pytest

from app.core.errors import DomainError
from app.services.rubric import validate_rubric_payload


def test_valid_rubric_not_forced_to_four() -> None:
    payload = {
        "title": "Barem 10 điểm",
        "maxScore": 10,
        "scoreStep": 0.25,
        "gradeLevel": 11,
        "criteria": [
            {"id": "C1", "name": "A", "weight": 4},
            {"id": "C2", "name": "B", "weight": 3},
            {"id": "C3", "name": "C", "weight": 3},
        ],
    }
    result = validate_rubric_payload(payload)
    assert result["maxScore"] == 10.0
    assert result["criteria"][0]["weight"] == 4.0


def test_weight_sum_must_match_max_score() -> None:
    payload = {
        "title": "Sai tổng",
        "maxScore": 4,
        "scoreStep": 0.25,
        "criteria": [
            {"id": "C1", "name": "A", "weight": 2},
            {"id": "C2", "name": "B", "weight": 1},
        ],
    }
    with pytest.raises(DomainError) as exc:
        validate_rubric_payload(payload)
    assert exc.value.code == "RUBRIC_WEIGHT_SUM"


def test_invalid_shape_rejected() -> None:
    with pytest.raises(DomainError) as exc:
        validate_rubric_payload({"title": "Thiếu tiêu chí", "maxScore": 4, "criteria": []})
    assert exc.value.code == "RUBRIC_SHAPE"


def test_duplicate_criterion_id() -> None:
    payload = {
        "title": "Trùng",
        "maxScore": 4,
        "scoreStep": 0.25,
        "criteria": [
            {"id": "C1", "name": "A", "weight": 2},
            {"id": "C1", "name": "B", "weight": 2},
        ],
    }
    with pytest.raises(DomainError) as exc:
        validate_rubric_payload(payload)
    assert exc.value.code == "RUBRIC_CRITERION"


def test_vietnamese_decimal_comma_is_accepted() -> None:
    payload = {
        "title": "Barem thập phân Việt",
        "maxScore": "10,0",
        "scoreStep": "0,5",
        "gradeLevel": 11,
        "criteria": [
            {
                "id": "C1",
                "name": "Nội dung",
                "weight": "2,5",
                "levels": [
                    {"score": "0,0", "descriptor": "Chưa đạt"},
                    {"score": "2,5", "descriptor": "Đạt"},
                ],
            },
            {"id": "C2", "name": "Hình thức", "weight": "7,5"},
        ],
    }
    result = validate_rubric_payload(payload)
    assert result["maxScore"] == 10.0
    assert result["criteria"][0]["weight"] == 2.5
    assert result["criteria"][0]["levels"][0]["score"] == 0.0
    assert result["scoreStep"] == 0.5


def test_level_score_zero_is_allowed() -> None:
    payload = {
        "title": "Barem có mức 0",
        "maxScore": 4,
        "scoreStep": 0.25,
        "gradeLevel": 11,
        "criteria": [
            {
                "id": "C1",
                "name": "Nội dung",
                "weight": 4,
                "levels": [
                    {"score": 0, "descriptor": "Chưa đạt: 0 điểm"},
                    {"score": 4, "descriptor": "Xuất sắc"},
                ],
            }
        ],
    }
    result = validate_rubric_payload(payload)
    assert result["criteria"][0]["levels"][0]["score"] == 0.0


def test_level_score_negative_rejected() -> None:
    payload = {
        "title": "Điểm âm",
        "maxScore": 4,
        "scoreStep": 0.25,
        "criteria": [
            {
                "id": "C1",
                "name": "A",
                "weight": 4,
                "levels": [{"score": -0.25, "descriptor": "Không hợp lệ"}],
            }
        ],
    }
    with pytest.raises(DomainError) as exc:
        validate_rubric_payload(payload)
    assert exc.value.code == "RUBRIC_LEVEL_SCORE"


def test_level_score_over_criterion_max_rejected() -> None:
    payload = {
        "title": "Vượt điểm tiêu chí",
        "maxScore": 4,
        "scoreStep": 0.25,
        "criteria": [
            {
                "id": "C1",
                "name": "A",
                "weight": 2,
                "levels": [{"score": 2.5, "descriptor": "Vượt"}],
            },
            {"id": "C2", "name": "B", "weight": 2},
        ],
    }
    with pytest.raises(DomainError) as exc:
        validate_rubric_payload(payload)
    assert exc.value.code == "RUBRIC_LEVEL_SCORE"
