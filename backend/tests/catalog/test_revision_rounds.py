from __future__ import annotations

import asyncio
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import func, select

from app.db.models import AssessmentResult, Assignment, Classroom, Submission, SubmissionAttempt, UserRole
from app.db.session import get_session_factory
from app.services import assessment_jobs
from app.services.assignment_service import AssignmentService
from app.services.catalog_errors import CatalogError
from app.services.submission_errors import SubmissionError
from app.services.submission_service import SubmissionService
from tests.catalog.conftest import HEADERS, create_term, create_user, login_as
from tests.catalog.test_deadlines import (
    _image,
    _run_ocr,
    _upload,
    deadline_clock as deadline_clock,
    make_assignment as make_assignment,
)


def student_path(assignment):
    return f"/api/assignments/{assignment['id']}"


def teacher_path(assignment, student):
    return f"/api/teacher/assignments/{assignment['id']}/students/{student.id}/assessment"


def result_target(result):
    return {
        "resultId": result["id"],
        "transcriptionRevisionId": result["transcriptionRevisionId"],
        "expectedVersion": result["version"],
    }


async def confirm_round(client, assignment, settings):
    path = student_path(assignment)
    await _upload(client, assignment["id"])
    submitted = await client.post(path + "/submission/submit", headers=HEADERS)
    assert submitted.status_code == 200, submitted.text
    await _run_ocr(settings)
    review = (await client.get(path + "/ocr")).json()
    confirmed = await client.post(
        path + "/ocr/confirm", headers=HEADERS,
        json={"expectedRevision": review["expectedRevision"]},
    )
    assert confirmed.status_code == 200, confirmed.text
    return confirmed.json()


async def grade_round(settings):
    factory = get_session_factory()
    async with factory() as session:
        jobs = await assessment_jobs.claim_jobs(session, limit=10, lease_seconds=300)
        await session.commit()
    assert jobs
    for job_id, lease in jobs:
        assert await assessment_jobs.process_claimed_job(factory, job_id, lease, settings=settings) == "ready"


async def publish_round(client, assignment, student, teacher, db_session, settings):
    await grade_round(settings)
    return await publish_round_without_grading(client, assignment, student, teacher, db_session, settings)


async def first_publication(client, make_assignment, teacher, student, db_session, settings, **overrides):
    assignment = await make_assignment(**overrides)
    await login_as(client, settings, db_session, student)
    confirmed = await confirm_round(client, assignment, settings)
    published = await publish_round(client, assignment, student, teacher, db_session, settings)
    return assignment, confirmed, published


