"""Pure rules for starting a new writing round after publication."""

from __future__ import annotations

from datetime import datetime

from app.db.models import (
    AssessmentResult,
    Assignment,
    AssignmentRevision,
    Submission,
    SubmissionAttempt,
    SubmissionAttemptState,
)

REVISION_MESSAGES = {
    "REVISION_DISABLED": "Giáo viên chưa bật viết lại cho bài tập này.",
    "REVISION_NOT_PUBLISHED": "Em cần chờ bản hiện tại được công bố điểm trước khi viết lại.",
    "REVISION_LIMIT_REACHED": "Em đã dùng hết lượt viết lại của bài tập này.",
    "REVISION_CLOSED": "Đã hết hạn viết lại. Em hãy liên hệ giáo viên nếu cần thêm thời gian.",
    "REVISION_LIMIT_IN_USE": "Không thể giảm số lượt dưới số bản viết lại học sinh đã bắt đầu.",
}


def current_round(attempt: SubmissionAttempt | None) -> int:
    return int(attempt.revision_round or 1) if attempt else 1


def revisions_used(attempt: SubmissionAttempt | None) -> int:
    return current_round(attempt) - 1


def revision_is_closed(assignment: Assignment | AssignmentRevision, now: datetime) -> bool:
    due_at = getattr(assignment, "revision_due_at", None)
    return due_at is not None and now > due_at


def can_start_revision(
    assignment: Assignment | AssignmentRevision,
    submission: Submission | None,
    attempt: SubmissionAttempt | None,
    published_result: AssessmentResult | None,
    now: datetime,
    *,
    classroom_read_only: bool = False,
) -> tuple[bool, str | None]:
    if classroom_read_only:
        return False, "CLASSROOM_READ_ONLY"
    maximum = int(getattr(assignment, "max_revisions", 0) or 0)
    if maximum == 0:
        return False, "REVISION_DISABLED"
    if revision_is_closed(assignment, now):
        return False, "REVISION_CLOSED"
    if revisions_used(attempt) >= maximum:
        return False, "REVISION_LIMIT_REACHED"
    if (
        submission is None
        or attempt is None
        or published_result is None
        or submission.current_attempt_id != attempt.id
        or submission.current_published_result_id != published_result.id
        or not published_result.is_published
        or published_result.submission_id != submission.id
        or published_result.attempt_id != attempt.id
        or attempt.state != SubmissionAttemptState.READY_TO_GRADE.value
        or attempt.confirmed_revision_id is None
        or published_result.transcription_revision_id != attempt.confirmed_revision_id
    ):
        return False, "REVISION_NOT_PUBLISHED"
    return True, None
