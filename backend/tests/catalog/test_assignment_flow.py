from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.db.models import Assignment, AssignmentAccess, AssignmentRevision, User, UserRole
from app.db.session import get_session_factory
from app.services.catalog_service import CatalogService
from tests.catalog.conftest import (
    FACTORY_TEXT,
    HEADERS,
    VALID_RUBRIC,
    create_user,
    login_as,
    seed_classroom_with_student,
)


async def _create_ready_prompt(client: AsyncClient, *, title: str = "Khói nhà máy") -> dict:
    material_resp = await client.post(
        "/api/teacher/materials",
        headers=HEADERS,
        json={
            "title": "Khói nhà máy và không gian đô thị",
            "author": "Ngữ liệu nội bộ",
            "sourceInfo": "Trích đoạn đọc hiểu nội bộ",
            "gradeLevel": 11,
            "content": FACTORY_TEXT,
        },
    )
    assert material_resp.status_code == 201, material_resp.text
    material = material_resp.json()
    prompt_resp = await client.post(
        "/api/teacher/prompts",
        headers=HEADERS,
        json={
            "title": title,
            "writingTask": "Viết bài nghị luận về trách nhiệm của người trẻ trước khói nhà máy.",
            "genre": "NLXH",
            "gradeLevel": 11,
            "materialIds": [material["id"]],
        },
    )
    assert prompt_resp.status_code == 201, prompt_resp.text
    prompt = prompt_resp.json()
    rubric_resp = await client.post("/api/teacher/rubrics", headers=HEADERS, json=VALID_RUBRIC)
    assert rubric_resp.status_code == 201, rubric_resp.text
    return {"material": material, "prompt": prompt, "rubric": rubric_resp.json()}


