"""Student handwritten page draft, freeze-on-submit, and image access."""

from __future__ import annotations

import hashlib
import logging
import uuid
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import Settings, get_settings
from app.core.errors import ERROR_MESSAGES
from app.core.http import utcnow
from app.db.models import (
    AssignmentAccess,
    AssignmentRevision,
    OcrJobStatus,
    PageBlobKind,
    Submission,
    SubmissionAttempt,
    SubmissionAttemptState,
    SubmissionPage,
    SubmissionPageBlob,
    User,
    UserRole,
)
from app.services.document_convert import safe_filename
from app.services.image_process import ImageProcessError, validate_and_process
from app.services.ocr_normalize import public_page
from app.services.submission_errors import SubmissionError

logger = logging.getLogger("edulit.submission")

DRAFT = SubmissionAttemptState.DRAFT.value
QUEUED = SubmissionAttemptState.QUEUED.value
OCR_PROCESSING = SubmissionAttemptState.OCR_PROCESSING.value
OCR_REVIEW = SubmissionAttemptState.OCR_REVIEW.value
FAILED = SubmissionAttemptState.FAILED.value
READY_TO_GRADE = SubmissionAttemptState.READY_TO_GRADE.value
FROZEN = {QUEUED, OCR_PROCESSING, OCR_REVIEW, FAILED, READY_TO_GRADE}


def format_size(byte_size: int) -> str:
    if byte_size >= 1024 * 1024:
        return f"{byte_size / (1024 * 1024):.1f} MB"
    if byte_size >= 1024:
        return f"{max(1, round(byte_size / 1024))} KB"
    return f"{byte_size} B"


def public_status(state: str, ocr_status: str) -> str:
    if state == DRAFT:
        return "draft"
    if state == QUEUED or ocr_status == OcrJobStatus.QUEUED.value:
        return "queued"
    if state == OCR_PROCESSING or ocr_status == OcrJobStatus.PROCESSING.value:
        return "processing"
    if state == FAILED or ocr_status == OcrJobStatus.FAILED.value:
        return "failed"
    if state == READY_TO_GRADE:
        return "confirmed"
    if state == OCR_REVIEW:
        return "review"
    return "draft"


