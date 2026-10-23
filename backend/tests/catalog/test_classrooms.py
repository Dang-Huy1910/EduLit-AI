from __future__ import annotations

import uuid
from io import BytesIO

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.db.models import Assignment, AssignmentAccess, ClassMembership, StudentOutlinePrep, Term, User, UserRole
from app.services.classroom_service import JOIN_CODE_ALPHABET, school_today, term_status
from tests.catalog.conftest import (
    HEADERS,
    create_term,
    create_user,
    login_as,
    seed_classroom_with_student,
)
from tests.catalog.test_assignment_flow import _create_ready_prompt


async def _term(db_session: AsyncSession, code: str = "2026-2027-HK1") -> Term:
    return (
        await db_session.execute(select(Term).where(Term.code == code))
    ).scalar_one()


def _jpeg_bytes() -> bytes:
    image = Image.new("RGB", (200, 200), "white")
    output = BytesIO()
    image.save(output, format="JPEG")
    return output.getvalue()


async def _publish_whole_class(
    client: AsyncClient, classroom_id: uuid.UUID, *, title: str = "Bài giao cả lớp"
) -> dict:
    catalog = await _create_ready_prompt(client)
    created = await client.post(
        "/api/teacher/assignments",
        headers=HEADERS,
        json={
            "sourcePromptId": catalog["prompt"]["id"],
            "rubricId": catalog["rubric"]["id"],
            "classroomId": str(classroom_id),
            "assignToWholeClass": True,
            "title": title,
        },
    )
    assert created.status_code == 201, created.text
    published = await client.post(
        f"/api/teacher/assignments/{created.json()['id']}/publish",
        headers=HEADERS,
        json={},
    )
    assert published.status_code == 200, published.text
    return published.json()


@pytest.mark.asyncio
async def test_list_terms_marks_hk1_from_school_today(
    client: AsyncClient, teacher_user: User, db_session: AsyncSession
) -> None:
    response = await client.get("/api/terms", headers=HEADERS)
    assert response.status_code == 200
    hk1 = next(item for item in response.json()["items"] if item["code"] == "2026-2027-HK1")
    term = await _term(db_session)
    expected = term_status(term, school_today())
    assert hk1["status"] == expected
    terms = (await db_session.execute(select(Term).order_by(Term.starts_on))).scalars().all()
    statuses = {item.id: term_status(item, school_today()) for item in terms}
    has_active = any(value == "ACTIVE" for value in statuses.values())
    next_upcoming = next((item.id for item in terms if statuses[item.id] == "UPCOMING"), None)
    assert hk1["isCurrent"] is (
        expected == "ACTIVE" or (not has_active and term.id == next_upcoming)
    )


@pytest.mark.asyncio
async def test_teacher_creates_classroom_and_rejects_duplicate_or_ended_term(
    client: AsyncClient, teacher_user: User, db_session: AsyncSession
) -> None:
    term = await _term(db_session)
    body = {
        "termId": str(term.id),
        "code": "12a1",
        "gradeLevel": 12,
        "subject": "Ngữ văn",
    }
    created = await client.post("/api/teacher/classrooms", headers=HEADERS, json=body)
    assert created.status_code == 201, created.text
    classroom = created.json()
    assert classroom["code"] == "12A1"
    assert len(classroom["joinCode"]) == 6
    assert set(classroom["joinCode"]) <= set(JOIN_CODE_ALPHABET)
    owner_membership = (
        await db_session.execute(
            select(ClassMembership).where(
                ClassMembership.classroom_id == uuid.UUID(classroom["id"]),
                ClassMembership.user_id == teacher_user.id,
            )
        )
    ).scalar_one()
    assert owner_membership.membership_role == "TEACHER"
    assert owner_membership.status == "ACTIVE"

    duplicate = await client.post("/api/teacher/classrooms", headers=HEADERS, json=body)
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "CLASSROOM_EXISTS"

    ended = await create_term(db_session, ended=True)
    body["termId"] = str(ended.id)
    ended_response = await client.post("/api/teacher/classrooms", headers=HEADERS, json=body)
    assert ended_response.status_code == 409
    assert ended_response.json()["error"]["code"] == "TERM_ENDED"


