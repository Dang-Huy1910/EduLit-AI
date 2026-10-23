"""Teacher assignment instances: draft, publish snapshot, student visibility."""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload


from app.core.errors import DomainError, ERROR_MESSAGES
from app.core.http import utcnow
from app.config import get_settings
from app.db.models import (
    Assignment,
    AssignmentAccess,
    AssignmentRevision,
    ClassMembership,
    Classroom,
    SourcePrompt,
    Term,
    User,
    UserRole,
    UserStatus,
)
import app.services.outline_prep as outline_prep_service
from app.services.catalog_errors import CatalogError
from app.services.catalog_service import (
    CatalogService,
    _optional_uuid,
    _require_teacher,
    _text,
    unique_chunk_id,
)
from app.services.classroom_rules import classroom_read_only, grant_access
from app.services.rubric import assignment_rubric_document, validate_rubric_payload

CODE_RE = __import__("re").compile(r"^[A-Z0-9-]{4,32}$")
WHOLE_CLASS_SENTINEL = "*"


def _recipient_ids_from_body(body: dict[str, Any]) -> list[str]:
    if body.get("assignToWholeClass") is True:
        return [WHOLE_CLASS_SENTINEL]
    return _uuid_list(body.get("recipientStudentIds"))


def _is_whole_class(recipient_student_ids: list | None) -> bool:
    raw = list(recipient_student_ids or [])
    return len(raw) == 1 and str(raw[0]) == WHOLE_CLASS_SENTINEL


