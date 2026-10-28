from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.db.models import AssessmentResult, Assignment, Submission, SubmissionAttempt
from app.services.revision_policy import can_start_revision, current_round, revisions_used

NOW = datetime(2026, 10, 28, 10, tzinfo=timezone.utc)


def published_round(round_number=1):
    assignment = Assignment(max_revisions=2, revision_due_at=None)
    submission = Submission(id=uuid4(), current_attempt_id=uuid4(), current_published_result_id=uuid4())
    attempt = SubmissionAttempt(
        id=submission.current_attempt_id, submission_id=submission.id,
        revision_round=round_number, confirmed_revision_id=uuid4(), state="READY_TO_GRADE",
    )
    result = AssessmentResult(
        id=submission.current_published_result_id, submission_id=submission.id,
        attempt_id=attempt.id, transcription_revision_id=attempt.confirmed_revision_id,
        is_published=True,
    )
    return assignment, submission, attempt, result


def test_round_and_revisions_used_are_independent_of_attempt_number():
    assert current_round(None) == 1
    assert revisions_used(None) == 0
    attempt = SubmissionAttempt(attempt_number=12, revision_round=2)
    assert current_round(attempt) == 2
    assert revisions_used(attempt) == 1


@pytest.mark.parametrize("round_number", [1, 2])
def test_published_current_round_can_start_next(round_number):
    assert can_start_revision(*published_round(round_number), NOW) == (True, None)


def test_last_round_cannot_start_another():
    assert can_start_revision(*published_round(3), NOW) == (False, "REVISION_LIMIT_REACHED")


def test_disabled_and_missing_submission():
    assignment, submission, attempt, result = published_round()
    assignment.max_revisions = 0
    assert can_start_revision(assignment, submission, attempt, result, NOW) == (False, "REVISION_DISABLED")
    assignment.max_revisions = 1
    assert can_start_revision(assignment, None, None, None, NOW) == (False, "REVISION_NOT_PUBLISHED")


@pytest.mark.parametrize("target,field,value", [
    (1, "current_attempt_id", uuid4()),
    (1, "current_published_result_id", None),
    (2, "state", "OCR_REVIEW"),
    (2, "confirmed_revision_id", None),
    (3, "is_published", False),
    (3, "submission_id", uuid4()),
    (3, "attempt_id", uuid4()),
    (3, "transcription_revision_id", uuid4()),
])
def test_publication_must_match_current_confirmed_attempt(target, field, value):
    context = published_round()
    setattr(context[target], field, value)
    assert can_start_revision(*context, NOW) == (False, "REVISION_NOT_PUBLISHED")


def test_deadline_uses_timezone_and_allows_exact_instant():
    context = published_round()
    context[0].revision_due_at = datetime.fromisoformat("2026-10-28T17:00:00+07:00")
    assert can_start_revision(*context, NOW) == (True, None)
    assert can_start_revision(*context, NOW + timedelta(microseconds=1)) == (False, "REVISION_CLOSED")


def test_classroom_read_only_blocks_published_round():
    assert can_start_revision(*published_round(), NOW, classroom_read_only=True) == (False, "CLASSROOM_READ_ONLY")