@pytest.mark.asyncio
async def test_new_round_preserves_published_score_and_supersedes_only_on_publish(
    client, make_assignment, teacher_user, student_user, db_session, settings, deadline_clock,
):
    assignment, first, published1 = await first_publication(
        client, make_assignment, teacher_user, student_user, db_session, settings,
        maxRevisions=2, latePolicy="CLOSE_AT_DUE",
    )
    path = student_path(assignment)
    view = (await client.get(path + "/submission")).json()
    assert view["canStartRevision"] and view["startRevisionBlockedReason"] is None
    assert view["revisionRound"] == 1 and view["revisionsRemaining"] == 2
    deadline_clock[0] += timedelta(hours=2)
    # Simultaneous retries must both return the same new round.
    responses = await asyncio.gather(*[
        client.post(path + "/submission/start-revision", headers=HEADERS) for _ in range(2)
    ])
    for response in responses:
        assert response.status_code == 200, response.text
    second = responses[0].json()
    assert responses[1].json()["attemptId"] == second["attemptId"]
    assert second["revisionRound"] == 2 and second["attemptNumber"] == 2
    assert second["revisionsRemaining"] == 1 and not second["canStartRevision"]
    assert second["startRevisionBlockedReason"] == "REVISION_NOT_PUBLISHED"
    assert not second["isClosed"] and not second["isLate"] and second["canEditPages"]
    assert second["pages"] == []
    async with get_session_factory()() as session:
        sub = await session.get(Submission, uuid.UUID(second["submissionId"]))
        assert str(sub.current_published_result_id) == published1["id"]
        assert sub.current_assessment_job_id is None and sub.current_assessment_result_id is None
        previous = await session.get(AssessmentResult, sub.current_published_result_id)
        assert previous.is_published and previous.superseded_at is None
        count = await session.scalar(select(func.count()).select_from(SubmissionAttempt))
        assert count == 2
    visible = (await client.get(path + "/assessment")).json()
    assert visible["assessment"]["canViewResult"]
    assert visible["assessment"]["result"]["resultId"] == published1["id"]

    # Use exactly the same image; deduplication must not restore round 1.
    confirmed2 = await confirm_round(client, assignment, settings)
    assert confirmed2["attemptId"] != first["attemptId"]
    assert confirmed2["revisionRound"] == 2 and not confirmed2["isLate"]
    # A fresh, unpublished round can reopen without any teacher grant.
    reopened = await client.post(path + "/ocr/reopen", headers=HEADERS)
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["revisionRound"] == 2
    reconfirmed = await client.post(path + "/ocr/confirm", headers=HEADERS)
    assert reconfirmed.status_code == 200, reconfirmed.text
    await grade_round(settings)
    await login_as(client, settings, db_session, teacher_user)
    detail = (await client.get(teacher_path(assignment, student_user))).json()
    target = result_target(detail["assessment"]["currentResult"])
    stale = await client.post(
        teacher_path(assignment, student_user) + "/publish", headers=HEADERS,
        json={**target, "expectedVersion": target["expectedVersion"] + 1},
    )
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "VERSION_CONFLICT"
    async with get_session_factory()() as session:
        previous = await session.get(AssessmentResult, uuid.UUID(published1["id"]))
        assert previous.is_published and previous.superseded_at is None
    published2 = await publish_round_without_grading(client, assignment, student_user, teacher_user, db_session, settings)
    async with get_session_factory()() as session:
        previous = await session.get(AssessmentResult, uuid.UUID(published1["id"]))
        assert not previous.is_published and previous.superseded_at == previous.unpublished_at
        sub = await session.get(Submission, uuid.UUID(first["submissionId"]))
        assert str(sub.current_published_result_id) == published2["id"]
        assert sub.published_history[-1]["reason"] == "superseded"
        assert sub.published_history[-1]["resultId"] == published1["id"]
    third = await client.post(path + "/submission/start-revision", headers=HEADERS)
    assert third.status_code == 200, third.text
    assert third.json()["revisionRound"] == 3 and third.json()["revisionsRemaining"] == 0
    await confirm_round(client, assignment, settings)
    await publish_round(client, assignment, student_user, teacher_user, db_session, settings)
    blocked = await client.post(path + "/submission/start-revision", headers=HEADERS)
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "REVISION_LIMIT_REACHED"
    await login_as(client, settings, db_session, teacher_user)
    report = await client.get(f"/api/teacher/reports/{assignment['id']}?mode=official")
    assert not report.json()["students"]["items"][0]["isLate"]
    assert report.json()["stats"]["late"] == 0
    detail = (await client.get(teacher_path(assignment, student_user))).json()
    assert not detail["submission"]["isLate"]
    progress = (await client.get(f"/api/teacher/assignments/{assignment['id']}")).json()
    assert progress["submissionProgress"]["late"] == 0


@pytest.mark.asyncio
async def test_disabled_keeps_legacy_grant_and_same_round_publication(
    client, make_assignment, teacher_user, student_user, db_session, settings,
):
    assignment, first, published1 = await first_publication(
        client, make_assignment, teacher_user, student_user, db_session, settings,
    )
    path = student_path(assignment)
    blocked = await client.post(path + "/submission/start-revision", headers=HEADERS)
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "REVISION_DISABLED"
    for suffix in ("/submission/new-attempt", "/ocr/reopen"):
        blocked = await client.post(path + suffix, headers=HEADERS)
        assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "TRANSCRIPTION_LOCKED"
    await login_as(client, settings, db_session, teacher_user)
    grant = await client.post(teacher_path(assignment, student_user) + "/grant-reopen", headers=HEADERS)
    assert grant.status_code == 200
    await login_as(client, settings, db_session, student_user)
    reopened = await client.post(path + "/ocr/reopen", headers=HEADERS)
    assert reopened.status_code == 200 and reopened.json()["revisionRound"] == 1
    confirmed = await client.post(path + "/ocr/confirm", headers=HEADERS)
    assert confirmed.status_code == 200, confirmed.text
    await publish_round(client, assignment, student_user, teacher_user, db_session, settings)
    async with get_session_factory()() as session:
        previous = await session.get(AssessmentResult, uuid.UUID(published1["id"]))
        sub = await session.get(Submission, uuid.UUID(first["submissionId"]))
        assert previous.superseded_at is None
        assert "reason" not in sub.published_history[-1]
        assert sub.reopen_granted_at is None


