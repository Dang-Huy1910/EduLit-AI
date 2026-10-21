"""Kỳ học, lớp môn và tham gia lớp bằng mã."""

from __future__ import annotations

import re
import uuid
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.core.errors import ERROR_MESSAGES
from app.core.http import utcnow
from app.db.models import (
    Assignment,
    AssignmentAccess,
    ClassMembership,
    Classroom,
    Term,
    User,
    UserRole,
)
from app.identity.rate_limit import hit_rate_limit
import app.services.outline_prep as outline_prep_service
from app.services.assignment_service import _is_whole_class
from app.services.catalog_errors import CatalogError
from app.services.catalog_service import _grade, _require_teacher
from app.services.classroom_rules import (
    JOIN_CODE_ALPHABET,
    JOIN_CODE_LENGTH,
    SCHOOL_TZ,
    classroom_read_only,
    generate_join_code,
    grant_access,
    school_today,
    term_status,
)

CLASSROOM_READ_ONLY_MESSAGE = "Lớp thuộc kỳ học đã kết thúc nên chỉ xem được."

_CLASSROOM_CODE_RE = re.compile(r"^[0-9A-Z.\-]+$")


def normalize_join_code(raw: Any) -> str:
    if not isinstance(raw, str):
        raise CatalogError(404, "JOIN_CODE_INVALID", "Mã lớp không đúng.")
    code = re.sub(r"[\s-]+", "", raw.strip().upper())
    if len(code) != JOIN_CODE_LENGTH or any(char not in JOIN_CODE_ALPHABET for char in code):
        raise CatalogError(404, "JOIN_CODE_INVALID", "Mã lớp không đúng.")
    return code


