"""Student handwritten submission and OCR review APIs.

GET is read-only. POST/PATCH mutate with existing cookie + CSRF/Origin guards.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.responses import Response

from app.core.errors import ApiHttpException, ERROR_MESSAGES
from app.db.models import User, UserRole
from app.identity.deps import get_session_context, require_mutation_guards
from app.identity.service import SessionContext
from app.services.ocr_service import OcrReviewService
from app.services.submission_errors import SubmissionError
from app.services.submission_service import SubmissionService

router = APIRouter(
    prefix="/assignments",
    tags=["submissions"],
    dependencies=[Depends(require_mutation_guards)],
)


def _raise(exc: SubmissionError) -> None:
    raise ApiHttpException(exc.status_code, exc.code, exc.message, fields=exc.fields)


async def get_student(ctx: Annotated[SessionContext, Depends(get_session_context)]) -> User:
    if ctx.user.role != UserRole.STUDENT:
        raise ApiHttpException(
            status.HTTP_403_FORBIDDEN,
            "STUDENT_REQUIRED",
            ERROR_MESSAGES["STUDENT_REQUIRED"],
        )
    return ctx.user


async def get_submission_service(
    ctx: Annotated[SessionContext, Depends(get_session_context)],
) -> SubmissionService:
    return SubmissionService(ctx.db)


async def get_ocr_service(
    ctx: Annotated[SessionContext, Depends(get_session_context)],
) -> OcrReviewService:
    return OcrReviewService(ctx.db)


def _content_disposition(filename: str) -> str:
    ascii_name = filename.encode("ascii", "ignore").decode("ascii").replace('"', "").strip() or "anh-bai"
    return f"inline; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"


@router.get("/{assignment_key}/submission")
async def get_submission(
    assignment_key: str,
    student: Annotated[User, Depends(get_student)],
    service: Annotated[SubmissionService, Depends(get_submission_service)],
) -> dict[str, Any]:
    try:
        return await service.get_payload(student, assignment_key)
    except SubmissionError as exc:
        _raise(exc)


@router.post("/{assignment_key}/submission/pages")
async def upload_page(
    assignment_key: str,
    student: Annotated[User, Depends(get_student)],
    service: Annotated[SubmissionService, Depends(get_submission_service)],
    file: Annotated[UploadFile, File()],
) -> dict[str, Any]:
    data = await file.read()
    try:
        return await service.upload_page(
            student,
            assignment_key,
            data=data,
            filename=file.filename or "anh.jpg",
            declared_mime=file.content_type,
        )
    except SubmissionError as exc:
        _raise(exc)


@router.patch("/{assignment_key}/submission/pages/{page_id}")
async def update_page(
    assignment_key: str,
    page_id: uuid.UUID,
    student: Annotated[User, Depends(get_student)],
    service: Annotated[SubmissionService, Depends(get_submission_service)],
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    try:
        return await service.update_page(
            student, assignment_key, page_id, body or {}
        )
    except SubmissionError as exc:
        _raise(exc)


@router.post("/{assignment_key}/submission/pages/{page_id}/replace")
async def replace_page(
    assignment_key: str,
    page_id: uuid.UUID,
    student: Annotated[User, Depends(get_student)],
    service: Annotated[SubmissionService, Depends(get_submission_service)],
    file: Annotated[UploadFile, File()],
    rotation_degrees: Annotated[int | None, Form()] = None,
) -> dict[str, Any]:
    data = await file.read()
    body: dict[str, Any] = {}
    if rotation_degrees is not None:
        body["rotationDegrees"] = rotation_degrees
    try:
        return await service.update_page(
            student,
            assignment_key,
            page_id,
            body,
            replace_bytes=data,
            replace_filename=file.filename or "anh.jpg",
            replace_mime=file.content_type,
        )
    except SubmissionError as exc:
        _raise(exc)


@router.delete("/{assignment_key}/submission/pages")
async def delete_all_pages(
    assignment_key: str,
    student: Annotated[User, Depends(get_student)],
    service: Annotated[SubmissionService, Depends(get_submission_service)],
) -> dict[str, Any]:
    try:
        return await service.delete_all_pages(student, assignment_key)
    except SubmissionError as exc:
        _raise(exc)


@router.delete("/{assignment_key}/submission/pages/{page_id}")
async def delete_page(
    assignment_key: str,
    page_id: uuid.UUID,
    student: Annotated[User, Depends(get_student)],
    service: Annotated[SubmissionService, Depends(get_submission_service)],
) -> dict[str, Any]:
    try:
        return await service.delete_page(student, assignment_key, page_id)
    except SubmissionError as exc:
        _raise(exc)


@router.post("/{assignment_key}/submission/reorder")
async def reorder_pages(
    assignment_key: str,
    body: dict[str, Any],
    student: Annotated[User, Depends(get_student)],
    service: Annotated[SubmissionService, Depends(get_submission_service)],
) -> dict[str, Any]:
    try:
        return await service.reorder_pages(
            student, assignment_key, list(body.get("pageIds") or body.get("page_ids") or [])
        )
    except SubmissionError as exc:
        _raise(exc)


@router.get("/{assignment_key}/submission/pages/{page_id}/image")
async def get_page_image(
    assignment_key: str,
    page_id: uuid.UUID,
    student: Annotated[User, Depends(get_student)],
    service: Annotated[SubmissionService, Depends(get_submission_service)],
    kind: str = "processed",
) -> Response:
    try:
        data, mime, filename = await service.get_image(student, assignment_key, page_id, kind)
    except SubmissionError as exc:
        _raise(exc)
    return Response(
        content=data,
        media_type=mime,
        headers={
            "Content-Disposition": _content_disposition(filename),
            "Cache-Control": "private, no-store",
        },
    )


@router.post("/{assignment_key}/submission/submit")
async def submit_photos(
    assignment_key: str,
    student: Annotated[User, Depends(get_student)],
    service: Annotated[SubmissionService, Depends(get_submission_service)],
) -> dict[str, Any]:
    try:
        return await service.submit(student, assignment_key)
    except SubmissionError as exc:
        _raise(exc)


@router.post("/{assignment_key}/submission/retry-ocr")
async def retry_ocr(
    assignment_key: str,
    student: Annotated[User, Depends(get_student)],
    service: Annotated[SubmissionService, Depends(get_submission_service)],
) -> dict[str, Any]:
    try:
        return await service.retry_ocr(student, assignment_key)
    except SubmissionError as exc:
        _raise(exc)


@router.post("/{assignment_key}/submission/new-attempt")
async def new_attempt(
    assignment_key: str,
    student: Annotated[User, Depends(get_student)],
    service: Annotated[SubmissionService, Depends(get_submission_service)],
) -> dict[str, Any]:
    try:
        return await service.new_attempt(student, assignment_key)
    except SubmissionError as exc:
        _raise(exc)


@router.post("/{assignment_key}/submission/start-revision")
async def start_revision(
    assignment_key: str,
    student: Annotated[User, Depends(get_student)],
    service: Annotated[SubmissionService, Depends(get_submission_service)],
) -> dict[str, Any]:
    try:
        return await service.start_revision(student, assignment_key)
    except SubmissionError as exc:
        _raise(exc)


@router.get("/{assignment_key}/ocr")
async def get_ocr(
    assignment_key: str,
    student: Annotated[User, Depends(get_student)],
    service: Annotated[OcrReviewService, Depends(get_ocr_service)],
) -> dict[str, Any]:
    try:
        return await service.read(student, assignment_key)
    except SubmissionError as exc:
        _raise(exc)


@router.patch("/{assignment_key}/ocr/segments")
async def save_ocr_segments(
    assignment_key: str,
    body: dict[str, Any],
    student: Annotated[User, Depends(get_student)],
    service: Annotated[OcrReviewService, Depends(get_ocr_service)],
) -> dict[str, Any]:
    try:
        return await service.save_segments(student, assignment_key, body)
    except SubmissionError as exc:
        _raise(exc)


@router.post("/{assignment_key}/ocr/confirm")
async def confirm_ocr(
    assignment_key: str,
    student: Annotated[User, Depends(get_student)],
    service: Annotated[OcrReviewService, Depends(get_ocr_service)],
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    try:
        return await service.confirm(student, assignment_key, body or {})
    except SubmissionError as exc:
        _raise(exc)


@router.post("/{assignment_key}/ocr/reopen")
async def reopen_ocr(
    assignment_key: str,
    student: Annotated[User, Depends(get_student)],
    service: Annotated[OcrReviewService, Depends(get_ocr_service)],
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    try:
        return await service.reopen(student, assignment_key, body or {})
    except SubmissionError as exc:
        _raise(exc)
