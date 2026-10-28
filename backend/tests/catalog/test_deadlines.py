from __future__ import annotations

import io
import uuid
from datetime import timedelta

import pytest
import pytest_asyncio
from PIL import Image

from app.core.http import utcnow
from app.db.models import Assignment, AssignmentRevision, ClassMembership, Classroom, SubmissionAttempt, UserRole
from app.db.session import get_session_factory
from app.services import assessment_service, assignment_service, ocr_service, submission_service
from tests.catalog.conftest import HEADERS, create_term, create_user, login_as, seed_classroom_with_student
from tests.catalog.test_assignment_flow import _create_ready_prompt


@pytest.fixture
def deadline_clock(monkeypatch):
    clock = [utcnow()]
    for module in (assessment_service, assignment_service, ocr_service, submission_service):
        monkeypatch.setattr(module, "utcnow", lambda: clock[0])
    return clock


@pytest_asyncio.fixture
async def make_assignment(client, teacher_user, student_user, db_session, deadline_clock):
    classroom = await seed_classroom_with_student(db_session, teacher_user, student_user)
    catalog = await _create_ready_prompt(client)

    async def make(*, publish=True, **overrides):
        body = {
            "sourcePromptId": catalog["prompt"]["id"],
            "rubricId": catalog["rubric"]["id"],
            "classroomId": str(classroom.id),
            "assignToWholeClass": True,
            "dueAt": (deadline_clock[0] + timedelta(hours=1)).isoformat(),
            **overrides,
        }
        response = await client.post("/api/teacher/assignments", headers=HEADERS, json=body)
        assert response.status_code == 201, response.text
        assignment = response.json()
        if publish:
            response = await client.post(
                f"/api/teacher/assignments/{assignment['id']}/publish", headers=HEADERS,
            )
            assert response.status_code == 200, response.text
            assignment = response.json()
        return assignment

    return make


def _image():
    buffer = io.BytesIO()
    Image.new("RGB", (600, 800), "white").save(buffer, format="PNG")
    return ("bai.png", buffer.getvalue(), "image/png")


async def _upload(client, assignment_id):
    response = await client.post(
        f"/api/assignments/{assignment_id}/submission/pages",
        headers={k: v for k, v in HEADERS.items() if k != "Content-Type"},
        files={"file": _image()},
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _run_ocr(settings):
    factory = get_session_factory()
    async with factory() as session:
        jobs = await ocr_service.claim_jobs(session, limit=1, lease_seconds=300)
        await session.commit()
    assert len(jobs) == 1
    attempt_id, lease = jobs[0]
    assert await ocr_service.process_claimed_job(factory, attempt_id, lease, settings) == "READY"


@pytest.mark.asyncio
@pytest.mark.parametrize("policy", [None, "ALLOW_LATE"])
async def test_default_and_allow_late_submit_and_report(
    client, make_assignment, teacher_user, student_user, db_session, settings, deadline_clock, policy,
):
    assignment = await make_assignment(**({"latePolicy": policy} if policy else {}))
    assignment_id = assignment["id"]
    assert assignment["latePolicy"] == "ALLOW_LATE"
    assert assignment["publishedSnapshot"]["latePolicy"] == "ALLOW_LATE"
    deadline_clock[0] += timedelta(hours=2)
    await login_as(client, settings, db_session, student_user)
    draft = await _upload(client, assignment_id)
    assert not draft["isClosed"] and not draft["isLate"]
    submitted = await client.post(f"/api/assignments/{assignment_id}/submission/submit", headers=HEADERS)
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["isLate"] is True
    assert submitted.json()["officialSubmittedAt"] is None
    assert submitted.json()["effectiveDueAt"] == draft["dueAt"]

    await login_as(client, settings, db_session, teacher_user)
    report = await client.get(f"/api/teacher/reports/{assignment_id}?status=late&mode=provisional")
    assert report.status_code == 200, report.text
    assert report.json()["students"]["total"] == 1
    row = report.json()["students"]["items"][0]
    assert row["isLate"] and not row["hasExtension"]
    assert row["effectiveDueAt"] == draft["dueAt"]
    assert report.json()["stats"]["late"] == 1
    official = await client.get(f"/api/teacher/reports/{assignment_id}?status=late&mode=official")
    assert official.json()["stats"]["late"] == 1
    detail = await client.get(f"/api/teacher/assignments/{assignment_id}/students/{student_user.id}/assessment")
    assert detail.status_code == 200, detail.text
    assert detail.json()["submission"]["isLate"] is True
    progress = await client.get(f"/api/teacher/assignments/{assignment_id}")
    assert progress.json()["submissionProgress"]["late"] == 1
    # A pending student stays in their normal status and is excluded by the late filter.
    pending = await make_assignment()
    report = await client.get(f"/api/teacher/reports/{pending['id']}?status=late")
    assert report.json()["students"]["total"] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["upload", "update", "replace", "delete", "delete_all", "reorder", "submit", "new_attempt"])