class ClassroomService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_terms(self) -> list[dict[str, Any]]:
        terms = (
            await self.session.execute(select(Term).order_by(Term.starts_on))
        ).scalars().all()
        today = school_today()
        statuses = {term.id: term_status(term, today) for term in terms}
        has_active = any(value == "ACTIVE" for value in statuses.values())
        next_upcoming = next(
            (term.id for term in terms if statuses[term.id] == "UPCOMING"),
            None,
        )
        return [
            {
                "id": str(term.id),
                "code": term.code,
                "name": term.name,
                "academicYear": term.academic_year,
                "startsOn": term.starts_on.isoformat(),
                "endsOn": term.ends_on.isoformat(),
                "status": statuses[term.id],
                "isCurrent": statuses[term.id] == "ACTIVE" or (
                    not has_active and term.id == next_upcoming
                ),
            }
            for term in terms
        ]

    async def list_teacher_classrooms(
        self,
        teacher: User,
        *,
        term_id: uuid.UUID | None = None,
        include_archived: bool = False,
    ) -> list[dict[str, Any]]:
        _require_teacher(teacher)
        stmt = (
            select(Classroom)
            .join(Term, Classroom.term_id == Term.id)
            .options(selectinload(Classroom.term), selectinload(Classroom.memberships))
            .where(Classroom.owner_teacher_id == teacher.id)
        )
        if term_id is not None:
            stmt = stmt.where(Classroom.term_id == term_id)
        if not include_archived:
            stmt = stmt.where(Classroom.archived_at.is_(None))
        classrooms = (
            await self.session.execute(stmt.order_by(Term.starts_on.desc(), Classroom.code))
        ).scalars().unique().all()
        return [
            self._summary(
                classroom,
                sum(
                    1
                    for member in classroom.memberships
                    if member.membership_role == "STUDENT" and member.status == "ACTIVE"
                ),
            )
            for classroom in classrooms
        ]

    async def get_teacher_classroom(
        self, teacher: User, classroom_id: uuid.UUID
    ) -> dict[str, Any]:
        _require_teacher(teacher)
        classroom = await self._owned_classroom(teacher, classroom_id)
        memberships = (
            await self.session.execute(
                select(ClassMembership)
                .options(selectinload(ClassMembership.user))
                .where(
                    ClassMembership.classroom_id == classroom.id,
                    ClassMembership.status == "ACTIVE",
                )
                .order_by(ClassMembership.created_at)
            )
        ).scalars().all()
        payload = self._summary(
            classroom,
            sum(member.membership_role == "STUDENT" for member in memberships),
        )
        payload["members"] = [
            {
                "userId": str(member.user.id),
                "loginId": member.user.login_id,
                "displayName": member.user.display_name,
                "role": member.membership_role,
                "email": member.user.email,
                "status": (
                    member.user.status.value
                    if hasattr(member.user.status, "value")
                    else str(member.user.status)
                ),
                "joinedAt": member.created_at.isoformat(),
            }
            for member in memberships
        ]
        return payload

    async def create_classroom(self, teacher: User, body: dict[str, Any]) -> dict[str, Any]:
        _require_teacher(teacher)
        term_id = self._required_uuid(body.get("termId"), "termId")
        term = await self.session.get(Term, term_id)
        if term is None:
            raise CatalogError(404, "TERM_NOT_FOUND", "Không tìm thấy kỳ học.")
        if term_status(term, school_today()) == "ENDED":
            raise CatalogError(409, "TERM_ENDED", "Kỳ học đã kết thúc.")
        code = self._classroom_code(body.get("code"))
        grade_level = _grade(body.get("gradeLevel"))
        name = self._string(body.get("name"), "name", default=f"Lớp {code}", max_len=128)
        subject = self._string(body.get("subject"), "subject", default="Ngữ văn", max_len=64)
        duplicate = await self.session.execute(
            select(Classroom.id).where(
                Classroom.term_id == term.id,
                Classroom.subject == subject,
                Classroom.code == code,
            )
        )
        if duplicate.scalar_one_or_none() is not None:
            raise CatalogError(409, "CLASSROOM_EXISTS", "Lớp này đã có trong kỳ học.")
        classroom = Classroom(
            owner_teacher_id=teacher.id,
            term_id=term.id,
            term=term,
            code=code,
            name=name,
            subject=subject,
            grade_level=grade_level,
            academic_year=term.academic_year,
            join_code=await self._next_join_code(),
        )
        self.session.add(classroom)
        await self.session.flush()
        self.session.add(
            ClassMembership(
                classroom_id=classroom.id,
                user_id=teacher.id,
                membership_role="TEACHER",
                status="ACTIVE",
            )
        )
        await self.session.commit()
        return self._summary(classroom, 0)

    async def update_classroom(
        self, teacher: User, classroom_id: uuid.UUID, body: dict[str, Any]
    ) -> dict[str, Any]:
        _require_teacher(teacher)
        classroom = await self._owned_classroom(teacher, classroom_id)
        if term_status(classroom.term, school_today()) == "ENDED" and set(body) - {"archived"}:
            raise CatalogError(409, "CLASSROOM_READ_ONLY", CLASSROOM_READ_ONLY_MESSAGE)

        if "name" in body:
            classroom.name = self._string(body.get("name"), "name", default=None, max_len=128)
        if "code" in body:
            code = self._classroom_code(body.get("code"))
            if code != classroom.code:
                duplicate = await self.session.execute(
                    select(Classroom.id).where(
                        Classroom.term_id == classroom.term_id,
                        Classroom.subject == classroom.subject,
                        Classroom.code == code,
                        Classroom.id != classroom.id,
                    )
                )
                if duplicate.scalar_one_or_none() is not None:
                    raise CatalogError(409, "CLASSROOM_EXISTS", "Lớp này đã có trong kỳ học.")
                classroom.code = code
        if "gradeLevel" in body:
            classroom.grade_level = _grade(body.get("gradeLevel"))
        if "joinEnabled" in body:
            classroom.join_enabled = self._boolean(body.get("joinEnabled"), "joinEnabled")
        if "archived" in body:
            archived = self._boolean(body.get("archived"), "archived")
            classroom.archived_at = utcnow() if archived else None
        classroom.updated_at = utcnow()
        await self.session.commit()
        return self._summary(classroom, await self._student_count(classroom.id))

    async def rotate_join_code(self, teacher: User, classroom_id: uuid.UUID) -> dict[str, Any]:
        _require_teacher(teacher)
        classroom = await self._owned_classroom(teacher, classroom_id)
        if classroom_read_only(classroom):
            raise CatalogError(409, "CLASSROOM_READ_ONLY", CLASSROOM_READ_ONLY_MESSAGE)
        classroom.join_code = await self._next_join_code()
        classroom.updated_at = utcnow()
        await self.session.commit()
        return self._summary(classroom, await self._student_count(classroom.id))

    async def remove_member(
        self, teacher: User, classroom_id: uuid.UUID, user_id: uuid.UUID
    ) -> None:
        _require_teacher(teacher)
        classroom = await self._owned_classroom(teacher, classroom_id)
        membership = (
            await self.session.execute(
                select(ClassMembership).where(
                    ClassMembership.classroom_id == classroom.id,
                    ClassMembership.user_id == user_id,
                )
            )
        ).scalar_one_or_none()
        if (
            membership is None
            or membership.membership_role == "TEACHER"
            or membership.status != "ACTIVE"
        ):
            raise CatalogError(404, "NOT_FOUND", "Không tìm thấy học sinh trong lớp.")
        membership.status = "REMOVED"
        revision_ids = select(Assignment.published_revision_id).where(
            Assignment.classroom_id == classroom.id,
            Assignment.published_revision_id.is_not(None),
        )
        await self.session.execute(
            update(AssignmentAccess)
            .where(
                AssignmentAccess.assignment_revision_id.in_(revision_ids),
                AssignmentAccess.student_id == user_id,
                AssignmentAccess.revoked_at.is_(None),
            )
            .values(revoked_at=utcnow())
        )
        await self.session.commit()

    async def join_by_code(self, student: User, raw_code: Any) -> dict[str, Any]:
        self._require_student(student)
        settings = get_settings()
        await hit_rate_limit(
            settings,
            f"class-join:user:{student.id}",
            settings.RATE_LIMIT_CLASS_JOIN_MAX,
        )
        join_code = normalize_join_code(raw_code)
        classroom = (
            await self.session.execute(
                select(Classroom)
                .options(selectinload(Classroom.term), selectinload(Classroom.owner))
                .where(Classroom.join_code == join_code)
            )
        ).scalar_one_or_none()
        if classroom is None:
            raise CatalogError(404, "JOIN_CODE_INVALID", "Mã lớp không đúng.")
        if not classroom.join_enabled:
            raise CatalogError(409, "JOIN_DISABLED", "Lớp đang tạm khoá tham gia bằng mã.")
        if classroom_read_only(classroom):
            raise CatalogError(409, "CLASSROOM_READ_ONLY", CLASSROOM_READ_ONLY_MESSAGE)

        membership = (
            await self.session.execute(
                select(ClassMembership).where(
                    ClassMembership.classroom_id == classroom.id,
                    ClassMembership.user_id == student.id,
                )
            )
        ).scalar_one_or_none()
        if membership is not None and membership.status == "ACTIVE":
            return {"classroom": self._student_summary(classroom), "alreadyMember": True}
        if membership is None:
            inserted_id = (
                await self.session.execute(
                    pg_insert(ClassMembership)
                    .values(
                        classroom_id=classroom.id,
                        user_id=student.id,
                        membership_role="STUDENT",
                        status="ACTIVE",
                    )
                    .on_conflict_do_nothing(
                        constraint="class_memberships_class_user_key"
                    )
                    .returning(ClassMembership.id)
                )
            ).scalar_one_or_none()
            membership = (
                await self.session.execute(
                    select(ClassMembership).where(
                        ClassMembership.classroom_id == classroom.id,
                        ClassMembership.user_id == student.id,
                    )
                )
            ).scalar_one()
            if inserted_id is None and membership.status == "ACTIVE":
                return {"classroom": self._student_summary(classroom), "alreadyMember": True}
        if membership.status != "ACTIVE":
            membership.status = "ACTIVE"

        assignments = (
            await self.session.execute(
                select(Assignment).where(
                    Assignment.classroom_id == classroom.id,
                    Assignment.status == "PUBLISHED",
                    Assignment.published_revision_id.is_not(None),
                )
            )
        ).scalars().all()
        revision_ids: set[uuid.UUID] = set()
        for assignment in assignments:
            recipients = assignment.recipient_student_ids or []
            if _is_whole_class(recipients) or str(student.id) in recipients:
                if assignment.published_revision_id is not None:
                    revision_ids.add(assignment.published_revision_id)
        for revision_id in revision_ids:
            await grant_access(self.session, revision_id, [student.id])
            await outline_prep_service.enqueue_for_students(
                self.session,
                revision_id=revision_id,
                student_ids=[student.id],
                max_attempts=get_settings().OUTLINE_PREP_MAX_ATTEMPTS,
            )
        await self.session.commit()
        return {"classroom": self._student_summary(classroom), "alreadyMember": False}

    async def list_student_classrooms(
        self, student: User, *, term_id: uuid.UUID | None = None
    ) -> list[dict[str, Any]]:
        self._require_student(student)
        stmt = (
            select(Classroom)
            .join(ClassMembership, ClassMembership.classroom_id == Classroom.id)
            .join(Term, Classroom.term_id == Term.id)
            .options(selectinload(Classroom.term), selectinload(Classroom.owner))
            .where(
                ClassMembership.user_id == student.id,
                ClassMembership.membership_role == "STUDENT",
                ClassMembership.status == "ACTIVE",
                Classroom.archived_at.is_(None),
            )
        )
        if term_id is not None:
            stmt = stmt.where(Classroom.term_id == term_id)
        classrooms = (
            await self.session.execute(stmt.order_by(Term.starts_on.desc(), Classroom.code))
        ).scalars().unique().all()
        return [self._student_summary(classroom) for classroom in classrooms]

    async def _owned_classroom(self, teacher: User, classroom_id: uuid.UUID) -> Classroom:
        classroom = (
            await self.session.execute(
                select(Classroom)
                .options(selectinload(Classroom.term))
                .where(
                    Classroom.id == classroom_id,
                    Classroom.owner_teacher_id == teacher.id,
                )
            )
        ).scalar_one_or_none()
        if classroom is None:
            raise CatalogError(404, "NOT_FOUND", "Không tìm thấy lớp.")
        return classroom

    async def _next_join_code(self) -> str:
        for _ in range(5):
            join_code = generate_join_code()
            exists = await self.session.execute(
                select(Classroom.id).where(Classroom.join_code == join_code)
            )
            if exists.scalar_one_or_none() is None:
                return join_code
        raise CatalogError(500, "JOIN_CODE_GENERATION", "Không tạo được mã lớp. Vui lòng thử lại.")

    async def _student_count(self, classroom_id: uuid.UUID) -> int:
        memberships = (
            await self.session.execute(
                select(ClassMembership).where(
                    ClassMembership.classroom_id == classroom_id,
                    ClassMembership.membership_role == "STUDENT",
                    ClassMembership.status == "ACTIVE",
                )
            )
        ).scalars().all()
        return len(memberships)

    def _summary(self, classroom: Classroom, student_count: int) -> dict[str, Any]:
        return {
            "id": str(classroom.id),
            "code": classroom.code,
            "name": classroom.name,
            "subject": classroom.subject,
            "gradeLevel": classroom.grade_level,
            "academicYear": classroom.term.academic_year,
            "termId": str(classroom.term_id),
            "termName": classroom.term.name,
            "termStatus": term_status(classroom.term, school_today()),
            "readOnly": classroom_read_only(classroom),
            "archived": classroom.archived_at is not None,
            "joinCode": classroom.join_code,
            "joinEnabled": classroom.join_enabled,
            "studentCount": student_count,
        }

    def _student_summary(self, classroom: Classroom) -> dict[str, Any]:
        return {
            "id": str(classroom.id),
            "code": classroom.code,
            "name": classroom.name,
            "subject": classroom.subject,
            "gradeLevel": classroom.grade_level,
            "termId": str(classroom.term_id),
            "termName": classroom.term.name,
            "termStatus": term_status(classroom.term, school_today()),
            "academicYear": classroom.term.academic_year,
            "readOnly": classroom_read_only(classroom),
            "teacherName": classroom.owner.display_name,
        }

    @staticmethod
    def _required_uuid(value: Any, field: str) -> uuid.UUID:
        try:
            return uuid.UUID(str(value))
        except (TypeError, ValueError, AttributeError) as exc:
            raise CatalogError(
                400,
                "VALIDATION",
                ERROR_MESSAGES["VALIDATION"],
                {field: "ID không hợp lệ."},
            ) from exc

    @staticmethod
    def _classroom_code(value: Any) -> str:
        if not isinstance(value, str):
            raise CatalogError(400, "VALIDATION", ERROR_MESSAGES["VALIDATION"], {"code": "Không hợp lệ."})
        code = value.strip().upper()
        if not (1 <= len(code) <= 32) or not _CLASSROOM_CODE_RE.fullmatch(code):
            raise CatalogError(400, "VALIDATION", ERROR_MESSAGES["VALIDATION"], {"code": "Không hợp lệ."})
        return code

    @staticmethod
    def _string(value: Any, field: str, *, default: str | None, max_len: int) -> str:
        if value is None and default is not None:
            return default
        if not isinstance(value, str):
            raise CatalogError(400, "VALIDATION", ERROR_MESSAGES["VALIDATION"], {field: "Không hợp lệ."})
        text = value.strip()
        if not text:
            raise CatalogError(400, "VALIDATION", ERROR_MESSAGES["VALIDATION"], {field: "Không được để trống."})
        if len(text) > max_len:
            raise CatalogError(400, "VALIDATION", ERROR_MESSAGES["VALIDATION"], {field: "Vượt quá độ dài cho phép."})
        return text

    @staticmethod
    def _boolean(value: Any, field: str) -> bool:
        if not isinstance(value, bool):
            raise CatalogError(400, "VALIDATION", ERROR_MESSAGES["VALIDATION"], {field: "Không hợp lệ."})
        return value

    @staticmethod
    def _require_student(student: User) -> None:
        if student.role != UserRole.STUDENT:
            raise CatalogError(403, "STUDENT_REQUIRED", ERROR_MESSAGES["STUDENT_REQUIRED"])
