"""Academic terms and classroom enrollment HTTP API."""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, status
from fastapi.responses import Response

from app.api.routers.catalog import _raise, get_student, get_teacher
from app.db.models import User
from app.identity.deps import get_session_context, require_mutation_guards
from app.identity.service import SessionContext
from app.services.catalog_errors import CatalogError
from app.services.classroom_service import ClassroomService

terms_router = APIRouter(prefix="/terms", tags=["terms"])
teacher_router = APIRouter(
    prefix="/teacher/classrooms",
    tags=["teacher-classrooms"],
    dependencies=[Depends(require_mutation_guards)],
)
student_router = APIRouter(
    prefix="/student/classrooms",
    tags=["student-classrooms"],
    dependencies=[Depends(require_mutation_guards)],
)


async def get_classroom_service(
    ctx: Annotated[SessionContext, Depends(get_session_context)],
) -> ClassroomService:
    return ClassroomService(ctx.db)


@terms_router.get("")
async def list_terms(
    _ctx: Annotated[SessionContext, Depends(get_session_context)],
    service: Annotated[ClassroomService, Depends(get_classroom_service)],
) -> dict[str, Any]:
    return {"items": await service.list_terms()}


@teacher_router.get("")
async def list_teacher_classrooms(
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[ClassroomService, Depends(get_classroom_service)],
    termId: uuid.UUID | None = None,
    includeArchived: bool = False,
) -> dict[str, Any]:
    try:
        return {
            "items": await service.list_teacher_classrooms(
                teacher,
                term_id=termId,
                include_archived=includeArchived,
            )
        }
    except CatalogError as exc:
        _raise(exc)


@teacher_router.post("", status_code=status.HTTP_201_CREATED)
async def create_classroom(
    body: dict[str, Any],
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[ClassroomService, Depends(get_classroom_service)],
) -> dict[str, Any]:
    try:
        return await service.create_classroom(teacher, body)
    except CatalogError as exc:
        _raise(exc)


@teacher_router.get("/{classroom_id}")
async def get_teacher_classroom(
    classroom_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[ClassroomService, Depends(get_classroom_service)],
) -> dict[str, Any]:
    try:
        return await service.get_teacher_classroom(teacher, classroom_id)
    except CatalogError as exc:
        _raise(exc)


@teacher_router.patch("/{classroom_id}")
async def update_classroom(
    classroom_id: uuid.UUID,
    body: dict[str, Any],
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[ClassroomService, Depends(get_classroom_service)],
) -> dict[str, Any]:
    try:
        return await service.update_classroom(teacher, classroom_id, body)
    except CatalogError as exc:
        _raise(exc)


@teacher_router.post("/{classroom_id}/join-code/rotate")
async def rotate_join_code(
    classroom_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[ClassroomService, Depends(get_classroom_service)],
) -> dict[str, Any]:
    try:
        return await service.rotate_join_code(teacher, classroom_id)
    except CatalogError as exc:
        _raise(exc)


@teacher_router.delete("/{classroom_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    classroom_id: uuid.UUID,
    user_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[ClassroomService, Depends(get_classroom_service)],
) -> Response:
    try:
        await service.remove_member(teacher, classroom_id, user_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except CatalogError as exc:
        _raise(exc)


@student_router.get("")
async def list_student_classrooms(
    student: Annotated[User, Depends(get_student)],
    service: Annotated[ClassroomService, Depends(get_classroom_service)],
    termId: uuid.UUID | None = None,
) -> dict[str, Any]:
    try:
        return {"items": await service.list_student_classrooms(student, term_id=termId)}
    except CatalogError as exc:
        _raise(exc)


@student_router.post("/join")
async def join_classroom(
    body: dict[str, Any],
    student: Annotated[User, Depends(get_student)],
    service: Annotated[ClassroomService, Depends(get_classroom_service)],
) -> dict[str, Any]:
    try:
        return await service.join_by_code(student, body.get("code"))
    except CatalogError as exc:
        _raise(exc)