@pytest.mark.asyncio
async def test_start_requires_current_publication_and_unpublish_records_reason(
    client, make_assignment, teacher_user, student_user, db_session, settings,
):
    assignment = await make_assignment(maxRevisions=2)
    path = student_path(assignment)
    await login_as(client, settings, db_session, student_user)
    for stage in ("empty", "confirmed", "graded"):
        if stage == "confirmed":
            await confirm_round(client, assignment, settings)
        elif stage == "graded":
            await grade_round(settings)
        response = await client.post(path + "/submission/start-revision", headers=HEADERS)
        assert response.status_code == 409 and response.json()["error"]["code"] == "REVISION_NOT_PUBLISHED"
    published = await publish_round_without_grading(client, assignment, student_user, teacher_user, db_session, settings)
    await login_as(client, settings, db_session, teacher_user)
    hidden = await client.post(
        teacher_path(assignment, student_user) + "/unpublish", headers=HEADERS, json=result_target(published),
    )
    assert hidden.status_code == 200, hidden.text
    async with get_session_factory()() as session:
        result = await session.get(AssessmentResult, uuid.UUID(published["id"]))
        assert result.superseded_at is None and not result.is_published
        sub = await session.get(Submission, result.submission_id)
        assert sub.published_history[-1]["reason"] == "unpublished"
    await login_as(client, settings, db_session, student_user)
    blocked = await client.post(path + "/submission/start-revision", headers=HEADERS)
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "REVISION_NOT_PUBLISHED"


async def publish_round_without_grading(client, assignment, student, teacher, db_session, settings):
    await login_as(client, settings, db_session, teacher)
    path = teacher_path(assignment, student)
    current = (await client.get(path)).json()["assessment"]["currentResult"]
    published = await client.post(path + "/publish", headers=HEADERS, json=result_target(current))
    assert published.status_code == 200, published.text
    await login_as(client, settings, db_session, student)
    return published.json()["assessment"]["publishedResult"]


@pytest.mark.asyncio
async def test_revision_deadline_blocks_start_and_page_mutations(
    client, make_assignment, teacher_user, student_user, db_session, settings, deadline_clock,
):
    assignment, _first, _published = await first_publication(
        client, make_assignment, teacher_user, student_user, db_session, settings,
        maxRevisions=1, revisionDueAt=(deadline_clock[0] + timedelta(hours=1)).isoformat(),
    )
    path = student_path(assignment)
    deadline_clock[0] += timedelta(hours=2)
    blocked = await client.post(path + "/submission/start-revision", headers=HEADERS)
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "REVISION_CLOSED"
    await login_as(client, settings, db_session, teacher_user)
    future = (deadline_clock[0] + timedelta(hours=1)).isoformat()
    updated = await client.patch(
        f"/api/teacher/assignments/{assignment['id']}/settings", headers=HEADERS,
        json={"revisionDueAt": future},
    )
    assert updated.status_code == 200, updated.text
    await login_as(client, settings, db_session, student_user)
    assert (await client.post(path + "/submission/start-revision", headers=HEADERS)).status_code == 200
    draft = await _upload(client, assignment["id"])
    page_id = draft["pages"][0]["id"]
    deadline_clock[0] += timedelta(hours=2)
    no_content_type = {k: v for k, v in HEADERS.items() if k != "Content-Type"}
    requests = [
        ("POST", "/pages", {"files": {"file": _image()}, "headers": no_content_type}),
        ("POST", f"/pages/{page_id}/replace", {"files": {"file": _image()}, "headers": no_content_type}),
        ("PATCH", f"/pages/{page_id}", {"json": {"rotationDegrees": 90}}),
        ("DELETE", f"/pages/{page_id}", {}),
        ("DELETE", "/pages", {}),
        ("POST", "/reorder", {"json": {"pageIds": [page_id]}}),
        ("POST", "/submit", {}),
        ("POST", "/new-attempt", {}),
    ]
    for method, suffix, kwargs in requests:
        response = await client.request(method, path + "/submission" + suffix, **{"headers": HEADERS, **kwargs})
        assert response.status_code == 409, response.text
        assert response.json()["error"]["code"] == "REVISION_CLOSED"
    view = (await client.get(path + "/submission")).json()
    assert view["isClosed"] and not view["isLate"] and not view["canEditPages"]


