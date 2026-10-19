"""Class reports: server-side stats, error aggregation, insight jobs."""

from __future__ import annotations

import hashlib
import json
import uuid
from collections import defaultdict
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.schemas import CLASS_INSIGHT_SCHEMA_VERSION
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
    ClassInsight,
    ClassInsightStatus,
    Classroom,
    Submission,
    SubmissionAttempt,
    SubmissionAttemptState,
    User,
    UserRole,
)
from app.services.assessment_scoring import rubric_from_revision
from app.services.rubric import decimal_to_number, scale10
from app.services.submission_errors import SubmissionError

READY_TO_GRADE = SubmissionAttemptState.READY_TO_GRADE.value
JOB_QUEUED = AssessmentJobStatus.QUEUED.value
JOB_PROCESSING = AssessmentJobStatus.PROCESSING.value
JOB_READY = AssessmentJobStatus.READY.value
JOB_FAILED = AssessmentJobStatus.FAILED.value

SCALE10_BINS = [
    ("0–2", 0.0, 2.0),
    ("2–4", 2.0, 4.0),
    ("4–6", 4.0, 6.0),
    ("6–8", 6.0, 8.0),
    ("8–10", 8.0, 10.01),
]


def _row_status(
    *,
    attempt: SubmissionAttempt | None,
    job: AssessmentJob | None,
    published: AssessmentResult | None,
) -> str:
    if attempt is None:
        return "not_submitted"
    published_live = bool(published and published.is_published)
    current_tx = attempt.confirmed_revision_id
    published_tx = published.transcription_revision_id if published_live else None
    new_version = bool(published_live and current_tx and published_tx != current_tx)
    state = attempt.state
    if new_version:
        if state == SubmissionAttemptState.OCR_REVIEW.value:
            return "revising"
        if job and job.status == JOB_FAILED:
            return "new_version_failed"
        if job and job.status in {JOB_QUEUED, JOB_PROCESSING}:
            return "new_version_grading"
        return "new_version_review"
    if state in {
        SubmissionAttemptState.DRAFT.value,
        SubmissionAttemptState.QUEUED.value,
        SubmissionAttemptState.OCR_PROCESSING.value,
    }:
        return "processing"
    if state == SubmissionAttemptState.FAILED.value:
        return "ocr_failed"
    if state == SubmissionAttemptState.OCR_REVIEW.value:
        return "ocr_review"
    if state != READY_TO_GRADE:
        return "processing"
    if job and job.status == JOB_FAILED:
        return "grading_failed"
    if job and job.status in {JOB_QUEUED, JOB_PROCESSING}:
        return "grading"
    if published_live:
        return "published"
    if job and job.status == JOB_READY:
        return "awaiting_review"
    return "grading"


