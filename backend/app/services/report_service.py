"""Class and competency reports: stats, error aggregation, insight jobs."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.schemas import CLASS_INSIGHT_SCHEMA_VERSION
from app.config import Settings, get_settings
from app.core.errors import ERROR_MESSAGES
from app.core.http import utcnow
from app.db.models import (
    Assignment,
    AssignmentRevision,
    ClassInsight,
    ClassInsightStatus,
    Classroom,
    User,
    UserRole,
)
from app.services.stats_engine import (
    MODE_OFFICIAL,
    MODE_PROVISIONAL,
    StatsEngine,
    filter_fingerprint,
    insight_input_hash,
    insight_scope_key,
    requested_mode,
    parse_time_bound,
    suggest_mode,
)
from app.services.submission_errors import SubmissionError

INSIGHT_QUEUED = ClassInsightStatus.QUEUED.value
INSIGHT_PROCESSING = ClassInsightStatus.PROCESSING.value
INSIGHT_READY = ClassInsightStatus.READY.value
INSIGHT_FAILED = ClassInsightStatus.FAILED.value


class ReportService:
    def __init__(self, session: AsyncSession, settings: Settings | None = None) -> None:
        self.session = session
        self.settings = settings or get_settings()
        self.stats = StatsEngine(session)

    async def list_report_assignments(
        self, teacher: User, *, classroom_id: uuid.UUID | None = None
    ) -> dict[str, Any]:
        self._require_teacher(teacher)
        classrooms = await self._teacher_classrooms(teacher)
        stmt = (
            select(Assignment, Classroom)
            .outerjoin(Classroom, Classroom.id == Assignment.classroom_id)
            .where(
                Assignment.teacher_id == teacher.id,
                Assignment.status == "PUBLISHED",
                Assignment.published_revision_id.is_not(None),
            )
            .order_by(Assignment.published_at.desc().nulls_last(), Assignment.updated_at.desc())
        )
        if classroom_id:
            stmt = stmt.where(Assignment.classroom_id == classroom_id)
        rows = (await self.session.execute(stmt)).all()
        items = [self._assignment_item(assignment, classroom) for assignment, classroom in rows]
        students = await self._classroom_students(teacher, classroom_id)
        return {
            "classrooms": [
                {
                    "id": str(item.id),
                    "code": item.code,
                    "name": item.name,
                    "gradeLevel": item.grade_level,
                    "academicYear": item.academic_year,
                }
                for item in classrooms
            ],
            "items": items,
            "students": students,
        }

    async def class_report(
        self,
        teacher: User,
        assignment_id: uuid.UUID,
        *,
        mode: str | None = None,
        search: str = "",
        status: str = "all",
        sort: str = "default",
        page: int = 1,
        page_size: int = 10,
        date_from: str | None = None,
        date_to: str | None = None,
        student_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        assignment, revision, classroom = await self._owned(teacher, assignment_id)
        papers = await self.stats.papers_for_assignment(
            assignment, revision, classroom, student_id=student_id
        )
        official = self.stats.compute(papers, mode=MODE_OFFICIAL)
        provisional = self.stats.compute(papers, mode=MODE_PROVISIONAL)
        suggested = suggest_mode(
            official_scored=official["scoredCount"],
            provisional_scored=provisional["scoredCount"],
        )
        resolved = requested_mode(mode) or suggested
        start = parse_time_bound(date_from, end=False)
        end = parse_time_bound(date_to, end=True)
        computed = self.stats.compute(papers, mode=resolved, start=start, end=end)
        stats = self._stats_payload(computed, assignment_max=computed.get("maxScore"))
        students = self.stats.student_rows_for_assignment(
            papers,
            mode=resolved,
            search=search,
            status=status,
            sort=sort,
            page=page,
            page_size=page_size,
            start=start,
            end=end,
        )
        fingerprint = filter_fingerprint(
            {
                "assignmentId": str(assignment.id),
                "studentId": str(student_id) if student_id else None,
                "from": date_from or None,
                "to": date_to or None,
            }
        )
        scope_key = insight_scope_key(kind="assignment", assignment_id=assignment.id, fingerprint=fingerprint)
        hash_payload = self._insight_hash_payload(
            scope_kind="assignment",
            scope_key=scope_key,
            mode=resolved,
            fingerprint=fingerprint,
            computed=computed,
            context={
                "assignmentTitle": assignment.title,
                "writingTask": (revision.snapshot or {}).get("writingTask") or "",
                "rubricTitle": (computed.get("trend") or [{}])[0].get("rubricTitle") if computed.get("trend") else "",
            },
        )
        input_hash = insight_input_hash(hash_payload)
        insight = await self._insight_view(teacher.id, scope_key, resolved, input_hash)
        return {
            "scope": "assignment",
            "mode": resolved,
            "suggestedMode": suggested,
            "hasProvisionalData": provisional["scoredCount"] > 0,
            "hasOfficialData": official["scoredCount"] > 0,
            "assignment": {
                "id": str(assignment.id),
                "code": assignment.code,
                "title": assignment.title,
                "teacherName": teacher.display_name,
                "classroomId": str(classroom.id) if classroom else None,
                "classroomName": classroom.name if classroom else None,
                "classroomCode": classroom.code if classroom else None,
                "maxScore": stats["maxScore"],
                "scoreStep": (computed.get("trend") or [{}])[0].get("scoreStep") if computed.get("trend") else None,
                "rubricTitle": (computed.get("trend") or [{}])[0].get("rubricTitle") if computed.get("trend") else "",
                "writingTask": (revision.snapshot or {}).get("writingTask") or "",
                "publishedAt": assignment.published_at.isoformat() if assignment.published_at else None,
            },
            "stats": stats,
            "insight": insight,
            "insightInputHash": input_hash,
            "canAnalyze": stats["scoredCount"] > 0,
            "students": students,
        }

    async def competency_report(
        self,
        teacher: User,
        *,
        classroom_id: uuid.UUID | None = None,
        assignment_ids: list[uuid.UUID] | None = None,
        student_id: uuid.UUID | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        mode: str | None = None,
        search: str = "",
        sort: str = "default",
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        self._require_teacher(teacher)
        if classroom_id:
            classroom = await self.session.get(Classroom, classroom_id)
            if classroom is None:
                raise SubmissionError(404, "NOT_FOUND", "Không tìm thấy lớp.")
            owned = await self._teacher_classrooms(teacher)
            if classroom.id not in {item.id for item in owned}:
                raise SubmissionError(403, "ACCESS_DENIED", ERROR_MESSAGES["ACCESS_DENIED"])
        selected = await self._published_assignments(teacher, classroom_id=classroom_id)
        wanted = {item for item in (assignment_ids or []) if item}
        if wanted:
            unknown = wanted - {row[0].id for row in selected}
            if unknown:
                raise SubmissionError(404, "NOT_FOUND", "Có bài tập không thuộc phạm vi được chọn.")
            selected = [row for row in selected if row[0].id in wanted]
        papers = await self.stats.papers_for_assignments(selected, student_id=student_id)
        official = self.stats.compute(papers, mode=MODE_OFFICIAL)
        provisional = self.stats.compute(papers, mode=MODE_PROVISIONAL)
        suggested = suggest_mode(
            official_scored=official["scoredCount"],
            provisional_scored=provisional["scoredCount"],
        )
        resolved = requested_mode(mode) or suggested
        start = parse_time_bound(date_from, end=False)
        end = parse_time_bound(date_to, end=True)
        computed = self.stats.compute(papers, mode=resolved, start=start, end=end)
        stats = self._stats_payload(computed, assignment_max=10)
        students = self.stats.competency_student_rows(
            papers, computed, search=search, sort=sort, page=page, page_size=page_size
        )
        fingerprint = filter_fingerprint(
            {
                "classroomId": str(classroom_id) if classroom_id else None,
                "assignmentIds": sorted(str(item.id) for item, _rev, _cls in selected),
                "studentId": str(student_id) if student_id else None,
                "from": date_from or None,
                "to": date_to or None,
            }
        )
        scope_key = insight_scope_key(kind="competency", assignment_id=None, fingerprint=fingerprint)
        context = {
            "assignmentCount": computed["counts"]["assignmentCount"],
            "assignments": [
                {
                    "title": item["title"],
                    "rubricTitle": item.get("rubricTitle") or "",
                    "genre": item.get("genre") or "",
                    "writingTask": (item.get("writingTask") or "")[:400],
                }
                for item in computed.get("trend") or []
            ],
        }
        hash_payload = self._insight_hash_payload(
            scope_kind="competency",
            scope_key=scope_key,
            mode=resolved,
            fingerprint=fingerprint,
            computed=computed,
            context=context,
        )
        input_hash = insight_input_hash(hash_payload)
        insight = await self._insight_view(teacher.id, scope_key, resolved, input_hash)
        meta = await self.list_report_assignments(teacher, classroom_id=classroom_id)
        return {
            "scope": "competency",
            "mode": resolved,
            "suggestedMode": suggested,
            "hasProvisionalData": provisional["scoredCount"] > 0,
            "hasOfficialData": official["scoredCount"] > 0,
            "filters": {
                "classroomId": str(classroom_id) if classroom_id else None,
                "assignmentIds": [str(item.id) for item, _rev, _cls in selected],
                "studentId": str(student_id) if student_id else None,
                "from": date_from or None,
                "to": date_to or None,
            },
            "available": {
                "classrooms": meta["classrooms"],
                "assignments": meta["items"],
                "students": meta["students"],
            },
            "stats": stats,
            "trend": computed.get("trend") or [],
            "insight": insight,
            "insightInputHash": input_hash,
            "canAnalyze": stats["scoredCount"] > 0,
            "students": students,
        }

    async def enqueue_assignment_insight(
        self,
        teacher: User,
        assignment_id: uuid.UUID,
        *,
        mode: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        student_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        report = await self.class_report(
            teacher,
            assignment_id,
            mode=mode,
            date_from=date_from,
            date_to=date_to,
            student_id=student_id,
            page=1,
            page_size=1,
        )
        assignment, revision, _classroom = await self._owned(teacher, assignment_id)
        fingerprint = filter_fingerprint(
            {
                "assignmentId": str(assignment.id),
                "studentId": str(student_id) if student_id else None,
                "from": date_from or None,
                "to": date_to or None,
            }
        )
        scope_key = insight_scope_key(kind="assignment", assignment_id=assignment.id, fingerprint=fingerprint)
        await self._enqueue_insight(
            teacher,
            scope_kind="assignment",
            scope_key=scope_key,
            mode=report["mode"],
            fingerprint=fingerprint,
            input_hash=report["insightInputHash"],
            scored_count=report["stats"]["scoredCount"],
            assignment_id=assignment.id,
            assignment_revision_id=revision.id,
            stats_snapshot=self._insight_snapshot(report, extra={"assignmentTitle": assignment.title}),
        )
        return await self.class_report(
            teacher,
            assignment_id,
            mode=report["mode"],
            date_from=date_from,
            date_to=date_to,
            student_id=student_id,
        )

    async def enqueue_competency_insight(
        self,
        teacher: User,
        *,
        classroom_id: uuid.UUID | None = None,
        assignment_ids: list[uuid.UUID] | None = None,
        student_id: uuid.UUID | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        mode: str | None = None,
    ) -> dict[str, Any]:
        report = await self.competency_report(
            teacher,
            classroom_id=classroom_id,
            assignment_ids=assignment_ids,
            student_id=student_id,
            date_from=date_from,
            date_to=date_to,
            mode=mode,
            page=1,
            page_size=1,
        )
        fingerprint = filter_fingerprint(
            {
                "classroomId": str(classroom_id) if classroom_id else None,
                "assignmentIds": report["filters"]["assignmentIds"],
                "studentId": str(student_id) if student_id else None,
                "from": date_from or None,
                "to": date_to or None,
            }
        )
        scope_key = insight_scope_key(kind="competency", assignment_id=None, fingerprint=fingerprint)
        await self._enqueue_insight(
            teacher,
            scope_kind="competency",
            scope_key=scope_key,
            mode=report["mode"],
            fingerprint=fingerprint,
            input_hash=report["insightInputHash"],
            scored_count=report["stats"]["scoredCount"],
            assignment_id=None,
            assignment_revision_id=None,
            stats_snapshot=self._insight_snapshot(report),
        )
        return await self.competency_report(
            teacher,
            classroom_id=classroom_id,
            assignment_ids=assignment_ids,
            student_id=student_id,
            date_from=date_from,
            date_to=date_to,
            mode=report["mode"],
        )

    async def _enqueue_insight(
        self,
        teacher: User,
        *,
        scope_kind: str,
        scope_key: str,
        mode: str,
        fingerprint: str,
        input_hash: str,
        scored_count: int,
        assignment_id: uuid.UUID | None,
        assignment_revision_id: uuid.UUID | None,
        stats_snapshot: dict[str, Any],
    ) -> None:
        if scored_count <= 0:
            raise SubmissionError(
                400,
                "INSIGHT_NO_DATA",
                ERROR_MESSAGES["INSIGHT_NO_DATA"],
            )
        now = utcnow()
        existing = (
            await self.session.execute(
                select(ClassInsight).where(
                    ClassInsight.teacher_id == teacher.id,
                    ClassInsight.scope_key == scope_key,
                    ClassInsight.mode == mode,
                )
            )
        ).scalar_one_or_none()
        if (
            existing is not None
            and existing.input_hash == input_hash
            and existing.status in {INSIGHT_QUEUED, INSIGHT_PROCESSING, INSIGHT_READY}
        ):
            await self.session.commit()
            return
        if existing is not None and existing.status == INSIGHT_PROCESSING:
            await self.session.commit()
            return
        if existing is None:
            existing = ClassInsight(
                teacher_id=teacher.id,
                scope_kind=scope_kind,
                scope_key=scope_key,
                mode=mode,
                filter_fingerprint=fingerprint,
                assignment_id=assignment_id,
                assignment_revision_id=assignment_revision_id,
                input_hash=input_hash,
                status=INSIGHT_QUEUED,
                max_attempts=int(self.settings.ASSESSMENT_MAX_ATTEMPTS or 3),
                prompt_version=self.settings.INSIGHT_PROMPT_VERSION or "v1",
                schema_version=CLASS_INSIGHT_SCHEMA_VERSION,
                stats_snapshot=stats_snapshot,
            )
            self.session.add(existing)
        else:
            existing.scope_kind = scope_kind
            existing.filter_fingerprint = fingerprint
            existing.assignment_id = assignment_id
            existing.assignment_revision_id = assignment_revision_id
            existing.input_hash = input_hash
            existing.status = INSIGHT_QUEUED
            existing.attempt_count = 0
            existing.lease_token = None
            existing.lease_expires_at = None
            existing.last_error = None
            existing.finished_at = None
            existing.stats_snapshot = stats_snapshot
            existing.payload = None
            existing.updated_at = now
        try:
            await self.session.commit()
        except IntegrityError:
            await self.session.rollback()

    async def _insight_view(
        self, teacher_id: uuid.UUID, scope_key: str, mode: str, input_hash: str
    ) -> dict[str, Any] | None:
        row = (
            await self.session.execute(
                select(ClassInsight).where(
                    ClassInsight.teacher_id == teacher_id,
                    ClassInsight.scope_key == scope_key,
                    ClassInsight.mode == mode,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            return None
        stale = row.input_hash != input_hash
        return {
            "status": row.status,
            "stale": stale,
            "createdAt": row.created_at.isoformat() if row.created_at else None,
            "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
            "error": row.last_error if row.status == INSIGHT_FAILED else None,
            "payload": row.payload if row.status == INSIGHT_READY else None,
            "mode": row.mode,
            "promptVersion": row.prompt_version,
            "model": row.model or None,
        }

    def _insight_hash_payload(
        self,
        *,
        scope_kind: str,
        scope_key: str,
        mode: str,
        fingerprint: str,
        computed: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "scopeKind": scope_kind,
            "scopeKey": scope_key,
            "mode": mode,
            "fingerprint": fingerprint,
            "promptVersion": self.settings.INSIGHT_PROMPT_VERSION or "v1",
            "schemaVersion": CLASS_INSIGHT_SCHEMA_VERSION,
            "provider": self.settings.AI_PROVIDER,
            "model": self.settings.ASSESSMENT_MODEL or self.settings.AI_MODEL or "",
            "stats": {
                "assignedStudents": computed["counts"]["assignedStudents"],
                "assignedPapers": computed["counts"]["assignedPapers"],
                "assignmentCount": computed["counts"]["assignmentCount"],
                "officialSubmitted": computed["counts"]["officialSubmitted"],
                "published": computed["counts"]["published"],
                "scoredCount": computed["scoredCount"],
                "meanScoreScale10": computed["meanScoreScale10"],
                "minScoreScale10": computed["minScoreScale10"],
                "maxScoreScale10": computed["maxScoreScale10"],
                "distribution": computed["distribution"],
                "issues": computed["issues"],
                "criteria": computed["criteria"],
                "trend": [
                    {
                        "id": item["id"],
                        "n": item["scoredCount"],
                        "meanScoreScale10": item["meanScoreScale10"],
                    }
                    for item in computed.get("trend") or []
                ],
            },
            "context": context,
        }

    def _insight_snapshot(self, report: dict[str, Any], extra: dict[str, Any] | None = None) -> dict[str, Any]:
        snapshot = {
            "scope": report.get("scope"),
            "mode": report.get("mode"),
            "sampleSize": report["stats"]["scoredCount"],
            "assignmentCount": report["stats"].get("assignmentCount"),
            "uniqueStudents": report["stats"].get("assignedStudents"),
            "papers": report["stats"].get("assignedPapers"),
            "officialSubmitted": report["stats"].get("officialSubmitted"),
            "published": report["stats"].get("published"),
            "meanScoreScale10": report["stats"].get("meanScoreScale10"),
            "minScoreScale10": report["stats"].get("minScoreScale10"),
            "maxScoreScale10": report["stats"].get("maxScoreScale10"),
            "distribution": report["stats"].get("distribution"),
            "criteria": report["stats"].get("criteria"),
            "issues": report["stats"].get("issues"),
            "weakCriteria": report["stats"].get("weakCriteria"),
            "recurringIssues": report["stats"].get("recurringIssues"),
            "trend": report.get("trend") or report["stats"].get("trend"),
            "scoreFormula": report["stats"].get("scoreFormula"),
            "limits": {
                "onePaperIsPreliminary": report["stats"]["scoredCount"] < 2,
                "provisional": report.get("mode") == MODE_PROVISIONAL,
                "doNotInventNumbers": True,
            },
        }
        if extra:
            snapshot.update(extra)
        if report.get("assignment"):
            snapshot["assignmentTitle"] = report["assignment"].get("title")
            snapshot["writingTask"] = report["assignment"].get("writingTask") or ""
            snapshot["rubricTitle"] = report["assignment"].get("rubricTitle")
        return snapshot

    def _stats_payload(self, computed: dict[str, Any], *, assignment_max: Any) -> dict[str, Any]:
        counts = computed["counts"]
        return {
            "assigned": counts["assigned"],
            "assignedStudents": counts["assignedStudents"],
            "assignedPapers": counts["assignedPapers"],
            "assignmentCount": counts["assignmentCount"],
            "officialSubmitted": counts["officialSubmitted"],
            "processing": counts["processing"],
            "grading": counts["grading"],
            "awaitingReview": counts["awaitingReview"],
            "published": counts["published"],
            "failed": counts["failed"],
            "scoredCount": computed["scoredCount"],
            "publishedCount": computed["scoredCount"] if computed["mode"] == MODE_OFFICIAL else counts["published"],
            "meanScore": computed["meanScore"],
            "meanScoreScale10": computed["meanScoreScale10"],
            "minScoreScale10": computed["minScoreScale10"],
            "maxScoreScale10": computed["maxScoreScale10"],
            "maxScore": assignment_max,
            "distribution": computed["distribution"],
            "issues": computed["issues"],
            "criteria": computed["criteria"],
            "weakCriteria": computed["weakCriteria"],
            "strengths": computed["strengths"],
            "recurringIssues": computed["recurringIssues"],
            "trend": computed.get("trend") or [],
            "scoreFormula": computed["scoreFormula"],
            "mode": computed["mode"],
        }

    def _assignment_item(self, assignment: Assignment, classroom: Classroom | None) -> dict[str, Any]:
        return {
            "id": str(assignment.id),
            "code": assignment.code,
            "title": assignment.title,
            "classroomId": str(assignment.classroom_id) if assignment.classroom_id else None,
            "classroomName": classroom.name if classroom else None,
            "classroomCode": classroom.code if classroom else None,
            "maxScore": float(assignment.max_score),
            "scoreStep": float(assignment.score_step),
            "publishedAt": assignment.published_at.isoformat() if assignment.published_at else None,
            "dueAt": assignment.due_at.isoformat() if assignment.due_at else None,
        }

    async def _published_assignments(
        self, teacher: User, *, classroom_id: uuid.UUID | None
    ) -> list[tuple[Assignment, AssignmentRevision, Classroom | None]]:
        stmt = (
            select(Assignment, AssignmentRevision, Classroom)
            .join(AssignmentRevision, AssignmentRevision.id == Assignment.published_revision_id)
            .outerjoin(Classroom, Classroom.id == Assignment.classroom_id)
            .where(
                Assignment.teacher_id == teacher.id,
                Assignment.status == "PUBLISHED",
                Assignment.published_revision_id.is_not(None),
            )
            .order_by(Assignment.published_at.asc().nulls_last(), Assignment.created_at.asc())
        )
        if classroom_id:
            stmt = stmt.where(Assignment.classroom_id == classroom_id)
        return list((await self.session.execute(stmt)).all())

    async def _teacher_classrooms(self, teacher: User) -> list[Classroom]:
        from app.db.models import ClassMembership

        rows = (
            await self.session.execute(
                select(Classroom)
                .join(ClassMembership, ClassMembership.classroom_id == Classroom.id)
                .where(ClassMembership.user_id == teacher.id)
                .order_by(Classroom.name.asc())
            )
        ).scalars().all()
        owned = (
            await self.session.execute(
                select(Classroom).where(Classroom.owner_teacher_id == teacher.id).order_by(Classroom.name.asc())
            )
        ).scalars().all()
        assigned = (
            await self.session.execute(
                select(Classroom)
                .where(
                    Classroom.id.in_(
                        select(Assignment.classroom_id).where(
                            Assignment.teacher_id == teacher.id,
                            Assignment.classroom_id.is_not(None),
                        )
                    )
                )
                .order_by(Classroom.name.asc())
            )
        ).scalars().all()
        by_id = {row.id: row for row in list(rows) + list(owned) + list(assigned)}
        return list(by_id.values())

    async def _classroom_students(self, teacher: User, classroom_id: uuid.UUID | None) -> list[dict[str, str]]:
        from app.db.models import ClassMembership

        owned = await self._teacher_classrooms(teacher)
        owned_ids = {item.id for item in owned}
        if classroom_id:
            classroom_ids = [classroom_id] if classroom_id in owned_ids else []
        else:
            classroom_ids = list(owned_ids)
        if not classroom_ids:
            return []
        rows = (
            await self.session.execute(
                select(User)
                .join(ClassMembership, ClassMembership.user_id == User.id)
                .where(
                    ClassMembership.classroom_id.in_(classroom_ids),
                    User.role == UserRole.STUDENT,
                )
                .order_by(User.display_name.asc())
            )
        ).scalars().all()
        seen: set[uuid.UUID] = set()
        out: list[dict[str, str]] = []
        for row in rows:
            if row.id in seen:
                continue
            seen.add(row.id)
            out.append({"id": str(row.id), "name": row.display_name, "code": row.login_id})
        return out

    async def _owned(
        self, teacher: User, assignment_id: uuid.UUID
    ) -> tuple[Assignment, AssignmentRevision, Classroom | None]:
        self._require_teacher(teacher)
        assignment = await self.session.get(Assignment, assignment_id)
        if assignment is None or assignment.teacher_id != teacher.id or assignment.status == "DELETED":
            raise SubmissionError(404, "NOT_FOUND", "Không tìm thấy bài tập.")
        if not assignment.published_revision_id:
            raise SubmissionError(404, "NOT_FOUND", "Bài tập chưa được giao.")
        revision = await self.session.get(AssignmentRevision, assignment.published_revision_id)
        if revision is None:
            raise SubmissionError(404, "NOT_FOUND", "Không tìm thấy bài tập.")
        classroom = None
        if assignment.classroom_id:
            classroom = await self.session.get(Classroom, assignment.classroom_id)
        return assignment, revision, classroom

    def _require_teacher(self, teacher: User) -> None:
        if teacher.role != UserRole.TEACHER:
            raise SubmissionError(403, "TEACHER_REQUIRED", ERROR_MESSAGES["TEACHER_REQUIRED"])