async def test_close_at_due_blocks_draft_mutations(
    client, make_assignment, student_user, db_session, settings, deadline_clock, operation,
):
    assignment = await make_assignment(latePolicy="CLOSE_AT_DUE")
    await login_as(client, settings, db_session, student_user)
    draft = await _upload(client, assignment["id"])
    page_id = draft["pages"][0]["id"]
    path = f"/api/assignments/{assignment['id']}/submission"
    deadline_clock[0] += timedelta(hours=2)
    if operation in {"upload", "replace"}:
        suffix = "/pages" if operation == "upload" else f"/pages/{page_id}/replace"
        response = await client.post(path + suffix, files={"file": _image()}, headers={
            k: v for k, v in HEADERS.items() if k != "Content-Type"
        })
    elif operation == "update":
        response = await client.patch(path + f"/pages/{page_id}", json={"rotationDegrees": 90}, headers=HEADERS)
    elif operation in {"delete", "delete_all"}:
        suffix = f"/pages/{page_id}" if operation == "delete" else "/pages"
        response = await client.delete(path + suffix, headers=HEADERS)
    else:
        suffix = {"reorder": "/reorder", "submit": "/submit", "new_attempt": "/new-attempt"}[operation]
        response = await client.post(path + suffix, json={"pageIds": [page_id]}, headers=HEADERS)
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "SUBMISSION_CLOSED"
    read = await client.get(path)
    assert read.status_code == 200
    assert read.json()["isClosed"]
    assert not read.json()["canEditPages"] and not read.json()["canSubmit"]
    assert len(read.json()["pages"]) == 1
    assert (await client.get(read.json()["pages"][0]["imageUrl"])).status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("whole_class", [True, False])
async def test_extension_opens_only_recipient_and_removal_closes_again(
    client, make_assignment, teacher_user, student_user, db_session, settings, deadline_clock, whole_class,
):
    assignment = await make_assignment(
        latePolicy="CLOSE_AT_DUE", assignToWholeClass=whole_class,
        recipientStudentIds=[str(student_user.id)],
    )
    deadline_clock[0] += timedelta(hours=2)
    assignment_id = assignment["id"]
    extension_path = f"/api/teacher/assignments/{assignment_id}/students/{student_user.id}/due-extension"
    extended = deadline_clock[0] + timedelta(hours=1)
    response = await client.put(extension_path, json={"dueAt": extended.isoformat()}, headers=HEADERS)
    assert response.status_code == 200, response.text
    assert response.json()["submission"]["hasExtension"]
    assert response.json()["submission"]["effectiveDueAt"] == extended.isoformat()
    await login_as(client, settings, db_session, student_user)
    listing = await client.get("/api/assignments")
    item = next(item for item in listing.json()["items"] if item["id"] == assignment_id)
    assert not item["isClosed"] and item["effectiveDueAt"] == extended.isoformat()
    detail = await client.get(f"/api/assignments/{assignment_id}")
    assert detail.json()["hasExtension"]
    draft = await _upload(client, assignment_id)
    assert draft["hasExtension"] and not draft["isClosed"]
    assert (await client.post(f"/api/assignments/{assignment_id}/submission/submit", headers=HEADERS)).json()["isLate"] is False
    await login_as(client, settings, db_session, teacher_user)
    removed = await client.put(extension_path, json={"dueAt": None}, headers=HEADERS)
    assert removed.status_code == 200, removed.text
    assert removed.json()["submission"]["isLate"]
    assert not removed.json()["submission"]["hasExtension"]
    await login_as(client, settings, db_session, student_user)
    read = await client.get(f"/api/assignments/{assignment_id}/submission")
    assert read.json()["isClosed"]
    new = await client.post(f"/api/assignments/{assignment_id}/submission/new-attempt", headers=HEADERS)
    assert new.status_code == 409


