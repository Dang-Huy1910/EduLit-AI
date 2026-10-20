from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.db.models import ClassMembership, User, UserRole
from app.services.catalog_service import CatalogService
from tests.catalog.conftest import (
    FACTORY_TEXT,
    HEADERS,
    create_user,
    login_as,
    seed_classroom_with_student,
)


async def _material(db: AsyncSession, teacher: User, title: str, content: str = FACTORY_TEXT) -> str:
    created = await CatalogService(db).create_material(
        teacher,
        {"title": title, "author": "Trần Quang Quý", "content": content, "gradeLevel": 12},
    )
    return created["id"]


@pytest.mark.asyncio
async def test_student_reads_ready_materials_of_own_teacher_only(
    client: AsyncClient,
    db_session: AsyncSession,
    settings: Settings,
    teacher_user: User,
    student_user: User,
) -> None:
    await seed_classroom_with_student(db_session, teacher_user, student_user, code="12A14")
    ready_id = await _material(db_session, teacher_user, "Màu tự do của đất")
    await _material(db_session, teacher_user, "Bản nháp chưa có nội dung", content="")
    other_teacher = await create_user(db_session, settings, client, role=UserRole.TEACHER, prefix="gv2")
    foreign_id = await _material(db_session, other_teacher, "Ngữ liệu của lớp khác")

    await login_as(client, settings, db_session, student_user)
    listed = await client.get("/api/student/materials")
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert [item["id"] for item in items] == [ready_id]
    assert items[0]["title"] == "Màu tự do của đất"
    assert "content" not in items[0]
    assert "sourceDocumentId" not in items[0]

    detail = await client.get(f"/api/student/materials/{ready_id}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["content"] == FACTORY_TEXT
    assert body["author"] == "Trần Quang Quý"
    assert "sourceDocumentId" not in body and "missing" not in body

    assert (await client.get(f"/api/student/materials/{foreign_id}")).status_code == 404


@pytest.mark.asyncio
async def test_student_outside_or_removed_from_class_sees_nothing(
    client: AsyncClient,
    db_session: AsyncSession,
    settings: Settings,
    teacher_user: User,
    student_user: User,
) -> None:
    classroom = await seed_classroom_with_student(db_session, teacher_user, student_user, code="12A14")
    material_id = await _material(db_session, teacher_user, "Màu tự do của đất")
    outsider = await create_user(db_session, settings, client, role=UserRole.STUDENT, prefix="hs2")

    await login_as(client, settings, db_session, outsider)
    assert (await client.get("/api/student/materials")).json()["items"] == []
    assert (await client.get(f"/api/student/materials/{material_id}")).status_code == 404

    await db_session.execute(
        update(ClassMembership)
        .where(ClassMembership.classroom_id == classroom.id, ClassMembership.user_id == student_user.id)
        .values(status="REMOVED")
    )
    await db_session.commit()
    await login_as(client, settings, db_session, student_user)
    assert (await client.get("/api/student/materials")).json()["items"] == []
    assert (await client.get(f"/api/student/materials/{material_id}")).status_code == 404


@pytest.mark.asyncio
async def test_student_materials_are_read_only_and_student_only(
    client: AsyncClient,
    db_session: AsyncSession,
    settings: Settings,
    teacher_user: User,
    student_user: User,
) -> None:
    await seed_classroom_with_student(db_session, teacher_user, student_user, code="12A14")
    material_id = await _material(db_session, teacher_user, "Màu tự do của đất")

    # teacher_user fixture is signed in: the student endpoint is not for teachers.
    denied = await client.get("/api/student/materials")
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "STUDENT_REQUIRED"

    await login_as(client, settings, db_session, student_user)
    assert (await client.post("/api/student/materials", json={"title": "x"}, headers=HEADERS)).status_code == 405
    assert (
        await client.patch(f"/api/student/materials/{material_id}", json={"title": "x"}, headers=HEADERS)
    ).status_code == 405
    assert (await client.delete(f"/api/student/materials/{material_id}", headers=HEADERS)).status_code == 405
    # The teacher catalog stays closed to students.
    assert (await client.get("/api/teacher/materials")).status_code == 403
    assert (await client.get(f"/api/teacher/materials/{material_id}")).status_code == 403

    client.cookies.clear()
    assert (await client.get("/api/student/materials")).status_code == 401