@pytest.mark.asyncio
async def test_create_assignment_requires_source_prompt(
    client: AsyncClient, teacher_user: User
) -> None:
    resp = await client.post(
        "/api/teacher/assignments",
        headers=HEADERS,
        json={"title": "Bài không có đề", "rubricId": str(uuid.uuid4())},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "PROMPT_REQUIRED"


@pytest.mark.asyncio
async def test_incomplete_prompt_cannot_be_used(
    client: AsyncClient, teacher_user: User
) -> None:
    incomplete = await client.post(
        "/api/teacher/prompts",
        headers=HEADERS,
        json={"title": "Đề thiếu ngữ liệu", "writingTask": "", "genre": "NLXH", "gradeLevel": 11},
    )
    assert incomplete.status_code == 201
    body = incomplete.json()
    assert body["ready"] is False
    assert "materials" in body["missing"]

    rubric = await client.post("/api/teacher/rubrics", headers=HEADERS, json=VALID_RUBRIC)
    resp = await client.post(
        "/api/teacher/assignments",
        headers=HEADERS,
        json={"sourcePromptId": body["id"], "rubricId": rubric.json()["id"]},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "PROMPT_INCOMPLETE"


@pytest.mark.asyncio
async def test_invalid_rubric_import_rejected(client: AsyncClient, teacher_user: User) -> None:
    resp = await client.post(
        "/api/teacher/rubrics",
        headers=HEADERS,
        json={"title": "Sai", "maxScore": 4, "criteria": [{"id": "C1", "name": "A", "weight": 1}]},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "RUBRIC_WEIGHT_SUM"


@pytest.mark.asyncio
async def test_valid_rubric_import_and_not_applied_from_catalog(
    client: AsyncClient, teacher_user: User
) -> None:
    resp = await client.post("/api/teacher/rubrics", headers=HEADERS, json=VALID_RUBRIC)
    assert resp.status_code == 201
    body = resp.json()
    assert body["maxScore"] == 4.0
    assert body["criteriaCount"] == 4
    listed = await client.get("/api/teacher/assignments", headers=HEADERS)
    assert listed.status_code == 200
    assert listed.json()["items"] == []


@pytest.mark.asyncio
async def test_assignment_rubric_edit_does_not_change_catalog_or_other_assignment(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
) -> None:
    classroom = await seed_classroom_with_student(db_session, teacher_user, student_user)
    catalog = await _create_ready_prompt(client)
    first = await client.post(
        "/api/teacher/assignments",
        headers=HEADERS,
        json={
            "sourcePromptId": catalog["prompt"]["id"],
            "rubricId": catalog["rubric"]["id"],
            "classroomId": str(classroom.id),
            "title": "Bài A",
        },
    )
    second = await client.post(
        "/api/teacher/assignments",
        headers=HEADERS,
        json={
            "sourcePromptId": catalog["prompt"]["id"],
            "rubricId": catalog["rubric"]["id"],
            "classroomId": str(classroom.id),
            "title": "Bài B",
        },
    )
    assert first.status_code == 201
    edited = dict(first.json()["assignmentRubric"])
    edited["criteria"] = [
        {**c, "weight": 1.0 if c["id"] == "C1" else c["weight"]}
        for c in edited["criteria"]
    ]
    # Make a valid 4.0 by moving points: C1 1.0, C2 2.25, C3 0.5, C4 0.25
    for c in edited["criteria"]:
        if c["id"] == "C1":
            c["weight"] = 1.0
        if c["id"] == "C2":
            c["weight"] = 2.25
    patch = await client.patch(
        f"/api/teacher/assignments/{first.json()['id']}",
        headers=HEADERS,
        json={"assignmentRubric": edited},
    )
    assert patch.status_code == 200
    assert patch.json()["assignmentRubric"]["criteria"][0]["weight"] == 1.0

    catalog_after = await client.get(
        f"/api/teacher/rubrics/{catalog['rubric']['id']}", headers=HEADERS
    )
    assert catalog_after.json()["criteria"][0]["weight"] == 2.5

    other = await client.get(f"/api/teacher/assignments/{second.json()['id']}", headers=HEADERS)
    assert other.json()["assignmentRubric"]["criteria"][0]["weight"] == 2.5


@pytest.mark.asyncio
async def test_draft_hidden_published_visible_only_to_recipients(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
    settings: Settings,
) -> None:
    outsider = await create_user(
        db_session, settings, client, role=UserRole.STUDENT, prefix="out"
    )
    classroom = await seed_classroom_with_student(db_session, teacher_user, student_user)
    await login_as(client, settings, db_session, teacher_user)
    catalog = await _create_ready_prompt(client, title="Khói nhà máy — đề mới")
    created = await client.post(
        "/api/teacher/assignments",
        headers=HEADERS,
        json={
            "sourcePromptId": catalog["prompt"]["id"],
            "rubricId": catalog["rubric"]["id"],
            "classroomId": str(classroom.id),
            "assignToWholeClass": True,
            "title": "Khói nhà máy — bài giao",
            "dueAt": "2026-11-01T16:00:00+00:00",
        },
    )
    assert created.status_code == 201
    assignment_id = created.json()["id"]

    await login_as(client, settings, db_session, student_user)
    draft_list = await client.get("/api/assignments", headers=HEADERS)
    assert draft_list.status_code == 200
    assert draft_list.json()["items"] == []

    await login_as(client, settings, db_session, teacher_user)
    published = await client.post(
        f"/api/teacher/assignments/{assignment_id}/publish", headers=HEADERS, json={}
    )
    assert published.status_code == 200
    assert published.json()["status"] == "PUBLISHED"
    code = published.json()["code"]

    await login_as(client, settings, db_session, student_user)
    visible = await client.get("/api/assignments", headers=HEADERS)
    assert any(item["code"] == code for item in visible.json()["items"])
    detail = await client.get(f"/api/assignments/{assignment_id}", headers=HEADERS)
    assert detail.status_code == 200
    assert "khói nhà máy" in detail.json()["writingTask"].lower()
    assert "rơm rạ" not in (detail.json()["materials"][0]["content"]).lower()

    await login_as(client, settings, db_session, outsider)
    hidden = await client.get("/api/assignments", headers=HEADERS)
    assert hidden.json()["items"] == []
    denied = await client.get(f"/api/assignments/{assignment_id}", headers=HEADERS)
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_student_cannot_mutate_catalog(
    client: AsyncClient,
    student_user: User,
    db_session: AsyncSession,
    settings: Settings,
) -> None:
    await login_as(client, settings, db_session, student_user)
    resp = await client.post(
        "/api/teacher/materials",
        headers=HEADERS,
        json={"title": "Không được", "content": "abc"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "TEACHER_REQUIRED"


@pytest.mark.asyncio
async def test_catalog_edit_after_publish_does_not_change_snapshot(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
    settings: Settings,
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
            "title": "Bài đã giao",
        },
    )
    published = await client.post(
        f"/api/teacher/assignments/{created.json()['id']}/publish",
        headers=HEADERS,
        json={},
    )
    assert published.status_code == 200
    revision_id = published.json()["publishedRevisionId"]

    await client.patch(
        f"/api/teacher/materials/{catalog['material']['id']}",
        headers=HEADERS,
        json={"content": "Nội dung ngữ liệu đã sửa sau khi giao bài, không được ghi đè snapshot."},
    )
    await client.patch(
        f"/api/teacher/prompts/{catalog['prompt']['id']}",
        headers=HEADERS,
        json={"writingTask": "Yêu cầu viết đã đổi sau phát hành."},
    )

    factory = get_session_factory()
    async with factory() as fresh:
        row = await fresh.get(AssignmentRevision, uuid.UUID(revision_id))
        assert row is not None
        assert "Nội dung ngữ liệu đã sửa sau khi giao bài" not in (row.context_chunks[0]["text"])
        assert "Yêu cầu viết đã đổi sau phát hành" not in (row.instructions.get("writing_task") or "")
        assert "khói nhà máy" in row.context_chunks[0]["text"].lower()

    await login_as(client, settings, db_session, student_user)
    detail = await client.get(f"/api/assignments/{created.json()['id']}", headers=HEADERS)
    assert "Nội dung ngữ liệu đã sửa sau khi giao bài" not in detail.json()["materials"][0]["content"]


@pytest.mark.asyncio
async def test_publish_retry_does_not_duplicate(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
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
            "title": "Retry giao bài",
        },
    )
    assignment_id = created.json()["id"]
    first = await client.post(
        f"/api/teacher/assignments/{assignment_id}/publish", headers=HEADERS, json={}
    )
    second = await client.post(
        f"/api/teacher/assignments/{assignment_id}/publish", headers=HEADERS, json={}
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["publishedRevisionId"] == second.json()["publishedRevisionId"]

    expected_student_id = student_user.id
    factory = get_session_factory()
    async with factory() as fresh:
        revisions = (
            await fresh.execute(
                select(AssignmentRevision).where(AssignmentRevision.assignment_id == uuid.UUID(assignment_id))
            )
        ).scalars().all()
        assert len(revisions) == 1
        grants = (
            await fresh.execute(
                select(AssignmentAccess).where(
                    AssignmentAccess.assignment_revision_id == revisions[0].id
                )
            )
        ).scalars().all()
        assert len(grants) == 1
        assert grants[0].student_id == expected_student_id


@pytest.mark.asyncio
async def test_new_prompt_reaches_socratic_context(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
    settings: Settings,
) -> None:
    classroom = await seed_classroom_with_student(db_session, teacher_user, student_user)
    catalog = await _create_ready_prompt(client, title="Khói nhà máy — đề khác mẫu")
    created = await client.post(
        "/api/teacher/assignments",
        headers=HEADERS,
        json={
            "sourcePromptId": catalog["prompt"]["id"],
            "rubricId": catalog["rubric"]["id"],
            "classroomId": str(classroom.id),
            "assignToWholeClass": True,
            "title": "Khói nhà máy — đề khác mẫu",
        },
    )
    published = await client.post(
        f"/api/teacher/assignments/{created.json()['id']}/publish",
        headers=HEADERS,
        json={},
    )
    code = published.json()["code"]

    await login_as(client, settings, db_session, student_user)
    session_resp = await client.post(
        "/api/socratic-sessions",
        headers=HEADERS,
        json={"assignmentCode": code},
    )
    assert session_resp.status_code == 201
    session_id = session_resp.json()["id"]
    outline = await client.post(
        f"/api/socratic-sessions/{session_id}/outline-init",
        headers=HEADERS,
        json={},
    )
    assert outline.status_code in {200, 201}
    detail = await client.get(f"/api/assignments/{code}", headers=HEADERS)
    content = detail.json()["materials"][0]["content"].lower()
    assert "khói nhà máy" in content
    assert "rơm rạ" not in content
    assert detail.json()["rubric"]["maxScore"] == 4


@pytest.mark.asyncio
async def test_get_prompt_in_fresh_session_loads_relationships(
    client: AsyncClient,
    teacher_user: User,
    db_session: AsyncSession,
) -> None:
    catalog = await _create_ready_prompt(client, title="Đọc kho session mới")
    prompt_id = uuid.UUID(catalog["prompt"]["id"])

    factory = get_session_factory()
    async with factory() as fresh:
        service = CatalogService(fresh)
        payload = await service.get_prompt(teacher_user, prompt_id)
        listed = await service.list_prompts(teacher_user)
        updated = await service.update_prompt(
            teacher_user,
            prompt_id,
            {"title": "Đọc kho session mới — đã sửa"},
        )
        await fresh.commit()

    assert payload["id"] == str(prompt_id)
    assert payload["materials"]
    assert payload["materials"][0]["chunks"]
    assert any(item["id"] == str(prompt_id) for item in listed)
    assert updated["title"] == "Đọc kho session mới — đã sửa"
    assert updated["materials"][0]["chunks"]


@pytest.mark.asyncio
async def test_empty_selection_does_not_publish_whole_class(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
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
            "recipientStudentIds": [],
            "title": "Không chọn ai",
        },
    )
    assert created.status_code == 201
    published = await client.post(
        f"/api/teacher/assignments/{created.json()['id']}/publish",
        headers=HEADERS,
        json={},
    )
    assert published.status_code == 400
    assert published.json()["error"]["code"] == "NEED_RECIPIENTS"


@pytest.mark.asyncio
async def test_student_outside_class_is_rejected(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
    settings: Settings,
) -> None:
    outsider = await create_user(db_session, settings, client, role=UserRole.STUDENT, prefix="ngoai")
    classroom = await seed_classroom_with_student(db_session, teacher_user, student_user)
    await login_as(client, settings, db_session, teacher_user)
    catalog = await _create_ready_prompt(client)
    created = await client.post(
        "/api/teacher/assignments",
        headers=HEADERS,
        json={
            "sourcePromptId": catalog["prompt"]["id"],
            "rubricId": catalog["rubric"]["id"],
            "classroomId": str(classroom.id),
            "recipientStudentIds": [str(outsider.id)],
            "title": "Học sinh ngoài lớp",
        },
    )
    assert created.status_code == 201
    published = await client.post(
        f"/api/teacher/assignments/{created.json()['id']}/publish",
        headers=HEADERS,
        json={},
    )
    assert published.status_code == 400
    assert published.json()["error"]["code"] == "NEED_RECIPIENTS"


@pytest.mark.asyncio
async def test_whole_class_publishes_only_valid_members(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
    settings: Settings,
) -> None:
    outsider = await create_user(db_session, settings, client, role=UserRole.STUDENT, prefix="ngoai2")
    classroom = await seed_classroom_with_student(db_session, teacher_user, student_user)
    await login_as(client, settings, db_session, teacher_user)
    catalog = await _create_ready_prompt(client)
    created = await client.post(
        "/api/teacher/assignments",
        headers=HEADERS,
        json={
            "sourcePromptId": catalog["prompt"]["id"],
            "rubricId": catalog["rubric"]["id"],
            "classroomId": str(classroom.id),
            "assignToWholeClass": True,
            "title": "Giao toàn lớp",
        },
    )
    published = await client.post(
        f"/api/teacher/assignments/{created.json()['id']}/publish",
        headers=HEADERS,
        json={},
    )
    assert published.status_code == 200
    await db_session.commit()
    grants = (
        await db_session.execute(
            select(AssignmentAccess).where(
                AssignmentAccess.assignment_revision_id
                == uuid.UUID(published.json()["publishedRevisionId"])
            )
        )
    ).scalars().all()
    assert [row.student_id for row in grants] == [student_user.id]
    assert outsider.id not in {row.student_id for row in grants}


@pytest.mark.asyncio
async def test_two_materials_keep_distinct_chunk_ids_in_socratic(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
    settings: Settings,
) -> None:
    classroom = await seed_classroom_with_student(db_session, teacher_user, student_user)
    first = await client.post(
        "/api/teacher/materials",
        headers=HEADERS,
        json={
            "title": "Khói nhà máy",
            "content": "Đoạn một nói về khói nhà máy buổi sáng.\n\nĐoạn hai vẫn là khói nhà máy.",
            "gradeLevel": 11,
        },
    )
    second = await client.post(
        "/api/teacher/materials",
        headers=HEADERS,
        json={
            "title": "Sông Hương",
            "content": "Đoạn một nói về sông Hương êm đềm.\n\nĐoạn hai tả sương sớm trên mặt sông.",
            "gradeLevel": 11,
        },
    )
    assert first.status_code == 201
    assert second.status_code == 201
    prompt = await client.post(
        "/api/teacher/prompts",
        headers=HEADERS,
        json={
            "title": "Hai ngữ liệu",
            "writingTask": "So sánh hai ngữ liệu.",
            "genre": "NLXH",
            "gradeLevel": 11,
            "materialIds": [first.json()["id"], second.json()["id"]],
        },
    )
    assert prompt.status_code == 201
    rubric = await client.post("/api/teacher/rubrics", headers=HEADERS, json=VALID_RUBRIC)
    created = await client.post(
        "/api/teacher/assignments",
        headers=HEADERS,
        json={
            "sourcePromptId": prompt.json()["id"],
            "rubricId": rubric.json()["id"],
            "classroomId": str(classroom.id),
            "assignToWholeClass": True,
            "title": "Hai ngữ liệu",
        },
    )
    published = await client.post(
        f"/api/teacher/assignments/{created.json()['id']}/publish",
        headers=HEADERS,
        json={},
    )
    assert published.status_code == 200
    await login_as(client, settings, db_session, student_user)
    detail = await client.get(f"/api/assignments/{created.json()['id']}", headers=HEADERS)
    assert detail.status_code == 200
    materials = detail.json()["materials"]
    chunks = detail.json()["contextChunks"]
    texts = " ".join(item.get("content") or "" for item in materials).lower()
    chunk_texts = " ".join(item.get("text") or "" for item in chunks).lower()
    chunk_ids = [item.get("chunk_id") or item.get("chunkId") for item in chunks]
    assert len(materials) == 2
    assert "khói nhà máy" in texts
    assert "sông hương" in texts
    assert "khói nhà máy" in chunk_texts
    assert "sông hương" in chunk_texts
    assert len(chunk_ids) == len(set(chunk_ids))
    assert len(chunks) >= 4
    material_chunk_ids = [
        chunk.get("chunkId") or chunk.get("chunk_id")
        for item in materials
        for chunk in item.get("chunks") or []
    ]
    assert set(material_chunk_ids) == set(chunk_ids)


@pytest.mark.asyncio
async def test_prompt_keeps_topic_and_grade_on_update(
    client: AsyncClient,
    teacher_user: User,
) -> None:
    topic = await client.post(
        "/api/teacher/topics",
        headers=HEADERS,
        json={"title": "Đô thị", "gradeLevel": 10, "genre": "NLXH"},
    )
    assert topic.status_code == 201
    material = await client.post(
        "/api/teacher/materials",
        headers=HEADERS,
        json={
            "title": "Ngữ liệu khối 10",
            "content": FACTORY_TEXT,
            "gradeLevel": 10,
            "topicId": topic.json()["id"],
        },
    )
    prompt = await client.post(
        "/api/teacher/prompts",
        headers=HEADERS,
        json={
            "title": "Đề khối 10",
            "writingTask": "Viết về đô thị.",
            "genre": "NLXH",
            "gradeLevel": 10,
            "topicId": topic.json()["id"],
            "materialIds": [material.json()["id"]],
        },
    )
    assert prompt.status_code == 201
    assert prompt.json()["gradeLevel"] == 10
    assert prompt.json()["topicId"] == topic.json()["id"]

    listed = await client.get(
        "/api/teacher/prompts",
        headers=HEADERS,
        params={"topicId": topic.json()["id"], "gradeLevel": 10},
    )
    assert any(item["id"] == prompt.json()["id"] for item in listed.json()["items"])

    updated = await client.patch(
        f"/api/teacher/prompts/{prompt.json()['id']}",
        headers=HEADERS,
        json={"title": "Đề khối 10 — đã sửa", "topicId": topic.json()["id"], "gradeLevel": 10},
    )
    assert updated.status_code == 200
    assert updated.json()["gradeLevel"] == 10
    assert updated.json()["topicId"] == topic.json()["id"]
