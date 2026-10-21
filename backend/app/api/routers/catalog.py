"""Teacher catalog HTTP API: chuyên đề, ngữ liệu, đề nguồn, barem, lớp, import."""

from __future__ import annotations

import uuid
from typing import Annotated, Any
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, File, Form, Query, UploadFile, status
from fastapi.responses import Response

from app.core.errors import ERROR_MESSAGES, ApiHttpException
from app.db.models import User
from app.identity.deps import get_session_context, require_mutation_guards
from app.identity.service import SessionContext
from app.services.catalog_errors import CatalogError
from app.services.catalog_service import CatalogService
from app.services.document_import import DocumentImportService

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


async def get_import_service(
    ctx: Annotated[SessionContext, Depends(get_session_context)],
) -> DocumentImportService:
    return DocumentImportService(ctx.db)


def _content_disposition(filename: str) -> str:
    ascii_name = filename.encode("ascii", "ignore").decode("ascii").replace('"', "").strip() or "tai-lieu"
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"


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


@router.delete("/prompts/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_prompt(
    prompt_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[CatalogService, Depends(get_catalog_service)],
) -> Response:
    try:
        await service.delete_prompt(teacher, prompt_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)
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


@router.get("/documents")
async def list_documents(
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[DocumentImportService, Depends(get_import_service)],
) -> dict[str, Any]:
    return {"items": await service.list_documents(teacher)}


@router.post("/documents", status_code=status.HTTP_201_CREATED)
async def upload_document(
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[DocumentImportService, Depends(get_import_service)],
    file: Annotated[UploadFile, File()],
    intent: Annotated[str, Form()] = "MIXED",
    topicId: Annotated[str | None, Form()] = None,
    gradeLevel: Annotated[int | None, Form()] = 11,
    genre: Annotated[str | None, Form()] = "NLVH",
) -> dict[str, Any]:
    data = await file.read()
    try:
        return await service.upload(
            teacher,
            filename=file.filename or "tai-lieu",
            data=data,
            intent=intent,
            topic_id=topicId,
            grade_level=gradeLevel if gradeLevel is not None else 11,
            genre=genre or "NLVH",
        )
    except CatalogError as exc:
        _raise(exc)


@router.get("/documents/{document_id}")
async def get_document(
    document_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[DocumentImportService, Depends(get_import_service)],
) -> dict[str, Any]:
    try:
        return await service.get_document(teacher, document_id)
    except CatalogError as exc:
        _raise(exc)


@router.get("/documents/{document_id}/original")
async def download_original(
    document_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[DocumentImportService, Depends(get_import_service)],
) -> Response:
    try:
        data, filename, mime_type = await service.original_bytes(teacher, document_id)
    except CatalogError as exc:
        _raise(exc)
        raise
    return Response(
        content=data,
        media_type=mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": _content_disposition(filename),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.post("/documents/{document_id}/analyze")
async def analyze_document(
    document_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[DocumentImportService, Depends(get_import_service)],
    body: Annotated[dict[str, Any] | None, Body()] = None,
) -> dict[str, Any]:
    payload = body or {}
    try:
        return await service.analyze(
            teacher,
            document_id,
            expected_markdown_sha256=payload.get("expectedMarkdownSha256"),
            markdown=payload.get("markdown"),
        )
    except CatalogError as exc:
        _raise(exc)


@router.post("/documents/{document_id}/draft")
async def save_document_draft(
    document_id: uuid.UUID,
    body: dict[str, Any],
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[DocumentImportService, Depends(get_import_service)],
) -> dict[str, Any]:
    try:
        return await service.save_draft(teacher, document_id, body)
    except CatalogError as exc:
        _raise(exc)


@router.post("/documents/{document_id}/confirm")
async def confirm_document(
    document_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[DocumentImportService, Depends(get_import_service)],
    body: Annotated[dict[str, Any] | None, Body()] = None,
) -> dict[str, Any]:
    try:
        return await service.confirm(teacher, document_id, body)
    except CatalogError as exc:
        _raise(exc)


# ── Student read-only materials ──────────────────────────────────────────────

student_router = APIRouter(
    prefix="/student",
    tags=["student-catalog"],
    dependencies=[Depends(require_mutation_guards)],
)


async def get_student(ctx: Annotated[SessionContext, Depends(get_session_context)]) -> User:
    if ctx.user.role.value != "STUDENT":
        raise ApiHttpException(status.HTTP_403_FORBIDDEN, "STUDENT_REQUIRED", ERROR_MESSAGES["STUDENT_REQUIRED"])
    return ctx.user


@student_router.get("/materials")
async def list_student_materials(
    student: Annotated[User, Depends(get_student)],
    service: Annotated[CatalogService, Depends(get_catalog_service)],
    q: str | None = None,
    gradeLevel: int | None = None,
) -> dict[str, Any]:
    try:
        return {"items": await service.list_student_materials(student, query=q, grade_level=gradeLevel)}
    except CatalogError as exc:
        _raise(exc)


@student_router.get("/materials/{material_id}")
async def get_student_material(
    material_id: uuid.UUID,
    student: Annotated[User, Depends(get_student)],
    service: Annotated[CatalogService, Depends(get_catalog_service)],
) -> dict[str, Any]:
    try:
        return await service.get_student_material(student, material_id)
    except CatalogError as exc:
        _raise(exc)
