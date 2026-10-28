"""Pure deadline rules, including legacy revisions without an assignment."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.db.models import Assignment, AssignmentRevision


def effective_due_at(
    assignment: Assignment | AssignmentRevision, student_id: uuid.UUID
) -> datetime | None:
    if assignment.due_at is None:
        return None
    extension = (getattr(assignment, "due_extensions", None) or {}).get(str(student_id))
    if extension:
        return datetime.fromisoformat(extension.replace("Z", "+00:00"))
    return assignment.due_at


def is_late(submitted_at: datetime | None, effective_due: datetime | None) -> bool:
    return bool(submitted_at and effective_due and submitted_at > effective_due)


def is_closed(
    assignment: Assignment | AssignmentRevision, student_id: uuid.UUID, now: datetime
) -> bool:
    return getattr(assignment, "late_policy", "ALLOW_LATE") == "CLOSE_AT_DUE" and is_late(
        now, effective_due_at(assignment, student_id)
    )
