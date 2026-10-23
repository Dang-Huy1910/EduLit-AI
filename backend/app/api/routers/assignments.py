"""Teacher assignment workflow and student assignment list."""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, status
from fastapi.responses import Response

from app.core.errors import ApiHttpException
from app.db.models import User, UserRole
from app.identity.deps import get_session_context, require_mutation_guards
from app.identity.service import SessionContext
from app.services.assignment_service import AssignmentService
from app.services.catalog_errors import CatalogError

teacher_router = APIRouter(
    prefix="/teacher/assignments",
    tags=["teacher-assignments"],
    dependencies=[Depends(require_mutation_guards)],
)

student_router = APIRouter(
    prefix="/assignments",
    tags=["assignments"],
    dependencies=[Depends(require_mutation_guards)],
)


def _raise(exc: CatalogError) -> None:
    raise ApiHttpException(exc.status_code, exc.code, exc.message, fields=exc.fields)


async def get_current_user(ctx: Annotated[SessionContext, Depends(get_session_context)]) -> User:
    return ctx.user


async def get_teacher(ctx: Annotated[SessionContext, Depends(get_session_context)]) -> User:
    if ctx.user.role != UserRole.TEACHER:
        raise ApiHttpException(
            status.HTTP_403_FORBIDDEN,
            "TEACHER_REQUIRED",
            "Chỉ giáo viên mới thực hiện được thao tác này.",
        )
    return ctx.user


async def get_student(ctx: Annotated[SessionContext, Depends(get_session_context)]) -> User:
    if ctx.user.role != UserRole.STUDENT:
        raise ApiHttpException(
            status.HTTP_403_FORBIDDEN,
            "STUDENT_REQUIRED",
            "Chỉ học sinh mới xem được danh sách bài được giao.",
        )
    return ctx.user


async def get_assignment_service(
    ctx: Annotated[SessionContext, Depends(get_session_context)],
) -> AssignmentService:
    return AssignmentService(ctx.db)


@teacher_router.get("")
async def list_teacher_assignments(
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[AssignmentService, Depends(get_assignment_service)],
) -> dict[str, Any]:
    return {"items": await service.list_teacher_assignments(teacher)}


@teacher_router.post("", status_code=status.HTTP_201_CREATED)
async def create_teacher_assignment(
    body: dict[str, Any],
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[AssignmentService, Depends(get_assignment_service)],
) -> dict[str, Any]:
    try:
        return await service.create_draft(teacher, body)
    except CatalogError as exc:
        _raise(exc)


@teacher_router.get("/{assignment_id}")
async def get_teacher_assignment(
    assignment_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[AssignmentService, Depends(get_assignment_service)],
) -> dict[str, Any]:
    try:
        return await service.get_teacher_assignment(teacher, assignment_id)
    except CatalogError as exc:
        _raise(exc)


@teacher_router.patch("/{assignment_id}")
async def update_teacher_assignment(
    assignment_id: uuid.UUID,
    body: dict[str, Any],
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[AssignmentService, Depends(get_assignment_service)],
) -> dict[str, Any]:
    try:
        return await service.update_draft(teacher, assignment_id, body)
    except CatalogError as exc:
        _raise(exc)


@teacher_router.patch("/{assignment_id}/due-at")
async def update_teacher_assignment_due_at(
    assignment_id: uuid.UUID,
    body: dict[str, Any],
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[AssignmentService, Depends(get_assignment_service)],
) -> dict[str, Any]:
    try:
        return await service.update_due_at(teacher, assignment_id, body)
    except CatalogError as exc:
        _raise(exc)


@teacher_router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_teacher_assignment(
    assignment_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[AssignmentService, Depends(get_assignment_service)],
) -> Response:
    try:
        await service.delete_assignment(teacher, assignment_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except CatalogError as exc:
        _raise(exc)


@teacher_router.post("/{assignment_id}/publish")
async def publish_teacher_assignment(
    assignment_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[AssignmentService, Depends(get_assignment_service)],
) -> dict[str, Any]:
    try:
        return await service.publish(teacher, assignment_id)
    except CatalogError as exc:
        _raise(exc)


@teacher_router.post("/{assignment_id}/outline-prep/retry")
async def retry_failed_outline_preps(
    assignment_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[AssignmentService, Depends(get_assignment_service)],
) -> dict[str, Any]:
    try:
        return await service.retry_failed_outline_preps(teacher, assignment_id)
    except CatalogError as exc:
        _raise(exc)


@teacher_router.post("/{assignment_id}/save-as-rubric", status_code=status.HTTP_201_CREATED)
async def save_as_rubric(
    assignment_id: uuid.UUID,
    body: dict[str, Any],
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[AssignmentService, Depends(get_assignment_service)],
) -> dict[str, Any]:
    try:
        return await service.save_assignment_rubric_as_catalog(teacher, assignment_id, body)
    except CatalogError as exc:
        _raise(exc)


@student_router.get("")
async def list_assignments(
    user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AssignmentService, Depends(get_assignment_service)],
) -> dict[str, Any]:
    try:
        if user.role == UserRole.TEACHER:
            return {"items": await service.list_teacher_assignments(user)}
        return {"items": await service.list_student_assignments(user)}
    except CatalogError as exc:
        _raise(exc)


@student_router.get("/{assignment_key}")
async def get_assignment(
    assignment_key: str,
    user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AssignmentService, Depends(get_assignment_service)],
) -> dict[str, Any]:
    try:
        return await service.get_public_teacher_or_student(user, assignment_key)
    except CatalogError as exc:
        _raise(exc)