@pytest.mark.asyncio
async def test_revision_grant_retry_and_replacement_keep_round(
    client, make_assignment, teacher_user, student_user, db_session, settings, deadline_clock,
):
    assignment, _first, _published = await first_publication(
        client, make_assignment, teacher_user, student_user, db_session, settings, maxRevisions=2,
    )
    teacher_url = teacher_path(assignment, student_user)
    await login_as(client, settings, db_session, teacher_user)
    assert (await client.post(teacher_url + "/grant-reopen", headers=HEADERS)).status_code == 200
    await login_as(client, settings, db_session, student_user)
    path = student_path(assignment)
    started = await client.post(path + "/submission/start-revision", headers=HEADERS)
    assert started.status_code == 200
    async with get_session_factory()() as session:
        sub = await session.get(Submission, uuid.UUID(started.json()["submissionId"]))
        assert sub.reopen_granted_at is not None
    draft = await _upload(client, assignment["id"])
    assert (await client.post(path + "/submission/submit", headers=HEADERS)).status_code == 200
    async with get_session_factory()() as session:
        attempt = await session.get(SubmissionAttempt, uuid.UUID(draft["attemptId"]))
        attempt.state = "FAILED"
        attempt.ocr_status = "FAILED"
        await session.commit()
    retried = await client.post(path + "/submission/retry-ocr", headers=HEADERS)
    assert retried.status_code == 200 and retried.json()["revisionRound"] == 2
    await _run_ocr(settings)
    assert (await client.post(path + "/ocr/confirm", headers=HEADERS)).status_code == 200
    await publish_round(client, assignment, student_user, teacher_user, db_session, settings)
    await login_as(client, settings, db_session, teacher_user)
    assert (await client.post(teacher_url + "/grant-reopen", headers=HEADERS)).status_code == 200
    await login_as(client, settings, db_session, student_user)
    replaced = await client.post(path + "/submission/new-attempt", headers=HEADERS)
    assert replaced.status_code == 200, replaced.text
    assert replaced.json()["revisionRound"] == 2 and replaced.json()["attemptNumber"] == 3
    repeated = await client.post(path + "/submission/start-revision", headers=HEADERS)
    assert repeated.status_code == 200 and repeated.json()["attemptId"] == replaced.json()["attemptId"]
    async with get_session_factory()() as session:
        sub = await session.get(Submission, uuid.UUID(draft["submissionId"]))
        assert sub.reopen_granted_at is None
        # Recovering a missing pointer must keep the highest round already started.
        sub.current_attempt_id = None
        attempt = await SubmissionService(session, settings)._create_attempt(sub, sub.assignment_revision_id)
        assert attempt.revision_round == 2


@pytest.mark.asyncio
async def test_timely_revision_can_finish_ocr_after_deadline_but_cannot_reopen(
    client, make_assignment, teacher_user, student_user, db_session, settings, deadline_clock,
):
    assignment, _first, _published = await first_publication(
        client, make_assignment, teacher_user, student_user, db_session, settings,
        maxRevisions=1, revisionDueAt=(deadline_clock[0] + timedelta(hours=1)).isoformat(),
    )
    path = student_path(assignment)
    started = await client.post(path + "/submission/start-revision", headers=HEADERS)
    assert started.status_code == 200
    draft = await _upload(client, assignment["id"])
    assert (await client.post(path + "/submission/submit", headers=HEADERS)).status_code == 200
    async with get_session_factory()() as session:
        attempt = await session.get(SubmissionAttempt, uuid.UUID(draft["attemptId"]))
        attempt.state = "FAILED"
        attempt.ocr_status = "FAILED"
        await session.commit()
    deadline_clock[0] += timedelta(hours=2)
    retried = await client.post(path + "/submission/retry-ocr", headers=HEADERS)
    assert retried.status_code == 200 and retried.json()["revisionRound"] == 2
    await _run_ocr(settings)
    confirmed = await client.post(path + "/ocr/confirm", headers=HEADERS)
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["isClosed"] and not confirmed.json()["isLate"]
    assert not confirmed.json()["canReopenTranscription"]
    await login_as(client, settings, db_session, teacher_user)
    granted = await client.post(teacher_path(assignment, student_user) + "/grant-reopen", headers=HEADERS)
    assert granted.status_code == 200
    await login_as(client, settings, db_session, student_user)
    reopened = await client.post(path + "/ocr/reopen", headers=HEADERS)
    assert reopened.status_code == 409 and reopened.json()["error"]["code"] == "REVISION_CLOSED"
    view = (await client.get(path + "/submission")).json()
    assert not view["canReopenTranscription"]