class SubmissionService:
    def __init__(self, session: AsyncSession, settings: Settings | None = None) -> None:
        self.session = session
        self.settings = settings or get_settings()

    async def get_payload(self, student: User, assignment_key: str) -> dict[str, Any]:
        revision = await self._require_access(student, assignment_key)
        submission = await self._get_submission(revision.id, student.id)
        attempt = None
        if submission and submission.current_attempt_id:
            attempt = await self._load_attempt(submission.current_attempt_id)
        return await self._payload(revision, student, submission, attempt)

    async def upload_page(
        self,
        student: User,
        assignment_key: str,
        *,
        data: bytes,
        filename: str,
        declared_mime: str | None,
    ) -> dict[str, Any]:
        revision, submission, attempt = await self._require_draft(student, assignment_key)
        max_pages = int(self.settings.OCR_MAX_PAGES or 4)
        if attempt.page_count >= max_pages:
            raise SubmissionError(400, "SUBMISSION_PAGE_LIMIT", ERROR_MESSAGES["SUBMISSION_PAGE_LIMIT"])
        processed = self._process_image(data, 0, [], declared_mime)
        next_index = attempt.page_count + 1
        page = SubmissionPage(
            attempt_id=attempt.id,
            page_index=next_index,
            original_filename=safe_filename(filename),
            mime_type=processed.original_mime,
            byte_size=processed.original_byte_size,
            width=processed.width,
            height=processed.height,
            rotation_degrees=0,
            mask_regions=[],
            original_sha256=processed.original_sha256,
            processed_sha256=processed.processed_sha256,
            processed_mime_type=processed.processed_mime,
            processed_byte_size=processed.processed_byte_size,
        )
        self.session.add(page)
        await self.session.flush()
        self.session.add(
            SubmissionPageBlob(
                page_id=page.id,
                kind=PageBlobKind.ORIGINAL.value,
                mime_type=processed.original_mime,
                sha256=processed.original_sha256,
                byte_size=processed.original_byte_size,
                bytes=data,
            )
        )
        self.session.add(
            SubmissionPageBlob(
                page_id=page.id,
                kind=PageBlobKind.PROCESSED.value,
                mime_type=processed.processed_mime,
                sha256=processed.processed_sha256,
                byte_size=processed.processed_byte_size,
                bytes=processed.processed_bytes,
            )
        )
        attempt.page_count = next_index
        attempt.updated_at = utcnow()
        submission.updated_at = attempt.updated_at
        return await self.commit_payload(revision, student, submission, attempt)

    async def update_page(
        self,
        student: User,
        assignment_key: str,
        page_id: uuid.UUID,
        body: dict[str, Any],
        *,
        replace_bytes: bytes | None = None,
        replace_filename: str | None = None,
        replace_mime: str | None = None,
    ) -> dict[str, Any]:
        revision, submission, attempt = await self._require_draft(student, assignment_key)
        page = await self._page_of_attempt(attempt.id, page_id)
        rotation = page.rotation_degrees
        masks = list(page.mask_regions or [])
        if "rotationDegrees" in body:
            rotation = int(body.get("rotationDegrees") or 0) % 360
            if rotation not in {0, 90, 180, 270}:
                raise SubmissionError(400, "VALIDATION", "Góc xoay không hợp lệ.", {"rotationDegrees": "0/90/180/270"})
            masks = []
        if "maskRegions" in body:
            masks = _normalize_masks(body.get("maskRegions"))
        original = await self._blob(page.id, PageBlobKind.ORIGINAL.value)
        data = replace_bytes if replace_bytes is not None else original.bytes
        filename = replace_filename if replace_bytes is not None else page.original_filename
        declared = replace_mime if replace_bytes is not None else page.mime_type
        processed = self._process_image(data, rotation, masks, declared)
        page.rotation_degrees = rotation
        page.mask_regions = masks
        page.original_filename = safe_filename(filename)
        page.mime_type = processed.original_mime
        page.byte_size = processed.original_byte_size
        page.width = processed.width
        page.height = processed.height
        page.original_sha256 = processed.original_sha256
        page.processed_sha256 = processed.processed_sha256
        page.processed_mime_type = processed.processed_mime
        page.processed_byte_size = processed.processed_byte_size
        page.updated_at = utcnow()
        if replace_bytes is not None:
            await self.session.execute(
                delete(SubmissionPageBlob).where(SubmissionPageBlob.page_id == page.id)
            )
            self.session.add(
                SubmissionPageBlob(
                    page_id=page.id,
                    kind=PageBlobKind.ORIGINAL.value,
                    mime_type=processed.original_mime,
                    sha256=processed.original_sha256,
                    byte_size=processed.original_byte_size,
                    bytes=replace_bytes,
                )
            )
            self.session.add(
                SubmissionPageBlob(
                    page_id=page.id,
                    kind=PageBlobKind.PROCESSED.value,
                    mime_type=processed.processed_mime,
                    sha256=processed.processed_sha256,
                    byte_size=processed.processed_byte_size,
                    bytes=processed.processed_bytes,
                )
            )
        else:
            await self._upsert_processed(page.id, processed)
        attempt.updated_at = page.updated_at
        submission.updated_at = page.updated_at
        return await self.commit_payload(revision, student, submission, attempt)

    async def delete_page(
        self, student: User, assignment_key: str, page_id: uuid.UUID
    ) -> dict[str, Any]:
        revision, submission, attempt = await self._require_draft(student, assignment_key)
        page = await self._page_of_attempt(attempt.id, page_id)
        await self.session.execute(
            delete(SubmissionPageBlob).where(SubmissionPageBlob.page_id == page.id)
        )
        await self.session.delete(page)
        await self.session.flush()
        remaining = (
            await self.session.execute(
                select(SubmissionPage)
                .where(SubmissionPage.attempt_id == attempt.id)
                .order_by(SubmissionPage.page_index.asc())
            )
        ).scalars().all()
        for index, item in enumerate(remaining, start=1):
            item.page_index = index
            item.updated_at = utcnow()
        attempt.page_count = len(remaining)
        attempt.updated_at = utcnow()
        submission.updated_at = attempt.updated_at
        return await self.commit_payload(revision, student, submission, attempt)

    async def reorder_pages(
        self, student: User, assignment_key: str, page_ids: list[str]
    ) -> dict[str, Any]:
        revision, submission, attempt = await self._require_draft(student, assignment_key)
        pages = (
            await self.session.execute(
                select(SubmissionPage).where(SubmissionPage.attempt_id == attempt.id)
            )
        ).scalars().all()
        by_id = {str(page.id): page for page in pages}
        ordered_ids = [str(item) for item in page_ids if str(item) in by_id]
        if len(ordered_ids) != len(pages) or set(ordered_ids) != set(by_id):
            raise SubmissionError(400, "VALIDATION", "Thứ tự trang không khớp bộ ảnh hiện tại.")
        for index, page_id in enumerate(ordered_ids, start=1):
            by_id[page_id].page_index = index + 100
        await self.session.flush()
        for index, page_id in enumerate(ordered_ids, start=1):
            by_id[page_id].page_index = index
            by_id[page_id].updated_at = utcnow()
        attempt.updated_at = utcnow()
        submission.updated_at = attempt.updated_at
        return await self.commit_payload(revision, student, submission, attempt)

    async def get_image(
        self,
        student: User,
        assignment_key: str,
        page_id: uuid.UUID,
        kind: str,
    ) -> tuple[bytes, str, str]:
        revision = await self._require_access(student, assignment_key)
        page = await self.session.get(SubmissionPage, page_id)
        if page is None:
            raise SubmissionError(404, "NOT_FOUND", "Không tìm thấy trang ảnh.")
        attempt = await self.session.get(SubmissionAttempt, page.attempt_id)
        if attempt is None or attempt.assignment_revision_id != revision.id:
            raise SubmissionError(404, "NOT_FOUND", "Không tìm thấy trang ảnh.")
        submission = await self.session.get(Submission, attempt.submission_id)
        if submission is None or submission.student_id != student.id:
            raise SubmissionError(403, "ACCESS_DENIED", "Em không xem được ảnh bài của học sinh khác.")
        wanted = PageBlobKind.ORIGINAL.value if kind.upper() == "ORIGINAL" else PageBlobKind.PROCESSED.value
        blob = await self._blob(page.id, wanted)
        filename = page.original_filename or f"trang-{page.page_index}.jpg"
        return blob.bytes, blob.mime_type, filename

    async def submit(self, student: User, assignment_key: str) -> dict[str, Any]:
        revision, submission, attempt = await self._require_owned(student, assignment_key)
        if attempt.state in {QUEUED, OCR_PROCESSING, OCR_REVIEW, READY_TO_GRADE}:
            return await self._payload(revision, student, submission, attempt)
        if attempt.state == FAILED:
            return await self.retry_ocr(student, assignment_key)
        if attempt.state != DRAFT:
            raise SubmissionError(409, "SUBMISSION_NOT_DRAFT", ERROR_MESSAGES["SUBMISSION_NOT_DRAFT"])
        pages = (
            await self.session.execute(
                select(SubmissionPage)
                .where(SubmissionPage.attempt_id == attempt.id)
                .order_by(SubmissionPage.page_index.asc())
            )
        ).scalars().all()
        max_pages = int(self.settings.OCR_MAX_PAGES or 4)
        if not pages or len(pages) > max_pages:
            raise SubmissionError(400, "SUBMISSION_EMPTY", ERROR_MESSAGES["SUBMISSION_EMPTY"])
        missing = [p.page_index for p in pages if not p.processed_sha256]
        if missing:
            raise SubmissionError(400, "VALIDATION", "Một số trang chưa có ảnh đã rà soát.")
        input_hash = _input_hash(pages)
        existing = (
            await self.session.execute(
                select(SubmissionAttempt).where(
                    SubmissionAttempt.submission_id == submission.id,
                    SubmissionAttempt.input_hash == input_hash,
                    SubmissionAttempt.state != DRAFT,
                )
            )
        ).scalar_one_or_none()
        if existing is not None and existing.id != attempt.id:
            submission.current_attempt_id = existing.id
            submission.updated_at = utcnow()
            return await self.commit_payload(revision, student, submission, existing)
        now = utcnow()
        attempt.input_hash = input_hash
        attempt.page_count = len(pages)
        attempt.state = QUEUED
        attempt.ocr_status = OcrJobStatus.QUEUED.value
        attempt.submitted_at = now
        attempt.ocr_last_error = None
        attempt.ocr_page_errors = {}
        attempt.updated_at = now
        submission.updated_at = now
        return await self.commit_payload(revision, student, submission, attempt)

    async def retry_ocr(self, student: User, assignment_key: str) -> dict[str, Any]:
        revision, submission, attempt = await self._require_owned(student, assignment_key)
        if attempt.state in {QUEUED, OCR_PROCESSING}:
            return await self._payload(revision, student, submission, attempt)
        if attempt.state != FAILED and attempt.ocr_status != OcrJobStatus.FAILED.value:
            if attempt.state == DRAFT:
                return await self.submit(student, assignment_key)
            raise SubmissionError(409, "OCR_IN_PROGRESS", ERROR_MESSAGES["OCR_IN_PROGRESS"])
        now = utcnow()
        attempt.state = QUEUED
        attempt.ocr_status = OcrJobStatus.QUEUED.value
        attempt.ocr_attempt_count = 0
        attempt.ocr_lease_token = None
        attempt.ocr_lease_expires_at = None
        attempt.ocr_last_error = None
        attempt.ocr_page_errors = {}
        attempt.ocr_finished_at = None
        attempt.updated_at = now
        submission.updated_at = now
        return await self.commit_payload(revision, student, submission, attempt)

    async def new_attempt(self, student: User, assignment_key: str) -> dict[str, Any]:
        revision, submission, current = await self._require_owned(student, assignment_key)
        if current.state == DRAFT:
            return await self._payload(revision, student, submission, current)
        nxt = (
            await self.session.execute(
                select(func.max(SubmissionAttempt.attempt_number)).where(
                    SubmissionAttempt.submission_id == submission.id
                )
            )
        ).scalar_one()
        attempt = SubmissionAttempt(
            submission_id=submission.id,
            assignment_revision_id=revision.id,
            attempt_number=int(nxt or 0) + 1,
            state=DRAFT,
            ocr_status=OcrJobStatus.NONE.value,
            ocr_max_attempts=int(self.settings.OCR_MAX_ATTEMPTS or 3),
        )
        self.session.add(attempt)
        await self.session.flush()
        submission.current_attempt_id = attempt.id
        submission.updated_at = utcnow()
        return await self.commit_payload(revision, student, submission, attempt)

    def _process_image(self, data: bytes, rotation: int, masks: list, mime: str | None):
        try:
            return validate_and_process(
                data,
                settings=self.settings,
                rotation_degrees=rotation,
                mask_regions=masks,
                declared_mime=mime,
            )
        except ImageProcessError as exc:
            raise SubmissionError(400, exc.code, exc.message) from exc

    async def _upsert_processed(self, page_id: uuid.UUID, processed) -> None:
        await self.session.execute(
            delete(SubmissionPageBlob).where(
                SubmissionPageBlob.page_id == page_id,
                SubmissionPageBlob.kind == PageBlobKind.PROCESSED.value,
            )
        )
        self.session.add(
            SubmissionPageBlob(
                page_id=page_id,
                kind=PageBlobKind.PROCESSED.value,
                mime_type=processed.processed_mime,
                sha256=processed.processed_sha256,
                byte_size=processed.processed_byte_size,
                bytes=processed.processed_bytes,
            )
        )

    async def _blob(self, page_id: uuid.UUID, kind: str) -> SubmissionPageBlob:
        blob = (
            await self.session.execute(
                select(SubmissionPageBlob).where(
                    SubmissionPageBlob.page_id == page_id,
                    SubmissionPageBlob.kind == kind,
                )
            )
        ).scalar_one_or_none()
        if blob is None:
            raise SubmissionError(404, "NOT_FOUND", "Không tìm thấy dữ liệu ảnh.")
        return blob

    async def _page_of_attempt(self, attempt_id: uuid.UUID, page_id: uuid.UUID) -> SubmissionPage:
        page = await self.session.get(SubmissionPage, page_id)
        if page is None or page.attempt_id != attempt_id:
            raise SubmissionError(404, "NOT_FOUND", "Không tìm thấy trang ảnh.")
        return page

    async def _require_access(self, student: User, assignment_key: str) -> AssignmentRevision:
        if student.role != UserRole.STUDENT:
            raise SubmissionError(403, "STUDENT_REQUIRED", ERROR_MESSAGES["STUDENT_REQUIRED"])
        revision = await self._find_revision(assignment_key)
        if revision is None or revision.status != "PUBLISHED":
            raise SubmissionError(404, "NOT_FOUND", "Không tìm thấy bài tập.")
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
            raise SubmissionError(403, "ACCESS_DENIED", "Em chưa được giao bài tập này.")
        return revision

    async def _find_revision(self, assignment_key: str) -> AssignmentRevision | None:
        from app.db.models import Assignment

        try:
            key_uuid = uuid.UUID(assignment_key)
        except ValueError:
            key_uuid = None
        if key_uuid is not None:
            assignment = await self.session.get(Assignment, key_uuid)
            if assignment and assignment.published_revision_id:
                revision = await self.session.get(AssignmentRevision, assignment.published_revision_id)
                if revision:
                    return revision
            revision = await self.session.get(AssignmentRevision, key_uuid)
            if revision:
                return revision
        result = await self.session.execute(
            select(AssignmentRevision)
            .where(AssignmentRevision.code == assignment_key.upper())
            .order_by(AssignmentRevision.created_at.desc())
        )
        return result.scalars().first()

    async def _get_submission(self, revision_id: uuid.UUID, student_id: uuid.UUID) -> Submission | None:
        return (
            await self.session.execute(
                select(Submission).where(
                    Submission.assignment_revision_id == revision_id,
                    Submission.student_id == student_id,
                )
            )
        ).scalar_one_or_none()

    async def _load_attempt(self, attempt_id: uuid.UUID) -> SubmissionAttempt | None:
        return (
            await self.session.execute(
                select(SubmissionAttempt)
                .where(SubmissionAttempt.id == attempt_id)
                .options(selectinload(SubmissionAttempt.pages))
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()

    async def _require_owned(
        self, student: User, assignment_key: str
    ) -> tuple[AssignmentRevision, Submission, SubmissionAttempt]:
        revision = await self._require_access(student, assignment_key)
        submission = await self._ensure_submission(revision.id, student.id)
        attempt = None
        if submission.current_attempt_id:
            attempt = await self._load_attempt(submission.current_attempt_id)
        if attempt is None:
            attempt = await self._create_attempt(submission, revision.id)
        return revision, submission, attempt

    async def _require_draft(
        self, student: User, assignment_key: str
    ) -> tuple[AssignmentRevision, Submission, SubmissionAttempt]:
        revision, submission, attempt = await self._require_owned(student, assignment_key)
        if attempt.state != DRAFT:
            raise SubmissionError(409, "SUBMISSION_NOT_DRAFT", ERROR_MESSAGES["SUBMISSION_NOT_DRAFT"])
        return revision, submission, attempt

    async def _ensure_submission(self, revision_id: uuid.UUID, student_id: uuid.UUID) -> Submission:
        await self.session.execute(
            pg_insert(Submission)
            .values(assignment_revision_id=revision_id, student_id=student_id)
            .on_conflict_do_nothing(constraint="submissions_revision_student_key")
        )
        submission = await self._get_submission(revision_id, student_id)
        if submission is None:
            raise SubmissionError(500, "INTERNAL", ERROR_MESSAGES["INTERNAL"])
        return submission

    async def _create_attempt(self, submission: Submission, revision_id: uuid.UUID) -> SubmissionAttempt:
        nxt = (
            await self.session.execute(
                select(func.max(SubmissionAttempt.attempt_number)).where(
                    SubmissionAttempt.submission_id == submission.id
                )
            )
        ).scalar_one()
        attempt = SubmissionAttempt(
            submission_id=submission.id,
            assignment_revision_id=revision_id,
            attempt_number=int(nxt or 0) + 1,
            state=DRAFT,
            ocr_status=OcrJobStatus.NONE.value,
            ocr_max_attempts=int(self.settings.OCR_MAX_ATTEMPTS or 3),
        )
        self.session.add(attempt)
        await self.session.flush()
        submission.current_attempt_id = attempt.id
        submission.updated_at = utcnow()
        await self.session.flush()
        loaded = await self._load_attempt(attempt.id)
        assert loaded is not None
        return loaded

    async def _payload(
        self,
        revision: AssignmentRevision,
        student: User,
        submission: Submission | None,
        attempt: SubmissionAttempt | None,
    ) -> dict[str, Any]:
        from app.db.models import OcrResult, TranscriptionRevision

        pages_out: list[dict[str, Any]] = []
        if attempt is not None:
            pages = sorted(attempt.pages or [], key=lambda item: item.page_index)
            for page in pages:
                pages_out.append(
                    {
                        "id": str(page.id),
                        "pageIndex": page.page_index,
                        "filename": page.original_filename,
                        "mimeType": page.mime_type,
                        "size": format_size(page.processed_byte_size or page.byte_size),
                        "byteSize": page.byte_size,
                        "processedByteSize": page.processed_byte_size,
                        "width": page.width,
                        "height": page.height,
                        "rotationDegrees": page.rotation_degrees,
                        "maskRegions": page.mask_regions or [],
                        "originalImageUrl": (
                            f"/api/assignments/{revision.assignment_id or revision.id}"
                            f"/submission/pages/{page.id}/image?kind=original"
                            f"&v={page.original_sha256[:16]}"
                        ),
                        "imageUrl": (
                            f"/api/assignments/{revision.assignment_id or revision.id}"
                            f"/submission/pages/{page.id}/image?kind=processed"
                            f"&v={page.processed_sha256[:16]}"
                        ),
                        "processedSha256": page.processed_sha256,
                    }
                )
        ocr_pages: list[dict[str, Any]] = []
        draft_pages: list[dict[str, Any]] = []
        expected_revision = 0
        confirmed = False
        transcription_status = None
        if attempt is not None:
            ocr = (
                await self.session.execute(
                    select(OcrResult).where(OcrResult.attempt_id == attempt.id)
                )
            ).scalar_one_or_none()
            if ocr is not None:
                ocr_pages = [public_page(item) for item in ocr.pages or [] if isinstance(item, dict)]
            current = (
                await self.session.execute(
                    select(TranscriptionRevision)
                    .where(
                        TranscriptionRevision.attempt_id == attempt.id,
                        TranscriptionRevision.revision == attempt.current_revision,
                    )
                    .execution_options(populate_existing=True)
                )
            ).scalar_one_or_none()
            if current is not None:
                draft_pages = [public_page(item) for item in current.pages or [] if isinstance(item, dict)]
                expected_revision = current.revision
                transcription_status = current.status
                confirmed = current.status == "CONFIRMED"
        snapshot = revision.snapshot or {}
        instructions = revision.instructions or {}
        state = attempt.state if attempt else DRAFT
        ocr_status = attempt.ocr_status if attempt else OcrJobStatus.NONE.value
        return {
            "assignment": {
                "id": str(revision.assignment_id or revision.id),
                "revisionId": str(revision.id),
                "code": revision.code,
                "title": revision.title,
                "dueAt": revision.due_at.isoformat() if revision.due_at else snapshot.get("dueAt"),
                "writingTask": snapshot.get("writingTask") or instructions.get("writing_task") or "",
                "extraInstructions": snapshot.get("extraInstructions")
                or instructions.get("extra_instructions")
                or "",
            },
            "student": {
                "id": str(student.id),
                "displayName": student.display_name,
                "loginId": student.login_id,
            },
            "submissionId": str(submission.id) if submission else None,
            "attemptId": str(attempt.id) if attempt else None,
            "attemptNumber": attempt.attempt_number if attempt else 0,
            "state": state,
            "status": public_status(state, ocr_status),
            "ocrStatus": ocr_status,
            "ocrError": attempt.ocr_last_error if attempt else None,
            "ocrPageErrors": attempt.ocr_page_errors if attempt else {},
            "submittedAt": attempt.submitted_at.isoformat() if attempt and attempt.submitted_at else None,
            "confirmedAt": attempt.confirmed_at.isoformat() if attempt and attempt.confirmed_at else None,
            "pages": pages_out,
            "ocrPages": ocr_pages,
            "transcriptionPages": draft_pages or ocr_pages,
            "expectedRevision": expected_revision,
            "transcriptionStatus": transcription_status,
            "confirmed": confirmed,
            "canEditPages": state == DRAFT,
            "canSubmit": state == DRAFT and bool(pages_out),
            "canRetryOcr": state == FAILED or ocr_status == OcrJobStatus.FAILED.value,
            "canConfirm": state == OCR_REVIEW,
            "waitingForGrade": state == READY_TO_GRADE,
        }

    async def commit_payload(
        self,
        revision: AssignmentRevision,
        student: User,
        submission: Submission | None,
        attempt: SubmissionAttempt | None,
    ) -> dict[str, Any]:
        await self.session.commit()
        fresh_submission = submission
        if submission is not None:
            fresh_submission = await self._get_submission(revision.id, student.id)
        fresh_attempt = None
        attempt_id = attempt.id if attempt is not None else None
        if attempt_id is not None:
            fresh_attempt = await self._load_attempt(attempt_id)
        return await self._payload(revision, student, fresh_submission, fresh_attempt)


def _input_hash(pages: list[SubmissionPage]) -> str:
    parts = [f"{page.page_index}:{page.processed_sha256}" for page in pages]
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


def _normalize_masks(raw: Any) -> list[dict[str, float]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, float]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            x = float(item.get("x", 0))
            y = float(item.get("y", 0))
            w = float(item.get("width", item.get("w", 0)))
            h = float(item.get("height", item.get("h", 0)))
        except (TypeError, ValueError):
            continue
        if w <= 0 or h <= 0:
            continue
        out.append(
            {
                "x": max(0.0, min(1.0, x)),
                "y": max(0.0, min(1.0, y)),
                "width": max(0.0, min(1.0, w)),
                "height": max(0.0, min(1.0, h)),
            }
        )
    return out
