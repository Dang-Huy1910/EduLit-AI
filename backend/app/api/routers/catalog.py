"""Teacher catalog HTTP API: chuyên đề, ngữ liệu, đề nguồn, barem, lớp."""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from app.core.errors import ApiHttpException
from app.db.models import User
from app.identity.deps import get_session_context, require_mutation_guards
from app.identity.service import SessionContext
from app.services.catalog_errors import CatalogError
from app.services.catalog_service import CatalogService

router = APIRouter(
    prefix="/teacher",
    tags=["teacher-catalog"],
    dependencies=[Depends(require_mutation_guards)],
)


def _raise(exc: CatalogError) -> None:
    raise ApiHttpException(exc.status_code, exc.code, exc.message, fields=exc.fields)


async def get_teacher(ctx: Annotated[SessionContext, Depends(get_session_context)]) -> User:
    if ctx.user.role.value != "TEACHER":
        raise ApiHttpException(status.HTTP_403_FORBIDDEN, "TEACHER_REQUIRED", "Chỉ giáo viên mới thực hiện được thao tác này.")
    return ctx.user


async def get_catalog_service(
    ctx: Annotated[SessionContext, Depends(get_session_context)],
) -> CatalogService:
    return CatalogService(ctx.db)


@router.get("/topics")
async def list_topics(
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[CatalogService, Depends(get_catalog_service)],
) -> dict[str, Any]:
    return {"items": await service.list_topics(teacher)}


@router.post("/topics", status_code=status.HTTP_201_CREATED)
async def create_topic(
    body: dict[str, Any],
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[CatalogService, Depends(get_catalog_service)],
) -> dict[str, Any]:
    try:
        return await service.create_topic(teacher, body)
    except CatalogError as exc:
        _raise(exc)


@router.get("/classrooms")
async def list_classrooms(
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[CatalogService, Depends(get_catalog_service)],
) -> dict[str, Any]:
    return {"items": await service.list_classrooms(teacher)}


@router.get("/classrooms/{classroom_id}")
async def get_classroom(
    classroom_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[CatalogService, Depends(get_catalog_service)],
) -> dict[str, Any]:
    try:
        return await service.list_classroom_members(teacher, classroom_id)
    except CatalogError as exc:
        _raise(exc)


@router.get("/materials")
async def list_materials(
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[CatalogService, Depends(get_catalog_service)],
    q: str | None = None,
    topicId: uuid.UUID | None = None,
    gradeLevel: int | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    items = await service.list_materials(
        teacher, query=q, topic_id=topicId, grade_level=gradeLevel, status=status
    )
    return {"items": items}


@router.post("/materials", status_code=status.HTTP_201_CREATED)
async def create_material(
    body: dict[str, Any],
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[CatalogService, Depends(get_catalog_service)],
) -> dict[str, Any]:
    try:
        return await service.create_material(teacher, body)
    except CatalogError as exc:
        _raise(exc)


@router.get("/materials/{material_id}")
async def get_material(
    material_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[CatalogService, Depends(get_catalog_service)],
) -> dict[str, Any]:
    try:
        return await service.get_material(teacher, material_id)
    except CatalogError as exc:
        _raise(exc)


@router.patch("/materials/{material_id}")
async def update_material(
    material_id: uuid.UUID,
    body: dict[str, Any],
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[CatalogService, Depends(get_catalog_service)],
) -> dict[str, Any]:
    try:
        return await service.update_material(teacher, material_id, body)
    except CatalogError as exc:
        _raise(exc)


@router.get("/prompts")
async def list_prompts(
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[CatalogService, Depends(get_catalog_service)],
    q: str | None = None,
    topicId: uuid.UUID | None = None,
    gradeLevel: int | None = None,
    genre: str | None = None,
    status: str | None = None,
    readyOnly: bool = Query(default=False),
) -> dict[str, Any]:
    items = await service.list_prompts(
        teacher,
        query=q,
        topic_id=topicId,
        grade_level=gradeLevel,
        genre=genre,
        status=status,
        ready_only=readyOnly,
    )
    return {"items": items}


@router.post("/prompts", status_code=status.HTTP_201_CREATED)
async def create_prompt(
    body: dict[str, Any],
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[CatalogService, Depends(get_catalog_service)],
) -> dict[str, Any]:
    try:
        return await service.create_prompt(teacher, body)
    except CatalogError as exc:
        _raise(exc)


@router.get("/prompts/{prompt_id}")
async def get_prompt(
    prompt_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[CatalogService, Depends(get_catalog_service)],
) -> dict[str, Any]:
    try:
        return await service.get_prompt(teacher, prompt_id)
    except CatalogError as exc:
        _raise(exc)


@router.patch("/prompts/{prompt_id}")
async def update_prompt(
    prompt_id: uuid.UUID,
    body: dict[str, Any],
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[CatalogService, Depends(get_catalog_service)],
) -> dict[str, Any]:
    try:
        return await service.update_prompt(teacher, prompt_id, body)
    except CatalogError as exc:
        _raise(exc)


@router.get("/rubrics")
async def list_rubrics(
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[CatalogService, Depends(get_catalog_service)],
) -> dict[str, Any]:
    return {"items": await service.list_rubrics(teacher)}


@router.post("/rubrics", status_code=status.HTTP_201_CREATED)
async def create_rubric(
    body: dict[str, Any],
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[CatalogService, Depends(get_catalog_service)],
) -> dict[str, Any]:
    try:
        return await service.create_rubric(teacher, body)
    except CatalogError as exc:
        _raise(exc)


@router.get("/rubrics/{rubric_id}")
async def get_rubric(
    rubric_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[CatalogService, Depends(get_catalog_service)],
) -> dict[str, Any]:
    try:
        return await service.get_rubric(teacher, rubric_id)
    except CatalogError as exc:
        _raise(exc)


@router.patch("/rubrics/{rubric_id}")
async def update_rubric(
    rubric_id: uuid.UUID,
    body: dict[str, Any],
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[CatalogService, Depends(get_catalog_service)],
) -> dict[str, Any]:
    try:
        return await service.update_rubric(teacher, rubric_id, body)
    except CatalogError as exc:
        _raise(exc)