@pytest.mark.asyncio
async def test_student_joins_by_normalized_code_and_does_not_duplicate_membership(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
    settings: Settings,
) -> None:
    classroom = await seed_classroom_with_student(db_session, teacher_user, student_user)
    newcomer = await create_user(
        db_session, settings, client, role=UserRole.STUDENT, prefix="newcomer"
    )
    await login_as(client, settings, db_session, newcomer)
    joined = await client.post(
        "/api/student/classrooms/join",
        headers=HEADERS,
        json={"code": f"  {classroom.join_code.lower()}  "},
    )
    assert joined.status_code == 200, joined.text
    assert joined.json()["alreadyMember"] is False
    repeated = await client.post(
        "/api/student/classrooms/join", headers=HEADERS, json={"code": classroom.join_code}
    )
    assert repeated.status_code == 200
    assert repeated.json()["alreadyMember"] is True
    rows = (
        await db_session.execute(
            select(ClassMembership).where(
                ClassMembership.classroom_id == classroom.id,
                ClassMembership.user_id == newcomer.id,
            )
        )
    ).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_join_rejects_bad_disabled_and_read_only_classrooms(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
    settings: Settings,
) -> None:
    classroom = await seed_classroom_with_student(db_session, teacher_user, student_user)
    newcomer = await create_user(
        db_session, settings, client, role=UserRole.STUDENT, prefix="joinfail"
    )
    await login_as(client, settings, db_session, newcomer)
    invalid = await client.post("/api/student/classrooms/join", headers=HEADERS, json={"code": "bad"})
    assert invalid.status_code == 404
    assert invalid.json()["error"]["code"] == "JOIN_CODE_INVALID"

    await login_as(client, settings, db_session, teacher_user)
    disabled = await client.patch(
        f"/api/teacher/classrooms/{classroom.id}",
        headers=HEADERS,
        json={"joinEnabled": False},
    )
    assert disabled.status_code == 200
    await login_as(client, settings, db_session, newcomer)
    disabled_join = await client.post(
        "/api/student/classrooms/join", headers=HEADERS, json={"code": classroom.join_code}
    )
    assert disabled_join.status_code == 409
    assert disabled_join.json()["error"]["code"] == "JOIN_DISABLED"

    ended = await create_term(db_session, ended=True)
    ended_classroom = await seed_classroom_with_student(
        db_session, teacher_user, student_user, code="12A15", term=ended
    )
    read_only = await client.post(
        "/api/student/classrooms/join", headers=HEADERS, json={"code": ended_classroom.join_code}
    )
    assert read_only.status_code == 409
    assert read_only.json()["error"]["code"] == "CLASSROOM_READ_ONLY"


@pytest.mark.asyncio
async def test_rotate_join_code_invalidates_the_old_code(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
    settings: Settings,
) -> None:
    classroom = await seed_classroom_with_student(db_session, teacher_user, student_user)
    old_code = classroom.join_code
    rotated = await client.post(
        f"/api/teacher/classrooms/{classroom.id}/join-code/rotate", headers=HEADERS, json={}
    )
    assert rotated.status_code == 200
    new_code = rotated.json()["joinCode"]
    assert new_code != old_code
    newcomer = await create_user(
        db_session, settings, client, role=UserRole.STUDENT, prefix="rotate"
    )
    await login_as(client, settings, db_session, newcomer)
    old = await client.post("/api/student/classrooms/join", headers=HEADERS, json={"code": old_code})
    assert old.status_code == 404
    fresh = await client.post("/api/student/classrooms/join", headers=HEADERS, json={"code": new_code})
    assert fresh.status_code == 200


@pytest.mark.asyncio
async def test_late_joiner_receives_published_whole_class_assignment_and_outline_prep(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
    settings: Settings,
) -> None:
    classroom = await seed_classroom_with_student(db_session, teacher_user, student_user)
    published = await _publish_whole_class(client, classroom.id)
    late_student = await create_user(
        db_session, settings, client, role=UserRole.STUDENT, prefix="late"
    )
    await login_as(client, settings, db_session, late_student)
    joined = await client.post(
        "/api/student/classrooms/join", headers=HEADERS, json={"code": classroom.join_code}
    )
    assert joined.status_code == 200
    assignments = await client.get("/api/assignments", headers=HEADERS)
    assert assignments.status_code == 200
    assert published["code"] in {item["code"] for item in assignments.json()["items"]}
    prep = (
        await db_session.execute(
            select(StudentOutlinePrep).where(
                StudentOutlinePrep.assignment_revision_id
                == uuid.UUID(published["publishedRevisionId"]),
                StudentOutlinePrep.student_id == late_student.id,
            )
        )
    ).scalar_one_or_none()
    assert prep is not None