@pytest.mark.asyncio
async def test_predeadline_submission_can_retry_edit_confirm_and_granted_reopen_after_due(
    client, make_assignment, teacher_user, student_user, db_session, settings, deadline_clock,
):
    assignment = await make_assignment(latePolicy="CLOSE_AT_DUE")
    assignment_id = assignment["id"]
    path = f"/api/assignments/{assignment_id}"
    await login_as(client, settings, db_session, student_user)
    draft = await _upload(client, assignment_id)
    submitted = await client.post(path + "/submission/submit", headers=HEADERS)
    assert submitted.status_code == 200
    submitted_at = submitted.json()["ocrSubmittedAt"]
    # Simulate an OCR failure after timely photo submission; retry must stay available.
    async with get_session_factory()() as session:
        attempt = await session.get(SubmissionAttempt, uuid.UUID(draft["attemptId"]))
        attempt.state = "FAILED"
        attempt.ocr_status = "FAILED"
        await session.commit()
    deadline_clock[0] += timedelta(hours=2)
    retry = await client.post(path + "/submission/retry-ocr", headers=HEADERS)
    assert retry.status_code == 200, retry.text
    await _run_ocr(settings)
    review = (await client.get(path + "/ocr")).json()
    saved = await client.patch(path + "/ocr/segments", json={"expectedRevision": review["expectedRevision"]}, headers=HEADERS)
    assert saved.status_code == 200, saved.text
    confirmed = await client.post(path + "/ocr/confirm", headers=HEADERS, json={"expectedRevision": review["expectedRevision"]})
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["ocrSubmittedAt"] == submitted_at
    assert confirmed.json()["officialSubmittedAt"] > confirmed.json()["effectiveDueAt"]
    assert not confirmed.json()["isLate"]
    assert not confirmed.json()["canReopenTranscription"]
    assert (await client.post(path + "/submission/submit", headers=HEADERS)).status_code == 200
    for url in (path + "/ocr/reopen", path + "/submission/new-attempt"):
        blocked = await client.post(url, headers=HEADERS)
        assert blocked.status_code == 409, blocked.text
        assert blocked.json()["error"]["code"] == "SUBMISSION_CLOSED"
    await login_as(client, settings, db_session, teacher_user)
    granted = await client.post(
        f"/api/teacher/assignments/{assignment_id}/students/{student_user.id}/assessment/grant-reopen", headers=HEADERS,
    )
    assert granted.status_code == 200, granted.text
    await login_as(client, settings, db_session, student_user)
    assert (await client.post(path + "/submission/new-attempt", headers=HEADERS)).status_code == 409
    reopened = await client.post(path + "/ocr/reopen", headers=HEADERS)
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["canConfirm"] and not reopened.json()["isLate"]
    assert (await client.post(path + "/ocr/reopen", headers=HEADERS)).status_code == 200
    assert (await client.post(path + "/ocr/confirm", headers=HEADERS)).status_code == 200


@pytest.mark.asyncio
async def test_extension_is_per_student_and_other_extensions_are_retained(
    client, make_assignment, teacher_user, student_user, db_session, settings, deadline_clock,
):
    assignment = await make_assignment(latePolicy="CLOSE_AT_DUE")
    other = await create_user(db_session, settings, client, role=UserRole.STUDENT, prefix="other_hs")
    db_session.add(ClassMembership(
        classroom_id=uuid.UUID(assignment["classroomId"]), user_id=other.id,
        membership_role="STUDENT", status="ACTIVE",
    ))
    await db_session.commit()
    teacher_path = f"/api/teacher/assignments/{assignment['id']}"
    added = await client.patch(teacher_path + "/settings", headers=HEADERS, json={"assignToWholeClass": True})
    assert added.status_code == 200, added.text
    deadline_clock[0] += timedelta(hours=2)
    extended = (deadline_clock[0] + timedelta(hours=1)).isoformat()
    first_path = teacher_path + f"/students/{student_user.id}/due-extension"
    response = await client.put(first_path, headers=HEADERS, json={"dueAt": extended})
    assert response.status_code == 200
    await login_as(client, settings, db_session, other)
    other_view = await client.get(f"/api/assignments/{assignment['id']}/submission")
    assert other_view.json()["isClosed"] and not other_view.json()["hasExtension"]
    blocked = await client.post(
        f"/api/assignments/{assignment['id']}/submission/pages", files={"file": _image()},
        headers={k: v for k, v in HEADERS.items() if k != "Content-Type"},
    )
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "SUBMISSION_CLOSED"
    await login_as(client, settings, db_session, teacher_user)
    response = await client.put(
        teacher_path + f"/students/{other.id}/due-extension", headers=HEADERS, json={"dueAt": extended},
    )
    assert response.status_code == 200
    async with get_session_factory()() as session:
        saved = await session.get(Assignment, uuid.UUID(assignment["id"]))
        assert saved.due_extensions == {str(student_user.id): extended, str(other.id): extended}
    assert (await client.put(first_path, headers=HEADERS, json={"dueAt": None})).status_code == 200
    await login_as(client, settings, db_session, other)
    other_view = await client.get(f"/api/assignments/{assignment['id']}/submission")
    assert not other_view.json()["isClosed"] and other_view.json()["hasExtension"]