@pytest.mark.asyncio
async def test_student_assignment_views_follow_open_revision_round(
    client, make_assignment, teacher_user, student_user, db_session, settings, deadline_clock,
):
    revision_due = deadline_clock[0] + timedelta(hours=3)
    assignment, _first, _published = await first_publication(
        client, make_assignment, teacher_user, student_user, db_session, settings,
        maxRevisions=1, latePolicy="CLOSE_AT_DUE", revisionDueAt=revision_due.isoformat(),
    )
    path = student_path(assignment)
    deadline_clock[0] += timedelta(hours=2)

    async def views():
        listing = await client.get("/api/assignments")
        assert listing.status_code == 200, listing.text
        item = next(item for item in listing.json()["items"] if item["id"] == assignment["id"])
        detail = await client.get(path)
        assert detail.status_code == 200, detail.text
        return item, detail.json()

    before_list, before_detail = await views()
    assert before_list["revisionRound"] == before_detail["revisionRound"] == 1
    assert before_list["isClosed"] is True and before_detail["isClosed"] is True
    started = await client.post(path + "/submission/start-revision", headers=HEADERS)
    assert started.status_code == 200, started.text
    assert started.json()["revisionRound"] == 2
    open_list, open_detail = await views()
    assert open_list["revisionRound"] == open_detail["revisionRound"] == 2
    assert open_list["isClosed"] is False and open_detail["isClosed"] is False
    deadline_clock[0] += timedelta(hours=2)
    closed_list, closed_detail = await views()
    assert closed_list["revisionRound"] == closed_detail["revisionRound"] == 2
    assert closed_list["isClosed"] is True and closed_detail["isClosed"] is True


@pytest.mark.asyncio
async def test_start_revision_permissions_and_read_only_class(
    client, make_assignment, teacher_user, student_user, db_session, settings,
):
    assignment, _first, _published = await first_publication(
        client, make_assignment, teacher_user, student_user, db_session, settings, maxRevisions=1,
    )
    path = student_path(assignment) + "/submission/start-revision"
    outsider = await create_user(db_session, settings, client, role=UserRole.STUDENT, prefix="outsider")
    await login_as(client, settings, db_session, outsider)
    denied = await client.post(path, headers=HEADERS)
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "ACCESS_DENIED"
    await login_as(client, settings, db_session, teacher_user)
    denied = await client.post(path, headers=HEADERS)
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "STUDENT_REQUIRED"
    ended = await create_term(db_session, ended=True)
    async with get_session_factory()() as session:
        classroom = await session.get(Classroom, uuid.UUID(assignment["classroomId"]))
        classroom.term_id = ended.id
        await session.commit()
    await login_as(client, settings, db_session, student_user)
    view = (await client.get(student_path(assignment) + "/submission")).json()
    assert not view["canStartRevision"] and view["startRevisionBlockedReason"] == "CLASSROOM_READ_ONLY"
    denied = await client.post(path, headers=HEADERS)
    assert denied.status_code == 409 and denied.json()["error"]["code"] == "CLASSROOM_READ_ONLY"


