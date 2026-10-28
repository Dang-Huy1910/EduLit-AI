from copy import deepcopy

import pytest

from app.services.round_compare import compare_rounds, score_delta


def criterion(cid, score, maximum=2, name=None):
    return {"criterionId": cid, "criterionName": name or cid, "awardedScore": score, "maxScore": maximum}


def test_compare_matches_ids_even_when_order_and_names_change_without_mutating():
    previous = {
        "round": 1, "totalScore": 1.1, "scoreScale10": 2.75,
        "evaluations": [criterion("C1", 0.1, name="Tên cũ"), criterion("C2", 1)],
    }
    current = {
        "round": 2, "totalScore": 1.05, "scoreScale10": 2.1,
        "evaluations": [criterion("C2", 0.75), criterion("C1", 0.3, maximum=3, name="Tên mới")],
    }
    saved = deepcopy((previous, current))
    result = compare_rounds(previous, current)
    assert result == {
        "previousRound": 1, "currentRound": 2, "totalScoreDelta": -0.05, "scoreScale10Delta": -0.65,
        "criteria": [
            {"criterionId": "C1", "criterionName": "Tên mới", "previousScore": 0.1, "currentScore": 0.3,
             "previousMaxScore": 2, "currentMaxScore": 3, "delta": 0.2, "status": "matched"},
            {"criterionId": "C2", "criterionName": "C2", "previousScore": 1, "currentScore": 0.75,
             "previousMaxScore": 2, "currentMaxScore": 2, "delta": -0.25, "status": "matched"},
        ],
    }
    assert (previous, current) == saved


def test_compare_marks_added_and_removed_criteria_instead_of_assuming_zero():
    previous = {"round": 2, "evaluations": [criterion("OLD", 0, name="Cùng tên")]}
    current = {"round": 3, "evaluations": [criterion("NEW", 0, name="Cùng tên")]}
    result = compare_rounds(previous, current)
    assert result["totalScoreDelta"] is None and result["scoreScale10Delta"] is None
    assert result["criteria"] == [
        {"criterionId": "OLD", "criterionName": "Cùng tên", "previousScore": 0, "currentScore": None,
         "previousMaxScore": 2, "currentMaxScore": None, "delta": None, "status": "removed"},
        {"criterionId": "NEW", "criterionName": "Cùng tên", "previousScore": None, "currentScore": 0,
         "previousMaxScore": None, "currentMaxScore": 2, "delta": None, "status": "added"},
    ]


@pytest.mark.parametrize("before, after, expected", [(0, 0, 0), (0, 0.1, 0.1), (3, 0, -3), (None, 2, None), (2, None, None)])
def test_score_delta_handles_zero_missing_and_negative_scores(before, after, expected):
    assert score_delta(before, after) == expected


def test_compare_empty_criteria_and_missing_score():
    result = compare_rounds({"round": 1}, {"round": 2, "evaluations": []})
    assert result["criteria"] == [] and result["totalScoreDelta"] is None