@pytest.mark.asyncio
async def test_close_policy_without_due_date_keeps_draft_editable(
    client, make_assignment, student_user, db_session, settings,
):
    assignment = await make_assignment(latePolicy="CLOSE_AT_DUE", dueAt=None)
    await login_as(client, settings, db_session, student_user)
    draft = await _upload(client, assignment["id"])
    path = f"/api/assignments/{assignment['id']}/submission"
    repeat = await client.post(path + "/new-attempt", headers=HEADERS)
    assert repeat.status_code == 200, repeat.text
    assert repeat.json()["attemptId"] == draft["attemptId"]
    page_id = draft["pages"][0]["id"]
    updated = await client.patch(path + f"/pages/{page_id}", headers=HEADERS, json={"rotationDegrees": 90})
    assert updated.status_code == 200, updated.text
    assert updated.json()["canSubmit"]
    submitted = await client.post(path + "/submit", headers=HEADERS)
    assert submitted.status_code == 200, submitted.text
    assert not submitted.json()["isClosed"] and not submitted.json()["isLate"]


@pytest.mark.asyncio
async def test_extension_permissions_validation_and_read_only_class(
    client, make_assignment, teacher_user, student_user, db_session, settings,
):
    assignment = await make_assignment(latePolicy="CLOSE_AT_DUE")
    assignment_id = assignment["id"]
    path = f"/api/teacher/assignments/{assignment_id}/students/{student_user.id}/due-extension"
    for body in ({}, {"dueAt": "bad-date"}, {"dueAt": ""}, {"dueAt": 20261028}):
        response = await client.put(path, json=body, headers=HEADERS)
        assert response.status_code == 400, response.text
        assert response.json()["error"]["code"] == "VALIDATION"
    outsider = await create_user(db_session, settings, client, role=UserRole.STUDENT, prefix="outsider")
    response = await client.put(path.replace(str(student_user.id), str(outsider.id)), json={"dueAt": None}, headers=HEADERS)
    assert response.status_code == 403
    other_teacher = await create_user(db_session, settings, client, role=UserRole.TEACHER, prefix="other")
    await login_as(client, settings, db_session, other_teacher)
    assert (await client.put(path, json={"dueAt": None}, headers=HEADERS)).status_code == 404
    await login_as(client, settings, db_session, student_user)
    assert (await client.put(path, json={"dueAt": None}, headers=HEADERS)).status_code == 403
    assert (await client.get(f"/api/assignments/{assignment_id}/submission")).status_code == 200
    await login_as(client, settings, db_session, outsider)
    assert (await client.get(f"/api/assignments/{assignment_id}/submission")).status_code == 403
    await login_as(client, settings, db_session, teacher_user)
    draft = await make_assignment(publish=False)
    response = await client.put(path.replace(assignment_id, draft["id"]), json={"dueAt": None}, headers=HEADERS)
    assert response.status_code == 404
    ended_term = await create_term(db_session, ended=True)
    async with get_session_factory()() as session:
        classroom = await session.get(Classroom, uuid.UUID(assignment["classroomId"]))
        classroom.term_id = ended_term.id
        await session.commit()
    response = await client.put(path, json={"dueAt": None}, headers=HEADERS)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CLASSROOM_READ_ONLY"


@pytest.mark.asyncio
async def test_policy_create_draft_and_published_settings(
    client, make_assignment, db_session, student_user, settings,
):
    draft = await make_assignment(publish=False)
    path = f"/api/teacher/assignments/{draft['id']}"
    for invalid in (None, "invalid", [], {}):
        response = await client.patch(path, json={"latePolicy": invalid}, headers=HEADERS)
        assert response.status_code == 400
        assert response.json()["error"]["fields"]["latePolicy"]
    response = await client.patch(path, json={"latePolicy": "CLOSE_AT_DUE"}, headers=HEADERS)
    assert response.status_code == 200 and response.json()["latePolicy"] == "CLOSE_AT_DUE"
    assert (await client.post(path + "/publish", headers=HEADERS)).status_code == 200
    response = await client.patch(path + "/settings", json={"latePolicy": "ALLOW_LATE", "dueAt": None}, headers=HEADERS)
    assert response.status_code == 200, response.text
    assert response.json()["publishedSnapshot"]["latePolicy"] == "ALLOW_LATE"
    assert response.json()["publishedSnapshot"]["dueAt"] is None
    await login_as(client, settings, db_session, student_user)
    payload = (await client.get(f"/api/assignments/{draft['id']}/submission")).json()
    assert payload["dueAt"] is None and payload["effectiveDueAt"] is None
    assert not payload["isClosed"] and not payload["isLate"]
    async with get_session_factory()() as session:
        assignment = await session.get(Assignment, uuid.UUID(draft["id"]))
        revision = await session.get(AssignmentRevision, assignment.published_revision_id)
        assert assignment.late_policy == revision.snapshot["latePolicy"] == "ALLOW_LATE"