@pytest.mark.asyncio
async def test_remove_and_rejoin_revokes_then_restores_assignment_access(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
    settings: Settings,
) -> None:
    classroom = await seed_classroom_with_student(db_session, teacher_user, student_user)
    published = await _publish_whole_class(client, classroom.id)
    revision_id = uuid.UUID(published["publishedRevisionId"])
    removed = await client.delete(
        f"/api/teacher/classrooms/{classroom.id}/members/{student_user.id}", headers=HEADERS
    )
    assert removed.status_code == 204
    membership = (
        await db_session.execute(
            select(ClassMembership).where(
                ClassMembership.classroom_id == classroom.id,
                ClassMembership.user_id == student_user.id,
            )
        )
    ).scalar_one()
    access = (
        await db_session.execute(
            select(AssignmentAccess).where(
                AssignmentAccess.assignment_revision_id == revision_id,
                AssignmentAccess.student_id == student_user.id,
            )
        )
    ).scalar_one()
    assert membership.status == "REMOVED"
    assert access.revoked_at is not None

    await login_as(client, settings, db_session, student_user)
    invisible = await client.get("/api/assignments", headers=HEADERS)
    assert published["code"] not in {item["code"] for item in invisible.json()["items"]}
    rejoined = await client.post(
        "/api/student/classrooms/join", headers=HEADERS, json={"code": classroom.join_code}
    )
    assert rejoined.status_code == 200
    restored = await client.get("/api/assignments", headers=HEADERS)
    assert published["code"] in {item["code"] for item in restored.json()["items"]}


@pytest.mark.asyncio
async def test_teacher_classroom_routes_enforce_roles_and_ownership(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
    settings: Settings,
) -> None:
    classroom = await seed_classroom_with_student(db_session, teacher_user, student_user)
    await login_as(client, settings, db_session, student_user)
    forbidden = await client.get(f"/api/teacher/classrooms/{classroom.id}", headers=HEADERS)
    assert forbidden.status_code == 403
    forbidden_patch = await client.patch(
        f"/api/teacher/classrooms/{classroom.id}", headers=HEADERS, json={"name": "Không được"}
    )
    assert forbidden_patch.status_code == 403
    other_teacher = await create_user(
        db_session, settings, client, role=UserRole.TEACHER, prefix="othergv"
    )
    await login_as(client, settings, db_session, other_teacher)
    missing = await client.get(f"/api/teacher/classrooms/{classroom.id}", headers=HEADERS)
    assert missing.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("read_only_kind", ["archived", "ended"])
async def test_archived_or_ended_classroom_cannot_publish(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
    read_only_kind: str,
) -> None:
    classroom = await seed_classroom_with_student(db_session, teacher_user, student_user)
    catalog = await _create_ready_prompt(client)
    created = await client.post(
        "/api/teacher/assignments",
        headers=HEADERS,
        json={
            "sourcePromptId": catalog["prompt"]["id"],
            "rubricId": catalog["rubric"]["id"],
            "classroomId": str(classroom.id),
            "assignToWholeClass": True,
        },
    )
    assert created.status_code == 201
    if read_only_kind == "archived":
        archived = await client.patch(
            f"/api/teacher/classrooms/{classroom.id}", headers=HEADERS, json={"archived": True}
        )
        assert archived.status_code == 200
    else:
        ended = await create_term(db_session, ended=True)
        classroom.term_id = ended.id
        classroom.academic_year = ended.academic_year
        await db_session.commit()
    blocked = await client.post(
        f"/api/teacher/assignments/{created.json()['id']}/publish", headers=HEADERS, json={}
    )
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "CLASSROOM_READ_ONLY"


