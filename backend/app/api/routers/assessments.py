"""Student assessment views and teacher review/publish/class reports.

GET is read-only. Mutations use cookie + CSRF/Origin guards.
Students only receive published scores. Teachers only see owned assignments.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response

from app.core.errors import ApiHttpException, ERROR_MESSAGES
from app.db.models import User, UserRole
from app.identity.deps import get_session_context, require_mutation_guards
from app.identity.service import SessionContext
from app.services.assessment_service import AssessmentService
from app.services.report_service import ReportService
from app.services.submission_errors import SubmissionError

student_router = APIRouter(
    prefix="/assignments",
    tags=["assessment"],
    dependencies=[Depends(require_mutation_guards)],
)

teacher_router = APIRouter(
    prefix="/teacher",
    tags=["assessment-teacher"],
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


async def get_teacher(ctx: Annotated[SessionContext, Depends(get_session_context)]) -> User:
    if ctx.user.role != UserRole.TEACHER:
        raise ApiHttpException(
            status.HTTP_403_FORBIDDEN,
            "TEACHER_REQUIRED",
            ERROR_MESSAGES["TEACHER_REQUIRED"],
        )
    return ctx.user


async def get_assessment_service(
    ctx: Annotated[SessionContext, Depends(get_session_context)],
) -> AssessmentService:
    return AssessmentService(ctx.db)


async def get_report_service(
    ctx: Annotated[SessionContext, Depends(get_session_context)],
) -> ReportService:
    return ReportService(ctx.db)


def _content_disposition(filename: str) -> str:
    ascii_name = filename.encode("ascii", "ignore").decode("ascii").replace('"', "").strip() or "anh-bai"
    return f"inline; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"


@student_router.get("/{assignment_key}/assessment")
async def student_assessment(
    assignment_key: str,
    student: Annotated[User, Depends(get_student)],
    service: Annotated[AssessmentService, Depends(get_assessment_service)],
) -> dict[str, Any]:
    try:
        return await service.student_view(student, assignment_key)
    except SubmissionError as exc:
        _raise(exc)


def _uuid_list(values: list[uuid.UUID] | None, csv: str | None) -> list[uuid.UUID] | None:
    items: list[uuid.UUID] = []
    for item in values or []:
        items.append(item)
    if csv:
        for part in csv.split(","):
            text = part.strip()
            if not text:
                continue
            items.append(uuid.UUID(text))
    unique: list[uuid.UUID] = []
    seen: set[uuid.UUID] = set()
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        unique.append(item)
    return unique or None


@teacher_router.get("/competency-reports")
async def competency_report(
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[ReportService, Depends(get_report_service)],
    classroom_id: uuid.UUID | None = None,
    assignment_ids: Annotated[list[uuid.UUID] | None, Query(alias="assignmentId")] = None,
    assignment_ids_csv: Annotated[str | None, Query(alias="assignmentIds")] = None,
    student_id: uuid.UUID | None = None,
    date_from: Annotated[str | None, Query(alias="from")] = None,
    date_to: Annotated[str | None, Query(alias="to")] = None,
    mode: str | None = None,
    search: str = "",
    sort: str = "default",
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    try:
        return await service.competency_report(
            teacher,
            classroom_id=classroom_id,
            assignment_ids=_uuid_list(assignment_ids, assignment_ids_csv),
            student_id=student_id,
            date_from=date_from,
            date_to=date_to,
            mode=mode,
            search=search,
            sort=sort,
            page=page,
            page_size=page_size,
        )
    except SubmissionError as exc:
        _raise(exc)
    except ValueError:
        raise ApiHttpException(status.HTTP_400_BAD_REQUEST, "VALIDATION", ERROR_MESSAGES["VALIDATION"])


@teacher_router.post("/competency-reports/insights")
async def enqueue_competency_insight(
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[ReportService, Depends(get_report_service)],
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = body or {}
    raw_ids = payload.get("assignmentIds") or payload.get("assignmentId") or []
    if isinstance(raw_ids, str):
        raw_ids = [part.strip() for part in raw_ids.split(",") if part.strip()]
    if not isinstance(raw_ids, list):
        raw_ids = [raw_ids]
    parsed_ids: list[uuid.UUID] = []
    try:
        for item in raw_ids:
            if item:
                parsed_ids.append(uuid.UUID(str(item)))
        classroom = payload.get("classroomId")
        student = payload.get("studentId")
        return await service.enqueue_competency_insight(
            teacher,
            classroom_id=uuid.UUID(str(classroom)) if classroom else None,
            assignment_ids=parsed_ids or None,
            student_id=uuid.UUID(str(student)) if student else None,
            date_from=payload.get("from") or payload.get("dateFrom"),
            date_to=payload.get("to") or payload.get("dateTo"),
            mode=payload.get("mode"),
        )
    except SubmissionError as exc:
        _raise(exc)
    except ValueError:
        raise ApiHttpException(status.HTTP_400_BAD_REQUEST, "VALIDATION", ERROR_MESSAGES["VALIDATION"])


@teacher_router.get("/reports")
async def list_report_assignments(
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[ReportService, Depends(get_report_service)],
    classroom_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    try:
        return await service.list_report_assignments(teacher, classroom_id=classroom_id)
    except SubmissionError as exc:
        _raise(exc)


@teacher_router.get("/reports/{assignment_id}")
async def class_report(
    assignment_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[ReportService, Depends(get_report_service)],
    search: str = "",
    status_filter: Annotated[str, Query(alias="status")] = "all",
    sort: str = "default",
    page: int = 1,
    page_size: int = 10,
    mode: str | None = None,
    date_from: Annotated[str | None, Query(alias="from")] = None,
    date_to: Annotated[str | None, Query(alias="to")] = None,
    student_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    try:
        return await service.class_report(
            teacher,
            assignment_id,
            mode=mode,
            search=search,
            status=status_filter,
            sort=sort,
            page=page,
            page_size=page_size,
            date_from=date_from,
            date_to=date_to,
            student_id=student_id,
        )
    except SubmissionError as exc:
        _raise(exc)


@teacher_router.post("/reports/{assignment_id}/insights")
async def enqueue_insight(
    assignment_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[ReportService, Depends(get_report_service)],
    body: dict[str, Any] | None = None,
    mode: str | None = None,
) -> dict[str, Any]:
    payload = body or {}
    try:
        student = payload.get("studentId")
        return await service.enqueue_assignment_insight(
            teacher,
            assignment_id,
            mode=payload.get("mode") or mode,
            date_from=payload.get("from") or payload.get("dateFrom"),
            date_to=payload.get("to") or payload.get("dateTo"),
            student_id=uuid.UUID(str(student)) if student else None,
        )
    except SubmissionError as exc:
        _raise(exc)
    except ValueError:
        raise ApiHttpException(status.HTTP_400_BAD_REQUEST, "VALIDATION", ERROR_MESSAGES["VALIDATION"])


@teacher_router.get("/assignments/{assignment_id}/students/{student_id}/assessment")
async def teacher_student_assessment(
    assignment_id: uuid.UUID,
    student_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[AssessmentService, Depends(get_assessment_service)],
) -> dict[str, Any]:
    try:
        return await service.teacher_detail(teacher, assignment_id, student_id)
    except SubmissionError as exc:
        _raise(exc)


@teacher_router.patch("/assignments/{assignment_id}/students/{student_id}/assessment")
async def save_teacher_review(
    assignment_id: uuid.UUID,
    student_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[AssessmentService, Depends(get_assessment_service)],
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    try:
        return await service.save_review(teacher, assignment_id, student_id, body or {})
    except SubmissionError as exc:
        _raise(exc)


@teacher_router.post("/assignments/{assignment_id}/students/{student_id}/assessment/publish")
async def publish_assessment(
    assignment_id: uuid.UUID,
    student_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[AssessmentService, Depends(get_assessment_service)],
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    try:
        return await service.publish(teacher, assignment_id, student_id, body or {})
    except SubmissionError as exc:
        _raise(exc)


@teacher_router.post("/assignments/{assignment_id}/students/{student_id}/assessment/unpublish")
async def unpublish_assessment(
    assignment_id: uuid.UUID,
    student_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[AssessmentService, Depends(get_assessment_service)],
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    try:
        return await service.unpublish(teacher, assignment_id, student_id, body or {})
    except SubmissionError as exc:
        _raise(exc)


@teacher_router.post("/assignments/{assignment_id}/students/{student_id}/assessment/retry")
async def retry_assessment(
    assignment_id: uuid.UUID,
    student_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[AssessmentService, Depends(get_assessment_service)],
) -> dict[str, Any]:
    try:
        return await service.retry_grade(teacher, assignment_id, student_id)
    except SubmissionError as exc:
        _raise(exc)


@teacher_router.post("/assignments/{assignment_id}/students/{student_id}/assessment/grant-reopen")
async def grant_reopen(
    assignment_id: uuid.UUID,
    student_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[AssessmentService, Depends(get_assessment_service)],
) -> dict[str, Any]:
    try:
        return await service.grant_reopen(teacher, assignment_id, student_id)
    except SubmissionError as exc:
        _raise(exc)


@teacher_router.get("/assignments/{assignment_id}/students/{student_id}/pages/{page_id}/image")
async def teacher_page_image(
    assignment_id: uuid.UUID,
    student_id: uuid.UUID,
    page_id: uuid.UUID,
    teacher: Annotated[User, Depends(get_teacher)],
    service: Annotated[AssessmentService, Depends(get_assessment_service)],
    kind: str = "processed",
) -> Response:
    try:
        data, mime, filename = await service.teacher_image(
            teacher, assignment_id, student_id, page_id, kind
        )
    except SubmissionError as exc:
        _raise(exc)
        raise
    return Response(
        content=data,
        media_type=mime,
        headers={
            "Content-Disposition": _content_disposition(filename),
            "Cache-Control": "private, no-store",
        },
    )