class ReportService:
    def __init__(self, session: AsyncSession, settings: Settings | None = None) -> None:
        self.session = session
        self.settings = settings or get_settings()

    async def list_report_assignments(self, teacher: User) -> dict[str, Any]:
        if teacher.role != UserRole.TEACHER:
            raise SubmissionError(403, "TEACHER_REQUIRED", ERROR_MESSAGES["TEACHER_REQUIRED"])
        rows = (
            await self.session.execute(
                select(Assignment, Classroom)
                .outerjoin(Classroom, Classroom.id == Assignment.classroom_id)
                .where(
                    Assignment.teacher_id == teacher.id,
                    Assignment.status == "PUBLISHED",
                    Assignment.published_revision_id.is_not(None),
                )
                .order_by(Assignment.published_at.desc().nulls_last(), Assignment.updated_at.desc())
            )
        ).all()
        items = []
        for assignment, classroom in rows:
            items.append(
                {
                    "id": str(assignment.id),
                    "code": assignment.code,
                    "title": assignment.title,
                    "classroomId": str(assignment.classroom_id) if assignment.classroom_id else None,
                    "classroomName": classroom.name if classroom else None,
                    "classroomCode": classroom.code if classroom else None,
                    "maxScore": float(assignment.max_score),
                    "scoreStep": float(assignment.score_step),
                    "publishedAt": assignment.published_at.isoformat() if assignment.published_at else None,
                }
            )
        return {"items": items}

    async def class_report(
        self,
        teacher: User,
        assignment_id: uuid.UUID,
        *,
        search: str = "",
        status: str = "all",
        sort: str = "default",
        page: int = 1,
        page_size: int = 10,
    ) -> dict[str, Any]:
        assignment, revision, classroom = await self._owned(teacher, assignment_id)
        students = await self._assigned_students(revision.id)
        submissions = await self._submissions_map(revision.id)
        jobs = await self._jobs_map([row.id for row in submissions.values()])
        results = await self._results_map(
            [
                sub.current_published_result_id
                for sub in submissions.values()
                if sub.current_published_result_id
            ]
            + [
                sub.current_assessment_result_id
                for sub in submissions.values()
                if sub.current_assessment_result_id
            ]
        )
        attempts = await self._attempts_map(
            [sub.current_attempt_id for sub in submissions.values() if sub.current_attempt_id]
        )

        rows: list[dict[str, Any]] = []
        published_scores: list[Decimal] = []
        issue_students: dict[str, set[uuid.UUID]] = defaultdict(set)
        issue_counts: dict[str, int] = defaultdict(int)
        issue_labels: dict[str, str] = {}
        issue_source_sets: dict[str, set[str]] = defaultdict(set)
        rubric = rubric_from_revision(revision.rubric, revision.snapshot)
        max_score = Decimal(str(rubric["maxScore"]))

        counts = {
            "assigned": len(students),
            "officialSubmitted": 0,
            "processing": 0,
            "awaitingReview": 0,
            "published": 0,
            "failed": 0,
        }

        for student in students:
            submission = submissions.get(student.id)
            attempt = attempts.get(submission.current_attempt_id) if submission and submission.current_attempt_id else None
            job = jobs.get(submission.current_assessment_job_id) if submission and submission.current_assessment_job_id else None
            published = (
                results.get(submission.current_published_result_id)
                if submission and submission.current_published_result_id
                else None
            )
            row_status = _row_status(attempt=attempt, job=job, published=published)
            if attempt and attempt.state == READY_TO_GRADE and attempt.official_submitted_at:
                counts["officialSubmitted"] += 1
            if row_status in {"processing", "ocr_review", "grading", "new_version_grading"}:
                counts["processing"] += 1
            if row_status in {"awaiting_review", "new_version_review"}:
                counts["awaitingReview"] += 1
            if published and published.is_published:
                counts["published"] += 1
            if row_status in {"ocr_failed", "grading_failed", "new_version_failed"}:
                counts["failed"] += 1

            score = None
            scale = None
            if published and published.is_published and published.published_payload:
                payload = published.published_payload
                score = Decimal(str(payload.get("totalScore", published.total_score)))
                scale = Decimal(str(payload.get("scoreScale10", published.score_scale10)))
                published_scores.append(score)
                for ev in payload.get("evaluations") or []:
                    if not isinstance(ev, dict):
                        continue
                    for issue in ev.get("issues") or []:
                        if not isinstance(issue, dict):
                            continue
                        code = str(issue.get("code") or "").strip() or "OTHER"
                        issue_counts[code] += 1
                        issue_students[code].add(student.id)
                        issue_labels[code] = str(issue.get("message") or code)
                        src = str(issue.get("source") or "ai").strip() or "ai"
                        issue_source_sets[code].add("teacher" if src == "teacher" else "ai")

            rows.append(
                {
                    "studentId": str(student.id),
                    "name": student.display_name,
                    "code": student.login_id,
                    "status": row_status,
                    "pageCount": attempt.page_count if attempt else 0,
                    "officialSubmittedAt": attempt.official_submitted_at.isoformat()
                    if attempt and attempt.official_submitted_at
                    else None,
                    "ocrSubmittedAt": attempt.submitted_at.isoformat()
                    if attempt and attempt.submitted_at
                    else None,
                    "score": decimal_to_number(score) if score is not None else None,
                    "scoreScale10": decimal_to_number(scale) if scale is not None else None,
                    "isPublished": bool(published and published.is_published),
                    "hasNewUnpublishedVersion": bool(
                        published
                        and published.is_published
                        and attempt
                        and attempt.confirmed_revision_id
                        and published.transcription_revision_id != attempt.confirmed_revision_id
                    ),
                }
            )

        needle = (search or "").strip().lower()
        filtered = []
        for row in rows:
            if needle and needle not in row["name"].lower() and needle not in row["code"].lower():
                continue
            if status and status != "all":
                if status == "published" and not row["isPublished"]:
                    continue
                if status == "pending" and row["isPublished"]:
                    continue
                if status not in {"published", "pending", "all"} and row["status"] != status:
                    continue
            filtered.append(row)

        if sort == "score_desc":
            filtered.sort(key=lambda r: (r["score"] is None, -(r["score"] or 0), r["name"]))
        elif sort == "score_asc":
            filtered.sort(key=lambda r: (r["score"] is None, r["score"] or 0, r["name"]))
        else:
            filtered.sort(key=lambda r: r["name"])

        page = max(1, int(page or 1))
        page_size = min(50, max(1, int(page_size or 10)))
        total = len(filtered)
        pages = max(1, (total + page_size - 1) // page_size)
        page = min(page, pages)
        start = (page - 1) * page_size
        page_rows = filtered[start : start + page_size]

        mean = None
        mean10 = None
        if published_scores:
            total_dec = sum(published_scores, Decimal("0"))
            mean = (total_dec / Decimal(len(published_scores)))
            mean10 = scale10(mean, max_score)

        distribution = []
        n_pub = len(published_scores)
        for label, lo, hi in SCALE10_BINS:
            count = 0
            for score in published_scores:
                value = float(scale10(score, max_score))
                if value >= lo and value < hi:
                    count += 1
            distribution.append({"range": label, "label": "Thang 10", "count": count})

        denom = n_pub
        issues = []
        for code, count in sorted(issue_counts.items(), key=lambda kv: (-kv[1], kv[0])):
            student_n = len(issue_students[code])
            sources = issue_source_sets.get(code) or {"ai"}
            if sources == {"teacher"}:
                source = "teacher"
            elif "teacher" in sources and "ai" in sources:
                source = "mixed"
            else:
                source = "ai"
            issues.append(
                {
                    "code": code,
                    "label": issue_labels.get(code) or code,
                    "occurrenceCount": count,
                    "studentCount": student_n,
                    "studentRate": (student_n / denom) if denom else None,
                    "denominator": denom,
                    "source": source,
                    "teacherConfirmed": source == "teacher",
                }
            )

        stats = {
            "assigned": counts["assigned"],
            "officialSubmitted": counts["officialSubmitted"],
            "processing": counts["processing"],
            "awaitingReview": counts["awaitingReview"],
            "published": counts["published"],
            "failed": counts["failed"],
            "meanScore": decimal_to_number(mean) if mean is not None else None,
            "meanScoreScale10": decimal_to_number(mean10) if mean10 is not None else None,
            "publishedCount": n_pub,
            "maxScore": decimal_to_number(max_score),
            "scoreStep": rubric["scoreStep"],
            "distribution": distribution,
            "issues": issues,
        }
        insight_hash = hashlib.sha256(
            json.dumps(
                {
                    "stats": {
                        k: stats[k]
                        for k in (
                            "assigned",
                            "officialSubmitted",
                            "published",
                            "meanScore",
                            "publishedCount",
                            "distribution",
                            "issues",
                        )
                    },
                    "revision": str(revision.id),
                },
                ensure_ascii=False,
                sort_keys=True,
                default=str,
            ).encode("utf-8")
        ).hexdigest()
        insight_row = (
            await self.session.execute(select(ClassInsight).where(ClassInsight.assignment_id == assignment.id))
        ).scalar_one_or_none()
        insight = None
        if insight_row is not None:
            stale = insight_row.input_hash != insight_hash
            insight = {
                "status": insight_row.status,
                "stale": stale,
                "createdAt": insight_row.created_at.isoformat() if insight_row.created_at else None,
                "updatedAt": insight_row.updated_at.isoformat() if insight_row.updated_at else None,
                "error": insight_row.last_error if insight_row.status == ClassInsightStatus.FAILED.value else None,
                "payload": insight_row.payload if insight_row.status == ClassInsightStatus.READY.value else None,
            }

        return {
            "assignment": {
                "id": str(assignment.id),
                "code": assignment.code,
                "title": assignment.title,
                "teacherName": teacher.display_name,
                "classroomId": str(classroom.id) if classroom else None,
                "classroomName": classroom.name if classroom else None,
                "classroomCode": classroom.code if classroom else None,
                "maxScore": decimal_to_number(max_score),
                "scoreStep": rubric["scoreStep"],
                "rubricTitle": rubric.get("title") or "",
            },
            "stats": stats,
            "insight": insight,
            "insightInputHash": insight_hash,
            "students": {
                "items": page_rows,
                "page": page,
                "pageSize": page_size,
                "total": total,
                "totalPages": pages,
            },
        }

    async def enqueue_insight(self, teacher: User, assignment_id: uuid.UUID) -> dict[str, Any]:
        report = await self.class_report(teacher, assignment_id, page=1, page_size=1)
        assignment, revision, _classroom = await self._owned(teacher, assignment_id)
        input_hash = report["insightInputHash"]
        stats_snapshot = {
            "assignmentTitle": assignment.title,
            "writingTask": (revision.snapshot or {}).get("writingTask") or "",
            "rubricTitle": report["assignment"]["rubricTitle"],
            "stats": report["stats"],
        }
        now = utcnow()
        existing = (
            await self.session.execute(select(ClassInsight).where(ClassInsight.assignment_id == assignment.id))
        ).scalar_one_or_none()
        if existing is not None and existing.input_hash == input_hash and existing.status in {
            ClassInsightStatus.QUEUED.value,
            ClassInsightStatus.PROCESSING.value,
            ClassInsightStatus.READY.value,
        }:
            await self.session.commit()
            return await self.class_report(teacher, assignment_id)
        if existing is None:
            existing = ClassInsight(
                assignment_id=assignment.id,
                assignment_revision_id=revision.id,
                input_hash=input_hash,
                status=ClassInsightStatus.QUEUED.value,
                max_attempts=int(self.settings.ASSESSMENT_MAX_ATTEMPTS or 3),
                prompt_version=self.settings.INSIGHT_PROMPT_VERSION or "v1",
                schema_version=CLASS_INSIGHT_SCHEMA_VERSION,
                stats_snapshot=stats_snapshot,
            )
            self.session.add(existing)
        else:
            existing.assignment_revision_id = revision.id
            existing.input_hash = input_hash
            existing.status = ClassInsightStatus.QUEUED.value
            existing.attempt_count = 0
            existing.lease_token = None
            existing.lease_expires_at = None
            existing.last_error = None
            existing.finished_at = None
            existing.stats_snapshot = stats_snapshot
            existing.payload = None
            existing.updated_at = now
        await self.session.commit()
        return await self.class_report(teacher, assignment_id)

    async def _owned(
        self, teacher: User, assignment_id: uuid.UUID
    ) -> tuple[Assignment, AssignmentRevision, Classroom | None]:
        if teacher.role != UserRole.TEACHER:
            raise SubmissionError(403, "TEACHER_REQUIRED", ERROR_MESSAGES["TEACHER_REQUIRED"])
        assignment = await self.session.get(Assignment, assignment_id)
        if assignment is None or assignment.teacher_id != teacher.id:
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

    async def _assigned_students(self, revision_id: uuid.UUID) -> list[User]:
        rows = (
            await self.session.execute(
                select(User)
                .join(AssignmentAccess, AssignmentAccess.student_id == User.id)
                .where(
                    AssignmentAccess.assignment_revision_id == revision_id,
                    AssignmentAccess.revoked_at.is_(None),
                    User.role == UserRole.STUDENT,
                )
                .order_by(User.display_name.asc())
            )
        ).scalars().all()
        return list(rows)

    async def _submissions_map(self, revision_id: uuid.UUID) -> dict[uuid.UUID, Submission]:
        rows = (
            await self.session.execute(
                select(Submission).where(Submission.assignment_revision_id == revision_id)
            )
        ).scalars().all()
        return {row.student_id: row for row in rows}

    async def _jobs_map(self, submission_ids: list[uuid.UUID]) -> dict[uuid.UUID, AssessmentJob]:
        if not submission_ids:
            return {}
        rows = (
            await self.session.execute(
                select(AssessmentJob).where(AssessmentJob.submission_id.in_(submission_ids))
            )
        ).scalars().all()
        return {row.id: row for row in rows}

    async def _results_map(self, ids: list[uuid.UUID | None]) -> dict[uuid.UUID, AssessmentResult]:
        wanted = [item for item in ids if item]
        if not wanted:
            return {}
        rows = (
            await self.session.execute(select(AssessmentResult).where(AssessmentResult.id.in_(wanted)))
        ).scalars().all()
        return {row.id: row for row in rows}

    async def _attempts_map(self, ids: list[uuid.UUID | None]) -> dict[uuid.UUID, SubmissionAttempt]:
        wanted = [item for item in ids if item]
        if not wanted:
            return {}
        rows = (
            await self.session.execute(select(SubmissionAttempt).where(SubmissionAttempt.id.in_(wanted)))
        ).scalars().all()
        return {row.id: row for row in rows}
