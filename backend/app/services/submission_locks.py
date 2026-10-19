"""Row locks for submission/attempt mutations.

Always lock Submission first, then SubmissionAttempt, then job/result rows.
Hold locks only around DB reads/writes; never across an AI call.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Submission, SubmissionAttempt
from app.services.submission_errors import SubmissionError


async def lock_submission(
    session: AsyncSession, submission_id: uuid.UUID, *, required: bool = True
) -> Submission | None:
    row = (
        await session.execute(
            select(Submission)
            .where(Submission.id == submission_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if row is None and required:
        raise SubmissionError(404, "NOT_FOUND", "Không tìm thấy bài nộp.")
    return row


async def lock_attempt(
    session: AsyncSession, attempt_id: uuid.UUID, *, required: bool = True
) -> SubmissionAttempt | None:
    row = (
        await session.execute(
            select(SubmissionAttempt)
            .where(SubmissionAttempt.id == attempt_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if row is None and required:
        raise SubmissionError(404, "NOT_FOUND", "Không tìm thấy lượt nộp.")
    return row
