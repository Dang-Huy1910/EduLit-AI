from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.db.models import Assignment
from app.services.deadline import effective_due_at, is_closed, is_late


@pytest.mark.parametrize("policy", ["ALLOW_LATE", "CLOSE_AT_DUE"])
def test_no_due_date_never_late_or_closed_even_with_extension(policy):
    student_id = uuid4()
    past = datetime(2020, 1, 1, tzinfo=timezone.utc)
    assignment = Assignment(
        due_at=None, late_policy=policy, due_extensions={str(student_id): past.isoformat()}
    )
    assert effective_due_at(assignment, student_id) is None
    assert not is_late(past + timedelta(days=1), effective_due_at(assignment, student_id))
    assert not is_closed(assignment, student_id, past + timedelta(days=1))


@pytest.mark.parametrize("offset", [-2, 2])
def test_student_extension_replaces_due_even_when_earlier(offset):
    student_id = uuid4()
    due = datetime(2026, 10, 28, 10, tzinfo=timezone.utc)
    extended = due + timedelta(hours=offset)
    assignment = Assignment(
        due_at=due, late_policy="CLOSE_AT_DUE",
        due_extensions={str(student_id): extended.isoformat()},
    )
    assert effective_due_at(assignment, student_id) == extended
    assert effective_due_at(assignment, uuid4()) == due
    assert not is_closed(assignment, student_id, extended)
    assert is_closed(assignment, student_id, extended + timedelta(microseconds=1))


def test_timezone_comparison_and_exact_deadline():
    student_id = uuid4()
    due = datetime.fromisoformat("2026-10-28T17:00:00+07:00")
    same_time = datetime.fromisoformat("2026-10-28T10:00:00Z")
    assert not is_late(same_time, due)
    assert is_late(same_time + timedelta(microseconds=1), due)
    assert not is_late(None, due)
    assignment = Assignment(due_at=due, late_policy="ALLOW_LATE", due_extensions={})
    assert not is_closed(assignment, student_id, same_time + timedelta(days=1))
