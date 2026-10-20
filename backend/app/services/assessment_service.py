"""Student assessment views and teacher review/publish/reopen."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.core.errors import ERROR_MESSAGES
from app.core.http import utcnow
from app.db.models import (
    AssessmentJob,
    AssessmentJobStatus,
    AssessmentResult,
    Assignment,
    AssignmentAccess,
    AssignmentRevision,
    Classroom,
    Submission,
    SubmissionAttempt,
    SubmissionAttemptState,
    SubmissionPage,
    TranscriptionRevision,
    TranscriptionRevisionStatus,
    User,
    UserRole,
)
from app.services.assessment_jobs import enqueue_for_confirmed, retry_failed_job
from app.services.assessment_scoring import (
    AssessmentInvalidOutput,
    apply_teacher_overlay,
    rubric_from_revision,
)
from app.services.reopen_policy import consume_reopen_grant, needs_reopen_grant, student_may_reopen
from app.services.rubric import decimal_to_number
from app.services.submission_errors import SubmissionError
from app.services.submission_locks import lock_attempt, lock_submission
from app.services.submission_service import SubmissionService, format_size

READY_TO_GRADE = SubmissionAttemptState.READY_TO_GRADE.value
OCR_REVIEW = SubmissionAttemptState.OCR_REVIEW.value
CONFIRMED_TX = TranscriptionRevisionStatus.CONFIRMED.value
JOB_QUEUED = AssessmentJobStatus.QUEUED.value
JOB_PROCESSING = AssessmentJobStatus.PROCESSING.value
JOB_FAILED = AssessmentJobStatus.FAILED.value


def public_assessment_status(
    *,
    attempt_state: str | None,
    job: AssessmentJob | None,
    result: AssessmentResult | None,
    published: AssessmentResult | None,
    current_tx_id: uuid.UUID | None,
) -> str:
    if published is not None and published.is_published:
        if attempt_state == OCR_REVIEW:
            return "revising"
        if current_tx_id and published.transcription_revision_id != current_tx_id:
            if job and job.status == JOB_FAILED:
                return "new_version_failed"
            if job and job.status in {JOB_QUEUED, JOB_PROCESSING}:
                return "new_version_grading"
            if result and not result.is_published:
                return "new_version_review"
            return "published"
        return "published"
    if attempt_state != READY_TO_GRADE:
        if attempt_state == OCR_REVIEW:
            return "revising"
        return "none"
    if job is None:
        return "queued"
    if job.status == JOB_FAILED:
        return "failed"
    if job.status in {JOB_QUEUED, JOB_PROCESSING}:
        return "grading"
    if result is not None:
        return "awaiting_review"
    return "grading"


class AssessmentService:
    def __init__(self, session: AsyncSession, settings: Settings | None = None) -> None:
        self.session = session
        self.settings = settings or get_settings()
        self.submissions = SubmissionService(session, self.settings)

    async def student_view(self, student: User, assignment_key: str) -> dict[str, Any]:
        revision, submission, attempt = await self._student_context(student, assignment_key)
        job, current_result, published = await self._load_results(submission)
        status = public_assessment_status(
            attempt_state=attempt.state if attempt else None,
            job=job,
            result=current_result,
            published=published,
            current_tx_id=attempt.confirmed_revision_id if attempt else None,
        )
        payload = await self.submissions._payload(revision, student, submission, attempt)
        payload["officialSubmittedAt"] = (
            attempt.official_submitted_at.isoformat()
            if attempt and attempt.official_submitted_at
            else None
        )
        payload["ocrSubmittedAt"] = (
            attempt.submitted_at.isoformat() if attempt and attempt.submitted_at else None
        )
        payload["canReopenTranscription"] = await student_may_reopen(
            self.session, submission=submission, attempt=attempt
        )
        if published and published.is_published:
            published_pages, published_tx = await self._published_student_artifacts(
                revision, published
            )
            if published_pages:
                payload["pages"] = published_pages
            if published_tx is not None:
                payload["transcriptionPages"] = published_tx
        payload["assessment"] = {
            "status": status,
            "jobStatus": job.status if job else None,
            "jobError": job.last_error if job and job.status == JOB_FAILED else None,
            "canViewResult": bool(published and published.is_published),
            "result": self._student_result_view(published, revision)
            if published and published.is_published
            else None,
        }
        return payload

    async def teacher_detail(
        self, teacher: User, assignment_id: uuid.UUID, student_id: uuid.UUID
    ) -> dict[str, Any]:
        assignment, revision, submission, attempt, student = await self._teacher_student(
            teacher, assignment_id, student_id
        )
        job, current_result, published = await self._load_results(submission)
        pages = await self._pages(attempt)
        transcription = await self._transcription(attempt)
        rubric = rubric_from_revision(revision.rubric, revision.snapshot)
        snapshot = revision.snapshot or {}
        classroom_name = None
        if assignment.classroom_id:
            classroom = await self.session.get(Classroom, assignment.classroom_id)
            classroom_name = classroom.name if classroom else None
        working = None
        if current_result is not None:
            working = current_result.teacher_payload or current_result.ai_payload
        status = public_assessment_status(
            attempt_state=attempt.state if attempt else None,
            job=job,
            result=current_result,
            published=published,
            current_tx_id=attempt.confirmed_revision_id if attempt else None,
        )
        return {
            "assignment": {
                "id": str(assignment.id),
                "code": assignment.code,
                "title": assignment.title,
                "classroomName": classroom_name,
                "teacherName": teacher.display_name,
                "maxScore": float(assignment.max_score),
                "scoreStep": float(assignment.score_step),
                "writingTask": snapshot.get("writingTask") or "",
                "extraInstructions": snapshot.get("extraInstructions") or assignment.extra_instructions,
                "rubric": rubric,
            },
            "student": {
                "id": str(student.id),
                "displayName": student.display_name,
                "loginId": student.login_id,
            },
            "submission": {
                "id": str(submission.id) if submission else None,
                "attemptId": str(attempt.id) if attempt else None,
                "attemptNumber": attempt.attempt_number if attempt else 0,
                "state": attempt.state if attempt else None,
                "pageCount": attempt.page_count if attempt else 0,
                "ocrSubmittedAt": attempt.submitted_at.isoformat()
                if attempt and attempt.submitted_at
                else None,
                "officialSubmittedAt": attempt.official_submitted_at.isoformat()
                if attempt and attempt.official_submitted_at
                else None,
                "confirmedAt": attempt.confirmed_at.isoformat()
                if attempt and attempt.confirmed_at
                else None,
            },
            "assessment": {
                "status": status,
                "jobStatus": job.status if job else None,
                "jobError": job.last_error if job else None,
                "canRetry": bool(job and job.status == JOB_FAILED),
                "canGrantReopen": await needs_reopen_grant(
                    self.session, submission=submission, attempt=attempt
                ),
                "reopenGranted": bool(submission and submission.reopen_granted_at),
                "currentResult": self._result_ref(current_result),
                "publishedResult": self._result_ref(published),
                "version": current_result.version if current_result is not None else None,
                "isPublished": bool(published and published.is_published),
                "publishedAt": published.published_at.isoformat()
                if published and published.published_at
                else None,
                "currentMatchesOfficial": bool(
                    current_result
                    and attempt
                    and submission
                    and submission.current_attempt_id == attempt.id
                    and current_result.attempt_id == attempt.id
                    and current_result.transcription_revision_id == attempt.confirmed_revision_id
                ),
                "publishedMatchesOfficial": bool(
                    published
                    and published.is_published
                    and attempt
                    and published.transcription_revision_id == attempt.confirmed_revision_id
                ),
                "ai": current_result.ai_payload if current_result else None,
                "working": working,
                "published": published.published_payload
                if published and published.is_published
                else None,
                "historyLabel": (
                    "Kết quả đã công bố thuộc bản nộp trước"
                    if published
                    and published.is_published
                    and attempt
                    and published.transcription_revision_id != attempt.confirmed_revision_id
                    else None
                ),
                "provider": current_result.provider if current_result else None,
                "model": current_result.model if current_result else None,
                "promptVersion": current_result.prompt_version if current_result else None,
            },
            "pages": pages,
            "transcriptionPages": transcription,
        }

    async def save_review(
        self,
        teacher: User,
        assignment_id: uuid.UUID,
        student_id: uuid.UUID,
        body: dict[str, Any],
    ) -> dict[str, Any]:
        _assignment, revision, submission, attempt, _student = await self._teacher_student(
            teacher, assignment_id, student_id
        )
        submission, attempt = await self._lock_owned(submission, attempt)
        result_id, tx_id, expected_int = self._require_result_target(body)
        result = await self._require_bound_result(
            submission,
            attempt,
            result_id=result_id,
            transcription_revision_id=tx_id,
            role="current",
        )
        tx = await self.session.get(TranscriptionRevision, result.transcription_revision_id)
        pages = list(tx.pages or []) if tx is not None else []
        rubric = (
            rubric_from_revision(result.rubric_snapshot, None)
            if result.rubric_snapshot
            else rubric_from_revision(revision.rubric, revision.snapshot)
        )
        try:
            overlay = apply_teacher_overlay(
                rubric=rubric,
                base_payload=result.teacher_payload or result.ai_payload,
                body=body,
                pages=pages,
            )
        except AssessmentInvalidOutput as exc:
            raise SubmissionError(400, "VALIDATION", exc.message) from exc
        now = utcnow()
        updated = (
            await self.session.execute(
                update(AssessmentResult)
                .where(
                    AssessmentResult.id == result.id,
                    AssessmentResult.version == expected_int,
                    AssessmentResult.transcription_revision_id == tx_id,
                )
                .values(
                    teacher_payload=overlay,
                    teacher_id=teacher.id,
                    teacher_updated_at=now,
                    total_score=Decimal(str(overlay["totalScore"])),
                    score_scale10=Decimal(str(overlay["scoreScale10"])),
                    version=expected_int + 1,
                    updated_at=now,
                )
                .returning(AssessmentResult.id)
            )
        ).one_or_none()
        if updated is None:
            raise SubmissionError(409, "VERSION_CONFLICT", ERROR_MESSAGES["VERSION_CONFLICT"])
        await self.session.commit()
        return await self.teacher_detail(teacher, assignment_id, student_id)

    async def publish(
        self,
        teacher: User,
        assignment_id: uuid.UUID,
        student_id: uuid.UUID,
        body: dict[str, Any],
    ) -> dict[str, Any]:
        _assignment, _revision, submission, attempt, _student = await self._teacher_student(
            teacher, assignment_id, student_id
        )
        submission, attempt = await self._lock_owned(submission, attempt)
        result_id, tx_id, expected_int = self._require_result_target(body)
        result = await self._require_bound_result(
            submission,
            attempt,
            result_id=result_id,
            transcription_revision_id=tx_id,
            role="current",
        )
        if (
            attempt is None
            or attempt.state != READY_TO_GRADE
            or attempt.confirmed_revision_id != result.transcription_revision_id
            or submission.current_attempt_id != attempt.id
        ):
            raise SubmissionError(409, "PUBLISH_STALE", ERROR_MESSAGES["PUBLISH_STALE"])
        now = utcnow()
        snapshot = dict(result.teacher_payload or result.ai_payload)
        history = list(result.published_history or [])
        if result.is_published and result.published_payload:
            history.append(
                {
                    "publishedAt": result.published_at.isoformat() if result.published_at else None,
                    "unpublishedAt": now.isoformat(),
                    "payload": result.published_payload,
                    "resultId": str(result.id),
                    "transcriptionRevisionId": str(result.transcription_revision_id),
                }
            )
        if (
            submission.current_published_result_id
            and submission.current_published_result_id != result.id
        ):
            previous = (
                await self.session.execute(
                    select(AssessmentResult)
                    .where(AssessmentResult.id == submission.current_published_result_id)
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            ).scalar_one_or_none()
            if previous is not None and previous.is_published:
                previous.is_published = False
                previous.unpublished_at = now
                previous.updated_at = now
                hist = list(submission.published_history or [])
                hist.append(
                    {
                        "resultId": str(previous.id),
                        "transcriptionRevisionId": str(previous.transcription_revision_id),
                        "publishedAt": previous.published_at.isoformat() if previous.published_at else None,
                        "unpublishedAt": now.isoformat(),
                        "totalScore": decimal_to_number(previous.total_score),
                    }
                )
                submission.published_history = hist
        bumped = (
            await self.session.execute(
                update(AssessmentResult)
                .where(
                    AssessmentResult.id == result.id,
                    AssessmentResult.version == expected_int,
                    AssessmentResult.transcription_revision_id == tx_id,
                )
                .values(
                    published_payload=snapshot,
                    published_history=history,
                    is_published=True,
                    published_at=now,
                    published_by=teacher.id,
                    unpublished_at=None,
                    version=expected_int + 1,
                    updated_at=now,
                )
                .returning(AssessmentResult.id)
            )
        ).one_or_none()
        if bumped is None:
            raise SubmissionError(409, "VERSION_CONFLICT", ERROR_MESSAGES["VERSION_CONFLICT"])
        if (
            attempt.state != READY_TO_GRADE
            or attempt.confirmed_revision_id != tx_id
            or submission.current_attempt_id != attempt.id
            or submission.current_assessment_result_id != result.id
        ):
            raise SubmissionError(409, "PUBLISH_STALE", ERROR_MESSAGES["PUBLISH_STALE"])
        submission.current_published_result_id = result.id
        consume_reopen_grant(submission)
        submission.updated_at = now
        await self.session.commit()
        return await self.teacher_detail(teacher, assignment_id, student_id)

    async def unpublish(
        self,
        teacher: User,
        assignment_id: uuid.UUID,
        student_id: uuid.UUID,
        body: dict[str, Any],
    ) -> dict[str, Any]:
        _assignment, _revision, submission, attempt, _student = await self._teacher_student(
            teacher, assignment_id, student_id
        )
        submission, attempt = await self._lock_owned(submission, attempt)
        result_id, tx_id, expected_int = self._require_result_target(body)
        published = await self._require_bound_result(
            submission,
            attempt,
            result_id=result_id,
            transcription_revision_id=tx_id,
            role="published",
        )
        now = utcnow()
        updated = (
            await self.session.execute(
                update(AssessmentResult)
                .where(
                    AssessmentResult.id == published.id,
                    AssessmentResult.version == expected_int,
                    AssessmentResult.transcription_revision_id == tx_id,
                    AssessmentResult.is_published.is_(True),
                )
                .values(
                    is_published=False,
                    unpublished_at=now,
                    version=expected_int + 1,
                    updated_at=now,
                )
                .returning(AssessmentResult.id)
            )
        ).one_or_none()
        if updated is None:
            raise SubmissionError(409, "VERSION_CONFLICT", ERROR_MESSAGES["VERSION_CONFLICT"])
        hist = list(submission.published_history or [])
        hist.append(
            {
                "resultId": str(published.id),
                "transcriptionRevisionId": str(published.transcription_revision_id),
                "publishedAt": published.published_at.isoformat() if published.published_at else None,
                "unpublishedAt": now.isoformat(),
                "totalScore": decimal_to_number(published.total_score),
            }
        )
        submission.published_history = hist
        if submission.current_published_result_id == published.id:
            submission.current_published_result_id = None
        submission.updated_at = now
        await self.session.commit()
        return await self.teacher_detail(teacher, assignment_id, student_id)

    async def grant_reopen(
        self,
        teacher: User,
        assignment_id: uuid.UUID,
        student_id: uuid.UUID,
    ) -> dict[str, Any]:
        _assignment, _revision, submission, attempt, _student = await self._teacher_student(
            teacher, assignment_id, student_id
        )
        submission, attempt = await self._lock_owned(submission, attempt)
        if submission is None or attempt is None:
            raise SubmissionError(404, "NOT_FOUND", "Chưa có bài nộp.")
        now = utcnow()
        submission.reopen_granted_at = now
        submission.reopen_granted_by = teacher.id
        submission.updated_at = now
        await self.session.commit()
        return await self.teacher_detail(teacher, assignment_id, student_id)

    async def retry_grade(
        self,
        teacher: User,
        assignment_id: uuid.UUID,
        student_id: uuid.UUID,
    ) -> dict[str, Any]:
        _assignment, _revision, submission, attempt, _student = await self._teacher_student(
            teacher, assignment_id, student_id
        )
        submission, attempt = await self._lock_owned(submission, attempt)
        if submission is None or attempt is None or attempt.confirmed_revision_id is None:
            raise SubmissionError(409, "ASSESSMENT_NOT_READY", ERROR_MESSAGES["ASSESSMENT_NOT_READY"])
        if submission.current_attempt_id != attempt.id:
            raise SubmissionError(409, "ASSESSMENT_STALE", ERROR_MESSAGES["ASSESSMENT_STALE"])
        job = None
        if submission.current_assessment_job_id:
            job = await self.session.get(AssessmentJob, submission.current_assessment_job_id)
        if job is None or job.transcription_revision_id != attempt.confirmed_revision_id:
            tx = await self.session.get(TranscriptionRevision, attempt.confirmed_revision_id)
            if tx is None:
                raise SubmissionError(409, "OCR_NOT_READY", ERROR_MESSAGES["OCR_NOT_READY"])
            job = await enqueue_for_confirmed(
                self.session,
                submission=submission,
                attempt=attempt,
                transcription=tx,
                settings=self.settings,
            )
        else:
            job = await retry_failed_job(self.session, job)
        await self.session.commit()
        return await self.teacher_detail(teacher, assignment_id, student_id)

    async def teacher_image(
        self,
        teacher: User,
        assignment_id: uuid.UUID,
        student_id: uuid.UUID,
        page_id: uuid.UUID,
        kind: str,
    ) -> tuple[bytes, str, str]:
        assignment, _revision, submission, attempt, _student = await self._teacher_student(
            teacher, assignment_id, student_id
        )
        if submission is None or attempt is None:
            raise SubmissionError(404, "NOT_FOUND", "Không tìm thấy trang ảnh.")
        from app.db.models import PageBlobKind, SubmissionPageBlob

        page = await self.session.get(SubmissionPage, page_id)
        if page is None or page.attempt_id != attempt.id:
            raise SubmissionError(404, "NOT_FOUND", "Không tìm thấy trang ảnh.")
        wanted = PageBlobKind.ORIGINAL.value if kind.upper() == "ORIGINAL" else PageBlobKind.PROCESSED.value
        blob = (
            await self.session.execute(
                select(SubmissionPageBlob).where(
                    SubmissionPageBlob.page_id == page.id,
                    SubmissionPageBlob.kind == wanted,
                )
            )
        ).scalar_one_or_none()
        if blob is None:
            raise SubmissionError(404, "NOT_FOUND", "Không tìm thấy trang ảnh.")
        _ = assignment
        filename = page.original_filename or f"trang-{page.page_index}.jpg"
        return blob.bytes, blob.mime_type, filename

    def _student_result_view(
        self, result: AssessmentResult, revision: AssignmentRevision
    ) -> dict[str, Any]:
        payload = result.published_payload or result.teacher_payload or result.ai_payload
        return {
            "resultId": str(result.id),
            "publishedAt": result.published_at.isoformat() if result.published_at else None,
            "totalScore": decimal_to_number(result.total_score)
            if result.published_payload is None
            else payload.get("totalScore"),
            "maxScore": payload.get("maxScore"),
            "scoreStep": payload.get("scoreStep"),
            "scoreScale10": payload.get("scoreScale10"),
            "evaluations": payload.get("evaluations") or [],
            "overallComment": payload.get("overallComment") or "",
            "improvementGuidance": payload.get("improvementGuidance") or [],
            "assignmentTitle": revision.title,
            "rubricTitle": (result.rubric_snapshot or {}).get("title") or "",
        }

    async def _student_context(
        self, student: User, assignment_key: str
    ) -> tuple[AssignmentRevision, Submission | None, SubmissionAttempt | None]:
        revision = await self.submissions._require_access(student, assignment_key)
        submission = await self.submissions._get_submission(revision.id, student.id)
        attempt = None
        if submission and submission.current_attempt_id:
            attempt = await self.submissions._load_attempt(submission.current_attempt_id)
        return revision, submission, attempt

    async def _teacher_student(
        self, teacher: User, assignment_id: uuid.UUID, student_id: uuid.UUID
    ) -> tuple[Assignment, AssignmentRevision, Submission | None, SubmissionAttempt | None, User]:
        if teacher.role != UserRole.TEACHER:
            raise SubmissionError(403, "TEACHER_REQUIRED", ERROR_MESSAGES["TEACHER_REQUIRED"])
        assignment = await self.session.get(Assignment, assignment_id)
        if assignment is None or assignment.teacher_id != teacher.id or assignment.status == "DELETED":
            raise SubmissionError(404, "NOT_FOUND", "Không tìm thấy bài tập.")
        if not assignment.published_revision_id:
            raise SubmissionError(404, "NOT_FOUND", "Bài tập chưa được giao.")
        revision = await self.session.get(AssignmentRevision, assignment.published_revision_id)
        if revision is None:
            raise SubmissionError(404, "NOT_FOUND", "Không tìm thấy bài tập.")
        student = await self.session.get(User, student_id)
        if student is None or student.role != UserRole.STUDENT:
            raise SubmissionError(404, "NOT_FOUND", "Không tìm thấy học sinh.")
        access = (
            await self.session.execute(
                select(AssignmentAccess.id).where(
                    AssignmentAccess.assignment_revision_id == revision.id,
                    AssignmentAccess.student_id == student.id,
                    AssignmentAccess.revoked_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if access is None:
            raise SubmissionError(403, "ACCESS_DENIED", ERROR_MESSAGES["ACCESS_DENIED"])
        submission = await self.submissions._get_submission(revision.id, student.id)
        attempt = None
        if submission and submission.current_attempt_id:
            attempt = await self.submissions._load_attempt(submission.current_attempt_id)
        return assignment, revision, submission, attempt, student

    async def _load_results(
        self, submission: Submission | None
    ) -> tuple[AssessmentJob | None, AssessmentResult | None, AssessmentResult | None]:
        if submission is None:
            return None, None, None
        job = None
        current = None
        published = None
        if submission.current_assessment_job_id:
            job = await self.session.get(AssessmentJob, submission.current_assessment_job_id)
        if submission.current_assessment_result_id:
            current = await self.session.get(AssessmentResult, submission.current_assessment_result_id)
        if submission.current_published_result_id:
            published = await self.session.get(AssessmentResult, submission.current_published_result_id)
        return job, current, published

    async def _lock_owned(
        self, submission: Submission | None, attempt: SubmissionAttempt | None
    ) -> tuple[Submission, SubmissionAttempt | None]:
        if submission is None:
            raise SubmissionError(404, "NOT_FOUND", "Chưa có bài nộp.")
        locked = await lock_submission(self.session, submission.id)
        current = None
        if locked is None:
            raise SubmissionError(404, "NOT_FOUND", "Chưa có bài nộp.")
        if locked.current_attempt_id:
            current = await lock_attempt(self.session, locked.current_attempt_id)
        return locked, current

    def _result_ref(self, result: AssessmentResult | None) -> dict[str, Any] | None:
        if result is None:
            return None
        return {
            "id": str(result.id),
            "transcriptionRevisionId": str(result.transcription_revision_id),
            "attemptId": str(result.attempt_id),
            "version": result.version,
            "isPublished": bool(result.is_published),
            "publishedAt": result.published_at.isoformat() if result.published_at else None,
        }

    def _require_uuid(self, body: dict[str, Any], *keys: str, label: str) -> uuid.UUID:
        raw = None
        for key in keys:
            if body.get(key) not in (None, ""):
                raw = body.get(key)
                break
        if raw is None:
            raise SubmissionError(400, "VALIDATION", f"{label} là bắt buộc.")
        try:
            return uuid.UUID(str(raw))
        except (TypeError, ValueError) as exc:
            raise SubmissionError(400, "VALIDATION", f"{label} không hợp lệ.") from exc

    def _require_version(self, body: dict[str, Any]) -> int:
        expected = body.get("expectedVersion", body.get("expected_version"))
        if expected is None:
            raise SubmissionError(400, "VALIDATION", "expectedVersion là bắt buộc.")
        try:
            return int(expected)
        except (TypeError, ValueError) as exc:
            raise SubmissionError(400, "VALIDATION", "expectedVersion không hợp lệ.") from exc

    def _require_result_target(self, body: dict[str, Any]) -> tuple[uuid.UUID, uuid.UUID, int]:
        return (
            self._require_uuid(body, "resultId", "result_id", label="resultId"),
            self._require_uuid(
                body,
                "transcriptionRevisionId",
                "transcription_revision_id",
                label="transcriptionRevisionId",
            ),
            self._require_version(body),
        )

    async def _require_bound_result(
        self,
        submission: Submission,
        attempt: SubmissionAttempt | None,
        *,
        result_id: uuid.UUID,
        transcription_revision_id: uuid.UUID,
        role: str,
    ) -> AssessmentResult:
        result = (
            await self.session.execute(
                select(AssessmentResult)
                .where(AssessmentResult.id == result_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if result is None:
            raise SubmissionError(409, "ASSESSMENT_STALE", ERROR_MESSAGES["ASSESSMENT_STALE"])
        if (
            result.submission_id != submission.id
            or result.student_id != submission.student_id
            or result.transcription_revision_id != transcription_revision_id
        ):
            raise SubmissionError(409, "ASSESSMENT_STALE", ERROR_MESSAGES["ASSESSMENT_STALE"])
        if role == "current":
            if (
                attempt is None
                or submission.current_assessment_result_id != result.id
                or submission.current_attempt_id != result.attempt_id
                or attempt.id != result.attempt_id
                or attempt.confirmed_revision_id != result.transcription_revision_id
            ):
                raise SubmissionError(409, "ASSESSMENT_STALE", ERROR_MESSAGES["ASSESSMENT_STALE"])
        elif role == "published":
            if (
                submission.current_published_result_id != result.id
                or not result.is_published
            ):
                raise SubmissionError(409, "ASSESSMENT_STALE", ERROR_MESSAGES["ASSESSMENT_STALE"])
        return result

    async def _current_tx(self, attempt: SubmissionAttempt | None) -> TranscriptionRevision:
        if attempt is None:
            raise SubmissionError(409, "OCR_NOT_READY", ERROR_MESSAGES["OCR_NOT_READY"])
        current = (
            await self.session.execute(
                select(TranscriptionRevision).where(
                    TranscriptionRevision.attempt_id == attempt.id,
                    TranscriptionRevision.revision == attempt.current_revision,
                )
            )
        ).scalar_one_or_none()
        if current is None:
            raise SubmissionError(409, "OCR_NOT_READY", ERROR_MESSAGES["OCR_NOT_READY"])
        return current

    async def _published_student_artifacts(
        self, revision: AssignmentRevision, published: AssessmentResult
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]] | None]:
        attempt = await self.submissions._load_attempt(published.attempt_id)
        pages_out: list[dict[str, Any]] = []
        if attempt is not None:
            key = str(revision.assignment_id or revision.id)
            pages = sorted(attempt.pages or [], key=lambda item: item.page_index)
            for page in pages:
                pages_out.append(
                    {
                        "id": str(page.id),
                        "pageIndex": page.page_index,
                        "filename": page.original_filename,
                        "size": format_size(page.processed_byte_size or page.byte_size),
                        "imageUrl": (
                            f"/api/assignments/{key}/submission/pages/{page.id}/image"
                            f"?kind=processed&v={page.processed_sha256[:16]}"
                        ),
                        "originalImageUrl": (
                            f"/api/assignments/{key}/submission/pages/{page.id}/image"
                            f"?kind=original&v={page.original_sha256[:16]}"
                        ),
                    }
                )
        tx = await self.session.get(TranscriptionRevision, published.transcription_revision_id)
        transcription = None
        if tx is not None:
            from app.services.ocr_normalize import public_page

            transcription = [public_page(item) for item in tx.pages or [] if isinstance(item, dict)]
        return pages_out, transcription

    async def _pages(self, attempt: SubmissionAttempt | None) -> list[dict[str, Any]]:
        if attempt is None:
            return []
        pages = sorted(attempt.pages or [], key=lambda item: item.page_index)
        out: list[dict[str, Any]] = []
        assignment_key = str(attempt.assignment_revision_id)
        submission = await self.session.get(Submission, attempt.submission_id)
        student_id = submission.student_id if submission else None
        revision = await self.session.get(AssignmentRevision, attempt.assignment_revision_id)
        catalog_id = revision.assignment_id if revision else None
        key = catalog_id or attempt.assignment_revision_id
        for page in pages:
            out.append(
                {
                    "id": str(page.id),
                    "pageIndex": page.page_index,
                    "filename": page.original_filename,
                    "size": format_size(page.processed_byte_size or page.byte_size),
                    "imageUrl": (
                        f"/api/teacher/assignments/{key}/students/{student_id}"
                        f"/pages/{page.id}/image?kind=processed&v={page.processed_sha256[:16]}"
                    ),
                    "originalImageUrl": (
                        f"/api/teacher/assignments/{key}/students/{student_id}"
                        f"/pages/{page.id}/image?kind=original&v={page.original_sha256[:16]}"
                    ),
                    "caption": page.original_filename or f"Trang {page.page_index}",
                }
            )
        _ = assignment_key
        return out

    async def _transcription(self, attempt: SubmissionAttempt | None) -> list[dict[str, Any]]:
        if attempt is None:
            return []
        tx = None
        if attempt.confirmed_revision_id:
            tx = await self.session.get(TranscriptionRevision, attempt.confirmed_revision_id)
        if tx is None:
            tx = await self._current_tx(attempt)
        from app.services.ocr_normalize import public_page

        return [public_page(item) for item in tx.pages or [] if isinstance(item, dict)]