def _parse_due_at(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value
    raw = str(value).strip()
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise CatalogError(400, "VALIDATION", "Hạn nộp phải là ngày giờ ISO.", {"dueAt": "Không hợp lệ."}) from exc
    if parsed.tzinfo is None:
        from datetime import timezone

        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _uuid_list(values: Any) -> list[str]:
    if values is None:
        return []
    if not isinstance(values, list):
        raise CatalogError(400, "VALIDATION", ERROR_MESSAGES["VALIDATION"], {"recipientStudentIds": "Phải là danh sách."})
    out: list[str] = []
    seen: set[str] = set()
    for item in values:
        try:
            uid = str(uuid.UUID(str(item)))
        except (TypeError, ValueError) as exc:
            raise CatalogError(
                400, "VALIDATION", ERROR_MESSAGES["VALIDATION"], {"recipientStudentIds": "ID không hợp lệ."}
            ) from exc
        if uid not in seen:
            seen.add(uid)
            out.append(uid)
    return out


class AssignmentService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.catalog = CatalogService(session)

    async def _owned_assignment(self, teacher: User, assignment_id: uuid.UUID) -> Assignment:
        assignment = await self.session.get(Assignment, assignment_id)
        if assignment is None or assignment.teacher_id != teacher.id or assignment.status == "DELETED":
            raise CatalogError(404, "NOT_FOUND", "Không tìm thấy bài tập.")
        return assignment

    async def _ensure_classroom_writable(
        self, teacher: User, classroom_id: uuid.UUID
    ) -> Classroom:
        classroom = await self.catalog._owned_classroom(teacher, classroom_id)
        await self.session.refresh(classroom, ["term"])
        if classroom_read_only(classroom):
            raise CatalogError(
                409,
                "CLASSROOM_READ_ONLY",
                ERROR_MESSAGES["CLASSROOM_READ_ONLY"],
            )
        return classroom

    async def _next_code(self) -> str:
        for _ in range(12):
            code = f"EDU-{secrets.token_hex(4).upper()}"
            exists = await self.session.execute(select(Assignment.id).where(Assignment.code == code))
            if exists.scalar_one_or_none() is None:
                rev = await self.session.execute(
                    select(AssignmentRevision.id).where(AssignmentRevision.code == code)
                )
                if rev.scalar_one_or_none() is None:
                    return code
        raise CatalogError(500, "ASSIGNMENT_CODE", "Không cấp được mã bài tập.")

    def _normalize_code(self, value: Any) -> str | None:
        if value in (None, ""):
            return None
        code = str(value).strip().upper()
        if not CODE_RE.match(code):
            raise CatalogError(
                400,
                "ASSIGNMENT_CODE",
                "Mã bài tập gồm 4–32 ký tự chữ in hoa, số hoặc gạch ngang.",
                {"code": "Không hợp lệ."},
            )
        return code

    async def list_teacher_assignments(self, teacher: User) -> list[dict[str, Any]]:
        _require_teacher(teacher)
        result = await self.session.execute(
            select(Assignment)
            .where(Assignment.teacher_id == teacher.id, Assignment.status != "DELETED")
            .order_by(Assignment.updated_at.desc())
        )
        rows = list(result.scalars().all())
        revision_ids = [row.published_revision_id for row in rows if row.published_revision_id]
        counts = await outline_prep_service.counts_for_revisions(self.session, revision_ids)
        from app.services.stats_engine import StatsEngine, empty_progress

        progress = await StatsEngine(self.session).submission_progress_for_revisions(revision_ids)
        return [
            await self._teacher_dict(
                row,
                outline_prep=counts.get(row.published_revision_id)
                if row.published_revision_id
                else outline_prep_service.empty_prep_counts(),
                submission_progress=progress.get(row.published_revision_id)
                if row.published_revision_id
                else empty_progress(),
            )
            for row in rows
        ]

    async def get_teacher_assignment(self, teacher: User, assignment_id: uuid.UUID) -> dict[str, Any]:
        _require_teacher(teacher)
        assignment = await self._owned_assignment(teacher, assignment_id)
        return await self._teacher_dict(assignment, full=True)

    async def delete_assignment(self, teacher: User, assignment_id: uuid.UUID) -> None:
        _require_teacher(teacher)
        result = await self.session.execute(
            select(Assignment)
            .where(Assignment.id == assignment_id, Assignment.teacher_id == teacher.id)
            .with_for_update()
        )
        assignment = result.scalar_one_or_none()
        if assignment is None:
            raise CatalogError(404, "NOT_FOUND", "Không tìm thấy bài tập.")
        now = utcnow()
        assignment.status = "DELETED"
        assignment.updated_at = now
        revision_ids = select(AssignmentRevision.id).where(AssignmentRevision.assignment_id == assignment.id)
        await self.session.execute(
            update(AssignmentAccess)
            .where(AssignmentAccess.assignment_revision_id.in_(revision_ids), AssignmentAccess.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        await self.session.execute(
            update(AssignmentRevision)
            .where(AssignmentRevision.assignment_id == assignment.id)
            .values(status="DELETED", updated_at=now)
        )
        await self.session.commit()

    async def create_draft(self, teacher: User, body: dict[str, Any]) -> dict[str, Any]:
        _require_teacher(teacher)
        prompt_id = _optional_uuid(body.get("sourcePromptId") or body.get("promptId"))
        if prompt_id is None:
            raise CatalogError(400, "PROMPT_REQUIRED", ERROR_MESSAGES["PROMPT_REQUIRED"])
        prompt = await self.catalog._owned_prompt(teacher, prompt_id)
        prompt_payload = await self.catalog._prompt_dict(prompt, full=True)
        if not prompt_payload["ready"]:
            raise CatalogError(
                400,
                "PROMPT_INCOMPLETE",
                "Đề nguồn chưa đủ yêu cầu viết và ngữ liệu.",
                {"missing": ", ".join(prompt_payload["missing"])},
            )

        classroom = None
        classroom_id = _optional_uuid(body.get("classroomId"))
        if classroom_id:
            classroom = await self._ensure_classroom_writable(teacher, classroom_id)

        rubric_doc, rubric_id, rubric_version_id = await self._resolve_assignment_rubric(teacher, body)
        code = self._normalize_code(body.get("code")) or await self._next_code()
        title = _text(body.get("title") or prompt.title, "title")
        assignment = Assignment(
            teacher_id=teacher.id,
            classroom_id=classroom.id if classroom else None,
            source_prompt_id=prompt.id,
            rubric_id=rubric_id,
            rubric_version_id=rubric_version_id,
            title=title,
            extra_instructions=_text(body.get("extraInstructions"), "extraInstructions", required=False, max_len=8000),
            assignment_rubric=rubric_doc,
            max_score=rubric_doc["maxScore"],
            score_step=rubric_doc["scoreStep"],
            due_at=_parse_due_at(body.get("dueAt")),
            code=code,
            status="DRAFT",
            recipient_student_ids=_recipient_ids_from_body(body),
            updated_at=utcnow(),
        )
        self.session.add(assignment)
        try:
            await self.session.commit()
        except IntegrityError as exc:
            await self.session.rollback()
            raise CatalogError(409, "ASSIGNMENT_CODE", "Mã bài tập đã tồn tại.") from exc
        return await self.get_teacher_assignment(teacher, assignment.id)

    async def update_draft(
        self, teacher: User, assignment_id: uuid.UUID, body: dict[str, Any]
    ) -> dict[str, Any]:
        _require_teacher(teacher)
        assignment = await self._owned_assignment(teacher, assignment_id)
        if assignment.status != "DRAFT":
            raise CatalogError(409, "ASSIGNMENT_STATUS", "Chỉ sửa được bài tập đang ở bản nháp.")

        if "classroomId" not in body and assignment.classroom_id:
            await self._ensure_classroom_writable(teacher, assignment.classroom_id)

        if "sourcePromptId" in body or "promptId" in body:
            prompt_id = _optional_uuid(body.get("sourcePromptId") or body.get("promptId"))
            if prompt_id is None:
                raise CatalogError(400, "PROMPT_REQUIRED", ERROR_MESSAGES["PROMPT_REQUIRED"])
            prompt = await self.catalog._owned_prompt(teacher, prompt_id)
            payload = await self.catalog._prompt_dict(prompt, full=True)
            if not payload["ready"]:
                raise CatalogError(400, "PROMPT_INCOMPLETE", "Đề nguồn chưa đủ dữ liệu để dùng.")
            assignment.source_prompt_id = prompt.id

        if "title" in body:
            assignment.title = _text(body.get("title"), "title")
        if "extraInstructions" in body:
            assignment.extra_instructions = _text(
                body.get("extraInstructions"), "extraInstructions", required=False, max_len=8000
            )
        if "dueAt" in body:
            assignment.due_at = _parse_due_at(body.get("dueAt"))
        if "classroomId" in body:
            classroom_id = _optional_uuid(body.get("classroomId"))
            classroom = (
                await self._ensure_classroom_writable(teacher, classroom_id)
                if classroom_id
                else None
            )
            assignment.classroom_id = classroom.id if classroom else None
        if "assignToWholeClass" in body or "recipientStudentIds" in body:
            assignment.recipient_student_ids = _recipient_ids_from_body(body)
        if "code" in body and body.get("code"):
            assignment.code = self._normalize_code(body.get("code")) or assignment.code

        if any(k in body for k in ("rubricId", "assignmentRubric", "criteria", "maxScore", "scoreStep", "title")):
            if "assignmentRubric" in body or "criteria" in body:
                try:
                    rubric_doc = validate_rubric_payload(body.get("assignmentRubric") or body)
                except DomainError as exc:
                    raise CatalogError(400, exc.code, exc.message) from exc
                assignment.assignment_rubric = rubric_doc
                assignment.max_score = rubric_doc["maxScore"]
                assignment.score_step = rubric_doc["scoreStep"]
            elif "rubricId" in body:
                rubric_doc, rubric_id, rubric_version_id = await self._resolve_assignment_rubric(teacher, body)
                assignment.assignment_rubric = rubric_doc
                assignment.rubric_id = rubric_id
                assignment.rubric_version_id = rubric_version_id
                assignment.max_score = rubric_doc["maxScore"]
                assignment.score_step = rubric_doc["scoreStep"]

        assignment.updated_at = utcnow()
        try:
            await self.session.commit()
        except IntegrityError as exc:
            await self.session.rollback()
            raise CatalogError(409, "ASSIGNMENT_CODE", "Mã bài tập đã tồn tại.") from exc
        return await self.get_teacher_assignment(teacher, assignment.id)

    async def update_published_settings(
        self, teacher: User, assignment_id: uuid.UUID, body: dict[str, Any]
    ) -> dict[str, Any]:
        """Edit the safe settings of a published assignment.

        Only fields that do not invalidate submitted work or prepared outlines:
        title, extra instructions, due date, and adding recipients. The prompt,
        materials and rubric stay frozen in the published revision.
        """
        _require_teacher(teacher)
        assignment = await self._owned_assignment(teacher, assignment_id)
        if assignment.status != "PUBLISHED" or not assignment.published_revision_id:
            raise CatalogError(409, "ASSIGNMENT_STATUS", "Chỉ chỉnh được cấu hình của bài tập đã giao.")
        if assignment.classroom_id:
            await self._ensure_classroom_writable(teacher, assignment.classroom_id)
        revision = await self.session.get(AssignmentRevision, assignment.published_revision_id)
        if revision is None:
            raise CatalogError(409, "ASSIGNMENT_STATUS", "Không tìm thấy bản đã giao của bài tập.")
        snapshot = dict(revision.snapshot or {})
        instructions = dict(revision.instructions or {})

        if "title" in body:
            title = _text(body.get("title"), "title")
            assignment.title = title
            revision.title = title
            snapshot["title"] = title
            instructions["topic"] = title
        if "extraInstructions" in body:
            extra = _text(body.get("extraInstructions"), "extraInstructions", required=False, max_len=8000)
            assignment.extra_instructions = extra
            snapshot["extraInstructions"] = extra
            instructions["extra_instructions"] = extra
        if "dueAt" in body:
            due_at = _parse_due_at(body.get("dueAt"))
            assignment.due_at = due_at
            revision.due_at = due_at
            snapshot["dueAt"] = due_at.isoformat() if due_at else None

        if "assignToWholeClass" in body or "recipientStudentIds" in body:
            previous = list(assignment.recipient_student_ids or [])
            requested = _recipient_ids_from_body(body)
            if not _is_whole_class(requested):
                if _is_whole_class(previous) or not set(previous) <= set(requested):
                    raise CatalogError(
                        409,
                        "RECIPIENT_REMOVAL",
                        "Bài đã giao chỉ có thể thêm học sinh, không bớt học sinh đã nhận bài.",
                    )
            assignment.recipient_student_ids = requested
            recipients = await self._resolve_recipients(teacher, assignment)
            await grant_access(self.session, revision.id, recipients)
            await outline_prep_service.enqueue_for_students(
                self.session,
                revision_id=revision.id,
                student_ids=recipients,
                max_attempts=get_settings().OUTLINE_PREP_MAX_ATTEMPTS,
            )

        revision.snapshot = snapshot
        revision.instructions = instructions
        assignment.updated_at = utcnow()
        await self.session.commit()
        return await self.get_teacher_assignment(teacher, assignment.id)

    async def publish(self, teacher: User, assignment_id: uuid.UUID) -> dict[str, Any]:
        _require_teacher(teacher)
        result = await self.session.execute(
            select(Assignment).where(Assignment.id == assignment_id).with_for_update()
        )
        assignment = result.scalar_one_or_none()
        if assignment is None or assignment.teacher_id != teacher.id or assignment.status == "DELETED":
            raise CatalogError(404, "NOT_FOUND", "Không tìm thấy bài tập.")

        if assignment.status == "PUBLISHED" and assignment.published_revision_id:
            return await self._teacher_dict(assignment, full=True)

        if assignment.status not in {"DRAFT", "PUBLISHED"}:
            raise CatalogError(409, "ASSIGNMENT_STATUS", "Không thể phát hành bài tập ở trạng thái này.")

        if assignment.classroom_id:
            await self._ensure_classroom_writable(teacher, assignment.classroom_id)

        prompt = await self.catalog._owned_prompt(teacher, assignment.source_prompt_id)
        prompt_payload = await self.catalog._prompt_dict(prompt, full=True)
        if not prompt_payload["ready"]:
            raise CatalogError(400, "PROMPT_INCOMPLETE", "Đề nguồn chưa đủ yêu cầu viết và ngữ liệu.")

        try:
            rubric_doc = assignment_rubric_document(assignment.assignment_rubric or {})
        except DomainError as exc:
            raise CatalogError(400, exc.code, exc.message) from exc

        recipients = await self._resolve_recipients(teacher, assignment)
        if not recipients:
            raise CatalogError(400, "NEED_RECIPIENTS", ERROR_MESSAGES["NEED_RECIPIENTS"])

        chunks = self._snapshot_chunks(prompt_payload)
        if not chunks:
            raise CatalogError(400, "PROMPT_INCOMPLETE", "Đề nguồn chưa có ngữ liệu sẵn sàng.")

        snapshot = {
            "assignmentId": str(assignment.id),
            "sourcePromptId": str(prompt.id),
            "title": assignment.title,
            "writingTask": prompt.writing_task,
            "writingTaskSummary": prompt.writing_task_summary,
            "extraInstructions": assignment.extra_instructions,
            "genre": prompt.genre,
            "gradeLevel": prompt.grade_level,
            "materials": [
                {
                    "id": item["id"],
                    "title": item["title"],
                    "author": item.get("author") or "",
                    "sourceInfo": item.get("sourceInfo") or "",
                    "content": item.get("content") or "",
                    "sourceNotes": item.get("sourceNotes") or [],
                    "chunks": item.get("chunks") or [],
                }
                for item in prompt_payload["materials"]
            ],
            "rubric": rubric_doc,
            "dueAt": assignment.due_at.isoformat() if assignment.due_at else None,
        }
        instructions = {
            "topic": assignment.title,
            "genre": "Nghị luận văn học" if prompt.genre == "NLVH" else "Nghị luận xã hội",
            "writing_task": prompt.writing_task,
            "writing_task_summary": prompt.writing_task_summary,
            "extra_instructions": assignment.extra_instructions,
            "requirements": [line.strip() for line in prompt.writing_task.splitlines() if line.strip()][:12],
        }

        revision = AssignmentRevision(
            assignment_id=assignment.id,
            code=assignment.code,
            title=assignment.title,
            instructions=instructions,
            genre=prompt.genre,
            rubric={
                "title": rubric_doc["title"],
                "maxScore": rubric_doc["maxScore"],
                "scoreStep": rubric_doc["scoreStep"],
                "criteria": rubric_doc["criteria"],
            },
            context_chunks=chunks,
            status="PUBLISHED",
            readiness_policy={"requiredContentKeys": ["thesis", "sections"], "minSections": 1},
            snapshot=snapshot,
            due_at=assignment.due_at,
        )
        self.session.add(revision)
        await self.session.flush()

        await grant_access(self.session, revision.id, recipients)

        await outline_prep_service.enqueue_for_students(
            self.session,
            revision_id=revision.id,
            student_ids=recipients,
            max_attempts=get_settings().OUTLINE_PREP_MAX_ATTEMPTS,
        )

        assignment.status = "PUBLISHED"
        assignment.published_revision_id = revision.id
        assignment.published_at = utcnow()
        assignment.assignment_rubric = rubric_doc
        assignment.updated_at = utcnow()
        await self.session.commit()
        return await self._teacher_dict(assignment, full=True)

    async def save_assignment_rubric_as_catalog(
        self, teacher: User, assignment_id: uuid.UUID, body: dict[str, Any]
    ) -> dict[str, Any]:
        _require_teacher(teacher)
        assignment = await self._owned_assignment(teacher, assignment_id)
        payload = body.get("assignmentRubric") or assignment.assignment_rubric
        if body.get("title"):
            payload = {**payload, "title": body["title"]}
        return await self.catalog.create_rubric(teacher, payload)

    async def list_student_assignments(self, student: User) -> list[dict[str, Any]]:
        if student.role != UserRole.STUDENT:
            raise CatalogError(403, "STUDENT_REQUIRED", ERROR_MESSAGES["STUDENT_REQUIRED"])
        result = await self.session.execute(
            select(AssignmentAccess, AssignmentRevision, Classroom)
            .join(AssignmentRevision, AssignmentAccess.assignment_revision_id == AssignmentRevision.id)
            .outerjoin(Assignment, AssignmentRevision.assignment_id == Assignment.id)
            .outerjoin(Classroom, Assignment.classroom_id == Classroom.id)
            .outerjoin(Term, Classroom.term_id == Term.id)
            .options(selectinload(Classroom.term))
            .where(
                AssignmentAccess.student_id == student.id,
                AssignmentAccess.revoked_at.is_(None),
                AssignmentRevision.status == "PUBLISHED",
            )
            .order_by(AssignmentRevision.created_at.desc())
        )
        items = []
        seen_codes: set[str] = set()
        for access, revision, classroom in result.all():
            if revision.code in seen_codes:
                continue
            seen_codes.add(revision.code)
            items.append(self._student_dict(revision, student_id=student.id, classroom=classroom))
        return items

    async def get_student_assignment(self, student: User, assignment_key: str) -> dict[str, Any]:
        if student.role != UserRole.STUDENT:
            raise CatalogError(403, "STUDENT_REQUIRED", ERROR_MESSAGES["STUDENT_REQUIRED"])
        revision = await self._find_published_revision(assignment_key)
        if revision is None or revision.status != "PUBLISHED":
            raise CatalogError(404, "NOT_FOUND", "Không tìm thấy bài tập.")
        access = await self.session.execute(
            select(AssignmentAccess).where(
                AssignmentAccess.assignment_revision_id == revision.id,
                AssignmentAccess.student_id == student.id,
                AssignmentAccess.revoked_at.is_(None),
            )
        )
        if access.scalar_one_or_none() is None:
            raise CatalogError(403, "ACCESS_DENIED", "Em chưa được giao bài tập này.")
        row = await self.session.execute(
            select(AssignmentRevision, Classroom)
            .outerjoin(Assignment, AssignmentRevision.assignment_id == Assignment.id)
            .outerjoin(Classroom, Assignment.classroom_id == Classroom.id)
            .outerjoin(Term, Classroom.term_id == Term.id)
            .options(selectinload(Classroom.term))
            .where(AssignmentRevision.id == revision.id)
        )
        revision, classroom = row.one()
        return self._student_dict(revision, student_id=student.id, full=True, classroom=classroom)

    async def get_public_teacher_or_student(
        self, user: User, assignment_key: str
    ) -> dict[str, Any]:
        if user.role == UserRole.TEACHER:
            try:
                assignment_id = uuid.UUID(assignment_key)
            except ValueError:
                result = await self.session.execute(
                    select(Assignment).where(
                        Assignment.code == assignment_key.upper(),
                        Assignment.teacher_id == user.id,
                        Assignment.status != "DELETED",
                    )
                )
                assignment = result.scalar_one_or_none()
                if assignment is None:
                    raise CatalogError(404, "NOT_FOUND", "Không tìm thấy bài tập.")
                return await self._teacher_dict(assignment, full=True)
            return await self.get_teacher_assignment(user, assignment_id)
        return await self.get_student_assignment(user, assignment_key)

    async def _find_published_revision(self, assignment_key: str) -> AssignmentRevision | None:
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

    async def _resolve_assignment_rubric(
        self, teacher: User, body: dict[str, Any]
    ) -> tuple[dict[str, Any], uuid.UUID | None, uuid.UUID | None]:
        if body.get("assignmentRubric"):
            try:
                doc = validate_rubric_payload(body["assignmentRubric"])
            except DomainError as exc:
                raise CatalogError(400, exc.code, exc.message) from exc
            return doc, _optional_uuid(body.get("rubricId")), _optional_uuid(body.get("rubricVersionId"))

        rubric_id = _optional_uuid(body.get("rubricId"))
        if rubric_id is None:
            raise CatalogError(400, "VALIDATION", "Cần chọn barem cho bài tập.", {"rubricId": "Bắt buộc."})
        rubric_payload = await self.catalog.get_rubric(teacher, rubric_id)
        try:
            doc = validate_rubric_payload(
                {
                    "title": rubric_payload["title"],
                    "shortTitle": rubric_payload.get("shortTitle"),
                    "description": rubric_payload.get("description") or "",
                    "version": str(rubric_payload.get("version") or "v1"),
                    "gradeLevel": body.get("gradeLevel")
                    or rubric_payload.get("gradeLevel")
                    or 11,
                    "maxScore": rubric_payload["maxScore"],
                    "scoreStep": rubric_payload["scoreStep"],
                    "criteria": rubric_payload["criteria"],
                }
            )
        except DomainError as exc:
            raise CatalogError(400, exc.code, exc.message) from exc
        return doc, rubric_id, _optional_uuid(rubric_payload.get("rubricVersionId"))

    async def _teacher_scope_student_ids(self, teacher: User) -> set[uuid.UUID]:
        result = await self.session.execute(
            select(ClassMembership.user_id)
            .join(Classroom, ClassMembership.classroom_id == Classroom.id)
            .where(
                Classroom.owner_teacher_id == teacher.id,
                ClassMembership.membership_role == "STUDENT",
                ClassMembership.status == "ACTIVE",
            )
        )
        return set(result.scalars().all())

    async def _classroom_student_ids(self, teacher: User, classroom_id: uuid.UUID) -> set[uuid.UUID]:
        classroom = await self.session.get(Classroom, classroom_id)
        if classroom is None or classroom.owner_teacher_id != teacher.id:
            raise CatalogError(403, "ACCESS_DENIED", ERROR_MESSAGES["ACCESS_DENIED"])
        result = await self.session.execute(
            select(ClassMembership).where(
                ClassMembership.classroom_id == classroom_id,
                ClassMembership.membership_role == "STUDENT",
                ClassMembership.status == "ACTIVE",
            )
        )
        return {row.user_id for row in result.scalars().all()}

    async def _validate_student_recipient(self, student_id: uuid.UUID) -> User:
        user = await self.session.get(User, student_id)
        if user is None or user.role != UserRole.STUDENT or user.status != UserStatus.ACTIVE:
            raise CatalogError(400, "NEED_RECIPIENTS", "Người nhận không hợp lệ.")
        return user

    async def _resolve_recipients(self, teacher: User, assignment: Assignment) -> list[uuid.UUID]:
        classroom_student_ids: set[uuid.UUID] = set()
        if assignment.classroom_id:
            classroom_student_ids = await self._classroom_student_ids(teacher, assignment.classroom_id)

        if _is_whole_class(assignment.recipient_student_ids):
            if not assignment.classroom_id:
                raise CatalogError(400, "NEED_RECIPIENTS", ERROR_MESSAGES["NEED_RECIPIENTS"])
            return sorted(classroom_student_ids)

        requested = [uuid.UUID(item) for item in (assignment.recipient_student_ids or [])]
        if not requested:
            raise CatalogError(400, "NEED_RECIPIENTS", ERROR_MESSAGES["NEED_RECIPIENTS"])

        allowed = classroom_student_ids if assignment.classroom_id else await self._teacher_scope_student_ids(teacher)
        recipients: list[uuid.UUID] = []
        seen: set[uuid.UUID] = set()
        for student_id in requested:
            if student_id in seen:
                continue
            if student_id not in allowed:
                if assignment.classroom_id:
                    raise CatalogError(
                        400,
                        "NEED_RECIPIENTS",
                        "Học sinh được chọn phải thuộc lớp nhận bài.",
                    )
                raise CatalogError(
                    400,
                    "NEED_RECIPIENTS",
                    "Học sinh được chọn phải thuộc phạm vi lớp của giáo viên.",
                )
            await self._validate_student_recipient(student_id)
            seen.add(student_id)
            recipients.append(student_id)
        return recipients

    def _snapshot_chunks(self, prompt_payload: dict[str, Any]) -> list[dict[str, Any]]:
        chunks: list[dict[str, Any]] = []
        seen: set[str] = set()
        for material in prompt_payload.get("materials") or []:
            material_id = str(material.get("id") or "")
            rewritten: list[dict[str, Any]] = []
            material_chunks = material.get("chunks") or []
            if material_chunks:
                for chunk in material_chunks:
                    raw_id = str(chunk.get("chunkId") or chunk.get("chunk_id") or "")
                    chunk_id = unique_chunk_id(material_id, raw_id)
                    if not chunk_id or chunk_id in seen:
                        continue
                    seen.add(chunk_id)
                    entry = {
                        "chunkId": chunk_id,
                        "chunk_id": chunk_id,
                        "title": chunk.get("title") or material.get("title") or "",
                        "text": chunk.get("text") or "",
                        "sortOrder": chunk.get("sortOrder") or chunk.get("sort_order"),
                    }
                    rewritten.append(entry)
                    chunks.append(
                        {
                            "chunk_id": chunk_id,
                            "title": entry["title"],
                            "text": entry["text"],
                        }
                    )
            elif material.get("content"):
                chunk_id = unique_chunk_id(material_id, "chunk-1")
                if chunk_id not in seen:
                    seen.add(chunk_id)
                    rewritten.append(
                        {
                            "chunkId": chunk_id,
                            "chunk_id": chunk_id,
                            "title": material.get("title") or "",
                            "text": material.get("content") or "",
                        }
                    )
                    chunks.append(
                        {
                            "chunk_id": chunk_id,
                            "title": material.get("title") or "",
                            "text": material.get("content") or "",
                        }
                    )
            material["chunks"] = rewritten
        return chunks

    async def retry_failed_outline_preps(self, teacher: User, assignment_id: uuid.UUID) -> dict[str, Any]:
        _require_teacher(teacher)
        assignment = await self._owned_assignment(teacher, assignment_id)
        if not assignment.published_revision_id:
            raise CatalogError(409, "ASSIGNMENT_STATUS", "Bài tập chưa được giao nên chưa có dàn ý để thử lại.")
        retried = await outline_prep_service.requeue_failed_for_revision(
            self.session,
            revision_id=assignment.published_revision_id,
            max_attempts=get_settings().OUTLINE_PREP_MAX_ATTEMPTS,
        )
        await self.session.commit()
        payload = await self._teacher_dict(assignment, full=True)
        payload["retried"] = retried
        return payload

    async def _teacher_dict(
        self,
        assignment: Assignment,
        *,
        full: bool = False,
        outline_prep: dict[str, int] | None = None,
        submission_progress: dict[str, int] | None = None,
    ) -> dict[str, Any]:
        classroom = None
        if assignment.classroom_id:
            classroom = (
                await self.session.execute(
                    select(Classroom)
                    .options(selectinload(Classroom.term))
                    .where(Classroom.id == assignment.classroom_id)
                )
            ).scalar_one_or_none()
        prompt = await self.session.get(SourcePrompt, assignment.source_prompt_id)
        prompt_payload = None
        if full and prompt:
            prompt_payload = await self.catalog._prompt_dict(prompt, full=True)
        whole_class = _is_whole_class(assignment.recipient_student_ids)
        stored_recipients = [] if whole_class else list(assignment.recipient_student_ids or [])
        recipient_count = 0 if whole_class else len(stored_recipients)
        if assignment.published_revision_id:
            access_count = await self.session.execute(
                select(AssignmentAccess.id).where(
                    AssignmentAccess.assignment_revision_id == assignment.published_revision_id,
                    AssignmentAccess.revoked_at.is_(None),
                )
            )
            recipient_count = len(access_count.all()) or recipient_count
        payload: dict[str, Any] = {
            "id": str(assignment.id),
            "code": assignment.code,
            "title": assignment.title,
            "extraInstructions": assignment.extra_instructions,
            "status": assignment.status,
            "dueAt": assignment.due_at.isoformat() if assignment.due_at else None,
            "publishedAt": assignment.published_at.isoformat() if assignment.published_at else None,
            "classroomId": str(assignment.classroom_id) if assignment.classroom_id else None,
            "classroomName": classroom.name if classroom else None,
            "classroomCode": classroom.code if classroom else None,
            "termId": str(classroom.term_id) if classroom else None,
            "classroomReadOnly": False,
            "sourcePromptId": str(assignment.source_prompt_id),
            "sourcePromptTitle": prompt.title if prompt else None,
            "rubricId": str(assignment.rubric_id) if assignment.rubric_id else None,
            "maxScore": float(assignment.max_score),
            "scoreStep": float(assignment.score_step),
            "recipientCount": recipient_count,
            "publishedRevisionId": str(assignment.published_revision_id)
            if assignment.published_revision_id
            else None,
            "updatedAt": assignment.updated_at.isoformat() if assignment.updated_at else None,
        }
        if classroom is not None:
            payload["classroomReadOnly"] = classroom_read_only(classroom)
        if outline_prep is None and assignment.published_revision_id:
            outline_prep = await outline_prep_service.counts_for_revision(
                self.session, assignment.published_revision_id
            )
        payload["outlinePrep"] = outline_prep or outline_prep_service.empty_prep_counts()
        if submission_progress is None and assignment.published_revision_id:
            from app.services.stats_engine import StatsEngine

            progress_map = await StatsEngine(self.session).submission_progress_for_revisions(
                [assignment.published_revision_id]
            )
            submission_progress = progress_map.get(assignment.published_revision_id)
        from app.services.stats_engine import empty_progress

        payload["submissionProgress"] = submission_progress or empty_progress()
        if full:
            payload["assignmentRubric"] = assignment.assignment_rubric
            payload["assignToWholeClass"] = whole_class
            payload["recipientStudentIds"] = stored_recipients
            payload["sourcePrompt"] = prompt_payload
            if assignment.published_revision_id:
                revision = await self.session.get(AssignmentRevision, assignment.published_revision_id)
                snapshot = (revision.snapshot if revision else None) or {}
                payload["publishedSnapshot"] = snapshot
                payload["publishedWritingTask"] = snapshot.get("writingTask") or ""
                payload["publishedExtraInstructions"] = snapshot.get("extraInstructions") or assignment.extra_instructions
                payload["publishedMaterials"] = snapshot.get("materials") or []
        return payload

    def _student_dict(
        self,
        revision: AssignmentRevision,
        *,
        student_id: uuid.UUID,
        full: bool = False,
        classroom: Classroom | None = None,
    ) -> dict[str, Any]:
        snapshot = revision.snapshot or {}
        instructions = revision.instructions or {}
        writing_task = snapshot.get("writingTask") or instructions.get("writing_task") or ""
        extra = snapshot.get("extraInstructions") or instructions.get("extra_instructions") or ""
        materials = snapshot.get("materials") or []
        if not materials and revision.context_chunks:
            materials = [
                {
                    "id": chunk.get("chunk_id"),
                    "title": chunk.get("title") or revision.title,
                    "author": "",
                    "sourceInfo": "",
                    "content": chunk.get("text") or "",
                    "sourceNotes": [],
                    "chunks": [
                        {
                            "chunkId": chunk.get("chunk_id"),
                            "title": chunk.get("title") or "",
                            "text": chunk.get("text") or "",
                        }
                    ],
                }
                for chunk in revision.context_chunks
            ]
        rubric = snapshot.get("rubric") or revision.rubric or {}
        payload: dict[str, Any] = {
            "id": str(revision.assignment_id or revision.id),
            "revisionId": str(revision.id),
            "code": revision.code,
            "title": revision.title,
            "genre": revision.genre,
            "status": "published",
            "dueAt": (revision.due_at.isoformat() if revision.due_at else snapshot.get("dueAt")),
            "writingTask": writing_task,
            "writingTaskSummary": snapshot.get("writingTaskSummary")
            or instructions.get("writing_task_summary")
            or "",
            "extraInstructions": extra,
            "instructions": writing_task or extra or instructions.get("topic") or revision.title,
            "classroomId": str(classroom.id) if classroom else None,
            "classroomCode": classroom.code if classroom else None,
            "classroomName": classroom.name if classroom else None,
            "termId": str(classroom.term_id) if classroom else None,
            "classroomReadOnly": False,
        }
        if classroom is not None:
            payload["classroomReadOnly"] = classroom_read_only(classroom)
        if full:
            payload["materials"] = materials
            payload["rubric"] = rubric
            payload["contextChunks"] = revision.context_chunks
        return payload