@pytest.mark.asyncio
async def test_ended_classroom_disables_submission_payload_and_submit(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
    settings: Settings,
) -> None:
    classroom = await seed_classroom_with_student(db_session, teacher_user, student_user)
    published = await _publish_whole_class(client, classroom.id)
    await login_as(client, settings, db_session, student_user)
    uploaded = await client.post(
        f"/api/assignments/{published['id']}/submission/pages",
        headers={"Origin": "http://localhost:3000", "X-Edulit-CSRF": "1"},
        files={"file": ("page.jpg", _jpeg_bytes(), "image/jpeg")},
    )
    assert uploaded.status_code == 200, uploaded.text

    ended = await create_term(db_session, ended=True)
    classroom.term_id = ended.id
    classroom.academic_year = ended.academic_year
    await db_session.commit()

    payload = await client.get(f"/api/assignments/{published['id']}/submission", headers=HEADERS)
    assert payload.status_code == 200, payload.text
    assert payload.json()["classroomReadOnly"] is True
    assert payload.json()["canEditPages"] is False
    assert payload.json()["canSubmit"] is False
    blocked = await client.post(
        f"/api/assignments/{published['id']}/submission/submit", headers=HEADERS
    )
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "CLASSROOM_READ_ONLY"


@pytest.mark.asyncio
async def test_draft_can_move_from_ended_classroom_but_cannot_be_edited_in_place(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
) -> None:
    current_classroom = await seed_classroom_with_student(db_session, teacher_user, student_user)
    ended = await create_term(db_session, ended=True)
    ended_classroom = await seed_classroom_with_student(
        db_session, teacher_user, student_user, code="12A16", term=ended
    )
    catalog = await _create_ready_prompt(client)
    created = await client.post(
        "/api/teacher/assignments",
        headers=HEADERS,
        json={
            "sourcePromptId": catalog["prompt"]["id"],
            "rubricId": catalog["rubric"]["id"],
            "classroomId": str(current_classroom.id),
            "assignToWholeClass": True,
        },
    )
    assert created.status_code == 201, created.text
    assignment = await db_session.get(Assignment, uuid.UUID(created.json()["id"]))
    assert assignment is not None
    assignment.classroom_id = ended_classroom.id
    await db_session.commit()

    moved = await client.patch(
        f"/api/teacher/assignments/{assignment.id}",
        headers=HEADERS,
        json={"classroomId": str(current_classroom.id)},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["classroomId"] == str(current_classroom.id)

    await db_session.refresh(assignment)
    assignment.classroom_id = ended_classroom.id
    await db_session.commit()
    blocked = await client.patch(
        f"/api/teacher/assignments/{assignment.id}",
        headers=HEADERS,
        json={"title": "Không được sửa"},
    )
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "CLASSROOM_READ_ONLY"


@pytest.mark.asyncio
async def test_join_rate_limit_uses_class_join_bucket(
    client: AsyncClient, student_user: User, settings: Settings, db_session: AsyncSession
) -> None:
    await login_as(client, settings, db_session, student_user)
    for _ in range(settings.RATE_LIMIT_CLASS_JOIN_MAX):
        response = await client.post("/api/student/classrooms/join", headers=HEADERS, json={"code": "bad"})
        assert response.status_code == 404
    limited = await client.post("/api/student/classrooms/join", headers=HEADERS, json={"code": "bad"})
    assert limited.status_code == 429


@pytest.mark.asyncio
async def test_teacher_extends_due_at_of_published_assignment(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
    settings: Settings,
) -> None:
    classroom = await seed_classroom_with_student(db_session, teacher_user, student_user)
    published = await _publish_whole_class(client, classroom.id)

    extended = await client.patch(
        f"/api/teacher/assignments/{published['id']}/due-at",
        headers=HEADERS,
        json={"dueAt": "2026-12-01T16:59:00Z"},
    )
    assert extended.status_code == 200, extended.text
    assert extended.json()["status"] == "PUBLISHED"
    assert extended.json()["dueAt"].startswith("2026-12-01T16:59:00")

    await login_as(client, settings, db_session, student_user)
    payload = await client.get(f"/api/assignments/{published['id']}/submission", headers=HEADERS)
    assert payload.status_code == 200, payload.text
    assert payload.json()["assignment"]["dueAt"].startswith("2026-12-01T16:59:00")

    await login_as(client, settings, db_session, teacher_user)
    cleared = await client.patch(
        f"/api/teacher/assignments/{published['id']}/due-at", headers=HEADERS, json={"dueAt": None}
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["dueAt"] is None

    ended = await create_term(db_session, ended=True)
    classroom.term_id = ended.id
    classroom.academic_year = ended.academic_year
    await db_session.commit()
    blocked = await client.patch(
        f"/api/teacher/assignments/{published['id']}/due-at",
        headers=HEADERS,
        json={"dueAt": "2026-12-05T16:59:00Z"},
    )
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "CLASSROOM_READ_ONLY"