@pytest.mark.asyncio
async def test_revision_settings_validate_snapshot_and_used_limit(
    client, make_assignment, teacher_user, student_user, db_session, settings, deadline_clock,
):
    due = (deadline_clock[0] + timedelta(days=5)).isoformat()
    draft = await make_assignment(publish=False, maxRevisions=1, revisionDueAt=due)
    assert draft["maxRevisions"] == 1 and draft["revisionDueAt"] == due
    path = f"/api/teacher/assignments/{draft['id']}"
    for invalid in (None, True, -1, 3, 1.5, "1", [], {}):
        for url in (path, "/api/teacher/assignments"):
            response = await client.request(
                "PATCH" if url == path else "POST", url, headers=HEADERS,
                json={"sourcePromptId": draft["sourcePromptId"], "rubricId": draft["rubricId"], "maxRevisions": invalid},
            )
            assert response.status_code == 400, response.text
            assert response.json()["error"]["fields"]["maxRevisions"]
    response = await client.patch(path, headers=HEADERS, json={"revisionDueAt": "invalid"})
    assert response.status_code == 400 and response.json()["error"]["fields"]["revisionDueAt"]
    updated = await client.patch(path, headers=HEADERS, json={"maxRevisions": 2, "revisionDueAt": None})
    assert updated.status_code == 200
    published = await client.post(path + "/publish", headers=HEADERS)
    assert published.status_code == 200
    assert published.json()["publishedSnapshot"]["maxRevisions"] == 2
    assert published.json()["publishedSnapshot"]["revisionDueAt"] is None
    for invalid in (None, -1, True, 3, "2"):
        response = await client.patch(path + "/settings", headers=HEADERS, json={"maxRevisions": invalid})
        assert response.status_code == 400, response.text
    updated = await client.patch(path + "/settings", headers=HEADERS, json={"maxRevisions": 1, "revisionDueAt": due})
    assert updated.status_code == 200, updated.text
    assert updated.json()["publishedSnapshot"]["maxRevisions"] == 1
    assert updated.json()["publishedSnapshot"]["revisionDueAt"] == due
    await login_as(client, settings, db_session, student_user)
    student_view = (await client.get(student_path(draft))).json()
    assert student_view["maxRevisions"] == 1 and student_view["revisionDueAt"] == due
    await confirm_round(client, draft, settings)
    await publish_round(client, draft, student_user, teacher_user, db_session, settings)
    started = await client.post(student_path(draft) + "/submission/start-revision", headers=HEADERS)
    assert started.status_code == 200
    await login_as(client, settings, db_session, teacher_user)
    blocked = await client.patch(path + "/settings", headers=HEADERS, json={"maxRevisions": 0})
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "REVISION_LIMIT_IN_USE"
    allowed = await client.patch(path + "/settings", headers=HEADERS, json={"maxRevisions": 2})
    assert allowed.status_code == 200
    allowed = await client.patch(path + "/settings", headers=HEADERS, json={"maxRevisions": 1})
    assert allowed.status_code == 200
    other_teacher = await create_user(db_session, settings, client, role=UserRole.TEACHER, prefix="other_gv")
    await login_as(client, settings, db_session, other_teacher)
    assert (await client.patch(path + "/settings", headers=HEADERS, json={"maxRevisions": 2})).status_code == 404
    async with get_session_factory()() as session:
        assignment = await session.get(Assignment, uuid.UUID(draft["id"]))
        assert assignment.max_revisions == 1


@pytest.mark.asyncio
async def test_limit_change_and_start_revision_serialize(
    client, make_assignment, teacher_user, student_user, db_session, settings,
):
    assignment, _first, _published = await first_publication(
        client, make_assignment, teacher_user, student_user, db_session, settings, maxRevisions=1,
    )
    factory = get_session_factory()

    async def start():
        async with factory() as session:
            try:
                payload = await SubmissionService(session, settings).start_revision(student_user, assignment["id"])
                return payload["revisionRound"]
            except SubmissionError as exc:
                await session.rollback()
                return exc.code

    async def reduce():
        async with factory() as session:
            try:
                payload = await AssignmentService(session).update_published_settings(
                    teacher_user, uuid.UUID(assignment["id"]), {"maxRevisions": 0},
                )
                return payload["maxRevisions"]
            except CatalogError as exc:
                await session.rollback()
                return exc.code

    outcomes = await asyncio.gather(start(), reduce())
    assert outcomes in ([2, "REVISION_LIMIT_IN_USE"], ["REVISION_DISABLED", 0])
    async with factory() as session:
        saved = await session.get(Assignment, uuid.UUID(assignment["id"]))
        highest = await session.scalar(select(func.max(SubmissionAttempt.revision_round)))
        assert highest - 1 <= saved.max_revisions
