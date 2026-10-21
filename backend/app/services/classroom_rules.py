"""Quy tắc dùng chung cho kỳ học và quyền truy cập lớp."""

from __future__ import annotations

import secrets
import uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AssignmentAccess, Classroom, Term


JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
JOIN_CODE_LENGTH = 6
SCHOOL_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def generate_join_code() -> str:
    return "".join(secrets.choice(JOIN_CODE_ALPHABET) for _ in range(JOIN_CODE_LENGTH))


def school_today() -> date:
    return datetime.now(SCHOOL_TZ).date()


def term_status(term: Term, today: date) -> str:
    if today < term.starts_on:
        return "UPCOMING"
    if today > term.ends_on:
        return "ENDED"
    return "ACTIVE"


def classroom_read_only(classroom: Classroom, today: date | None = None) -> bool:
    return classroom.archived_at is not None or term_status(classroom.term, today or school_today()) == "ENDED"


async def grant_access(
    session: AsyncSession, revision_id: uuid.UUID, student_ids: list[uuid.UUID]
) -> None:
    """Grant (or restore) one revision's access to the given students."""
    seen: set[uuid.UUID] = set()
    for student_id in student_ids:
        if student_id in seen:
            continue
        seen.add(student_id)
        existing = await session.execute(
            select(AssignmentAccess).where(
                AssignmentAccess.assignment_revision_id == revision_id,
                AssignmentAccess.student_id == student_id,
            )
        )
        access = existing.scalar_one_or_none()
        if access is None:
            session.add(
                AssignmentAccess(
                    assignment_revision_id=revision_id,
                    student_id=student_id,
                )
            )
        elif access.revoked_at is not None:
            access.revoked_at = None
