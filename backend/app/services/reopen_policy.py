"""Who may reopen a confirmed transcription.

A version that has ever been published stays locked until the teacher grants
reopen, including after the live published pointer is cleared (unpublish).
Grant is consumed when the student starts that permitted edit/resubmit.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AssessmentResult, Submission, SubmissionAttempt
from app.db.models.enums import SubmissionAttemptState

OCR_REVIEW = SubmissionAttemptState.OCR_REVIEW.value
READY_TO_GRADE = SubmissionAttemptState.READY_TO_GRADE.value


async def version_was_published(
    session: AsyncSession,
    *,
    submission: Submission,
    transcription_revision_id: uuid.UUID | None,
) -> bool:
    if transcription_revision_id is None:
        return False
    wanted = str(transcription_revision_id)
    for item in submission.published_history or []:
        if isinstance(item, dict) and str(item.get("transcriptionRevisionId") or "") == wanted:
            return True
    if submission.current_published_result_id:
        current = await session.get(AssessmentResult, submission.current_published_result_id)
        if (
            current is not None
            and current.transcription_revision_id == transcription_revision_id
            and current.published_at is not None
        ):
            return True
    found = (
        await session.execute(
            select(AssessmentResult.id)
            .where(
                AssessmentResult.submission_id == submission.id,
                AssessmentResult.transcription_revision_id == transcription_revision_id,
                AssessmentResult.published_at.is_not(None),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    return found is not None


async def student_may_reopen(
    session: AsyncSession,
    *,
    submission: Submission | None,
    attempt: SubmissionAttempt | None,
) -> bool:
    if attempt is None:
        return False
    if attempt.state == OCR_REVIEW:
        return True
    if attempt.state != READY_TO_GRADE or submission is None:
        return False
    if submission.reopen_granted_at is not None:
        return True
    return not await version_was_published(
        session,
        submission=submission,
        transcription_revision_id=attempt.confirmed_revision_id,
    )


async def needs_reopen_grant(
    session: AsyncSession,
    *,
    submission: Submission | None,
    attempt: SubmissionAttempt | None,
) -> bool:
    if attempt is None or submission is None or attempt.state != READY_TO_GRADE:
        return False
    if submission.reopen_granted_at is not None:
        return False
    return await version_was_published(
        session,
        submission=submission,
        transcription_revision_id=attempt.confirmed_revision_id,
    )


def consume_reopen_grant(submission: Submission) -> None:
    submission.reopen_granted_at = None
    submission.reopen_granted_by = None
