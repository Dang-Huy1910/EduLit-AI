"""Teacher statistics: provisional (working) vs official (published) modes.

Counts and score aggregates are computed here. The AI insight worker only
narrates these numbers; it never invents totals, rates, or means.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
    User,
    UserRole,
)
from app.services.assessment_scoring import issue_occurrence_id, rubric_from_revision
from app.services.rubric import decimal_to_number, scale10

READY_TO_GRADE = SubmissionAttemptState.READY_TO_GRADE.value
JOB_QUEUED = AssessmentJobStatus.QUEUED.value
JOB_PROCESSING = AssessmentJobStatus.PROCESSING.value
JOB_READY = AssessmentJobStatus.READY.value
JOB_FAILED = AssessmentJobStatus.FAILED.value

MODE_PROVISIONAL = "provisional"
MODE_OFFICIAL = "official"

SCALE10_BINS: list[tuple[str, float, float, bool]] = [
    ("[0, 2)", 0.0, 2.0, False),
    ("[2, 4)", 2.0, 4.0, False),
    ("[4, 6)", 4.0, 6.0, False),
    ("[6, 8)", 6.0, 8.0, False),
    ("[8, 10]", 8.0, 10.0, True),
]

SCORE_FORMULA = {
    "scale": 10,
    "meanKind": "mean_of_scale10_results",
    "description": (
        "Mỗi học sinh/bài tập lấy một kết quả theo chế độ đang chọn, quy về thang 10 "
        "bằng (tổng / maxScore) × 10, rồi lấy trung bình các kết quả hợp lệ. "
        "Bài chưa có điểm không tính 0."
    ),
}


def normalize_mode(value: str | None) -> str | None:
    text = (value or "").strip().lower()
    if not text:
        return None
    if text in {MODE_PROVISIONAL, "draft", "working", "review", "tam_tinh", "tạm tính"}:
        return MODE_PROVISIONAL
    if text in {MODE_OFFICIAL, "published", "chinh_thuc", "chính thức"}:
        return MODE_OFFICIAL
    return None


def requested_mode(value: str | None) -> str | None:
    from app.core.errors import ERROR_MESSAGES
    from app.services.submission_errors import SubmissionError

    text = (value or "").strip()
    if not text:
        return None
    resolved = normalize_mode(text)
    if resolved is None:
        raise SubmissionError(400, "STATS_MODE", ERROR_MESSAGES["STATS_MODE"])
    return resolved


def suggest_mode(*, official_scored: int, provisional_scored: int) -> str:
    if official_scored <= 0 and provisional_scored > 0:
        return MODE_PROVISIONAL
    return MODE_OFFICIAL


def scale10_bin(value: float) -> str:
    if value >= 10.0:
        return "[8, 10]"
    if value < 0:
        value = 0.0
    if value < 2.0:
        return "[0, 2)"
    if value < 4.0:
        return "[2, 4)"
    if value < 6.0:
        return "[4, 6)"
    if value < 8.0:
        return "[6, 8)"
    return "[8, 10]"


def parse_time_bound(value: str | None, *, end: bool) -> datetime | None:
    text = (value or "").strip()
    if not text:
        return None
    if len(text) == 10 and text[4] == "-" and text[7] == "-":
        dt = datetime.fromisoformat(text).replace(tzinfo=timezone.utc)
        if end:
            return dt.replace(hour=23, minute=59, second=59, microsecond=999000)
        return dt
    parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def in_time_window(moment: datetime | None, start: datetime | None, end: datetime | None) -> bool:
    if start is None and end is None:
        return True
    if moment is None:
        return False
    if start is not None and moment < start:
        return False
    if end is not None and moment > end:
        return False
    return True


def working_payload(result: AssessmentResult | None) -> dict[str, Any] | None:
    if result is None:
        return None
    if isinstance(result.teacher_payload, dict) and result.teacher_payload:
        return result.teacher_payload
    if isinstance(result.ai_payload, dict) and result.ai_payload:
        return result.ai_payload
    return None


def published_payload(result: AssessmentResult | None) -> dict[str, Any] | None:
    if result is None or not result.is_published:
        return None
    if isinstance(result.published_payload, dict) and result.published_payload:
        return result.published_payload
    return None


def scores_from_payload(
    payload: dict[str, Any], result: AssessmentResult
) -> tuple[Decimal | None, Decimal | None, Decimal]:
    max_raw = payload.get("maxScore")
    max_score = Decimal(str(max_raw if max_raw is not None else result.max_score or 0))
    total_raw = payload.get("totalScore")
    if total_raw is None:
        total_raw = result.total_score
    if total_raw is None:
        return None, None, max_score
    total = Decimal(str(total_raw))
    scale_raw = payload.get("scoreScale10")
    if scale_raw is None:
        scale = scale10(total, max_score) if max_score > 0 else None
    else:
        scale = Decimal(str(scale_raw))
    return total, scale, max_score


def row_status(
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


def provisional_ready(
    attempt: SubmissionAttempt | None,
    job: AssessmentJob | None,
    result: AssessmentResult | None,
) -> bool:
    if attempt is None or attempt.state != READY_TO_GRADE or not attempt.official_submitted_at:
        return False
    if job is None or job.status != JOB_READY:
        return False
    if result is None or working_payload(result) is None:
        return False
    if result.attempt_id != attempt.id:
        return False
    if attempt.confirmed_revision_id and result.transcription_revision_id != attempt.confirmed_revision_id:
        return False
    return True


@dataclass
class PaperContext:
    assignment: Assignment
    revision: AssignmentRevision
    classroom: Classroom | None
    student: User
    submission: Submission | None
    attempt: SubmissionAttempt | None
    published_attempt: SubmissionAttempt | None
    job: AssessmentJob | None
    current_result: AssessmentResult | None
    published_result: AssessmentResult | None
    rubric: dict[str, Any]
    status: str = "not_submitted"

    @property
    def paper_key(self) -> tuple[uuid.UUID, uuid.UUID]:
        return (self.assignment.id, self.student.id)


@dataclass
class SelectedScore:
    total: Decimal
    scale10: Decimal
    max_score: Decimal
    payload: dict[str, Any]
    result: AssessmentResult
    official_submitted_at: datetime | None
    source: str


@dataclass
class IssueBucket:
    label: str = ""
    occurrence_count: int = 0
    students: set[uuid.UUID] = field(default_factory=set)
    papers: set[tuple[uuid.UUID, uuid.UUID]] = field(default_factory=set)
    sources: set[str] = field(default_factory=set)
    assignment_ids: set[uuid.UUID] = field(default_factory=set)


@dataclass
class CriterionBucket:
    group_key: str
    group_label: str
    criterion_id: str
    criterion_name: str
    awarded: list[Decimal] = field(default_factory=list)
    maxima: list[Decimal] = field(default_factory=list)


def empty_progress() -> dict[str, int]:
    return {
        "assigned": 0,
        "officialSubmitted": 0,
        "grading": 0,
        "awaitingReview": 0,
        "published": 0,
        "failed": 0,
        "processing": 0,
    }


def apply_operational_counts(counts: dict[str, int], status: str, *, official: bool, published: bool) -> None:
    if official:
        counts["officialSubmitted"] += 1
    if status in {"processing", "ocr_review", "grading", "new_version_grading"}:
        counts["processing"] += 1
        if status in {"grading", "new_version_grading"}:
            counts["grading"] += 1
    if status in {"awaiting_review", "new_version_review"}:
        counts["awaitingReview"] += 1
    if published:
        counts["published"] += 1
    if status in {"ocr_failed", "grading_failed", "new_version_failed"}:
        counts["failed"] += 1


NEW_VERSION_STATUSES = {
    "revising",
    "new_version_grading",
    "new_version_review",
    "new_version_failed",
}


def relevant_submit_at(paper: PaperContext, mode: str) -> datetime | None:
    if mode == MODE_OFFICIAL:
        if paper.published_attempt and paper.published_attempt.official_submitted_at:
            return paper.published_attempt.official_submitted_at
        if paper.published_result and paper.published_result.published_at:
            return paper.published_result.published_at
        return None
    if paper.attempt and paper.attempt.official_submitted_at:
        return paper.attempt.official_submitted_at
    return None


def is_official_submit(paper: PaperContext, mode: str) -> bool:
    attempt = paper.published_attempt if mode == MODE_OFFICIAL else paper.attempt
    return bool(attempt and attempt.state == READY_TO_GRADE and attempt.official_submitted_at)


def operational_status(paper: PaperContext, mode: str) -> str:
    if mode == MODE_OFFICIAL and paper.status in NEW_VERSION_STATUSES:
        if paper.published_result and paper.published_result.is_published:
            return "published"
    return paper.status


def select_score(paper: PaperContext, mode: str) -> SelectedScore | None:
    if mode == MODE_OFFICIAL:
        payload = published_payload(paper.published_result)
        if paper.published_result is None or payload is None:
            return None
        total, scale, max_score = scores_from_payload(payload, paper.published_result)
        if total is None or scale is None:
            return None
        moment = None
        if paper.published_attempt and paper.published_attempt.official_submitted_at:
            moment = paper.published_attempt.official_submitted_at
        elif paper.published_result.published_at:
            moment = paper.published_result.published_at
        return SelectedScore(
            total=total,
            scale10=scale,
            max_score=max_score,
            payload=payload,
            result=paper.published_result,
            official_submitted_at=moment,
            source="published",
        )
    if not provisional_ready(paper.attempt, paper.job, paper.current_result):
        return None
    assert paper.current_result is not None
    payload = working_payload(paper.current_result)
    if payload is None:
        return None
    total, scale, max_score = scores_from_payload(payload, paper.current_result)
    if total is None or scale is None:
        return None
    source = "teacher" if paper.current_result.teacher_payload else "ai"
    moment = paper.attempt.official_submitted_at if paper.attempt else None
    return SelectedScore(
        total=total,
        scale10=scale,
        max_score=max_score,
        payload=payload,
        result=paper.current_result,
        official_submitted_at=moment,
        source=source,
    )


def collect_issues_and_criteria(
    *,
    payload: dict[str, Any],
    student_id: uuid.UUID,
    assignment_id: uuid.UUID,
    group_key: str,
    group_label: str,
    issues: dict[str, IssueBucket],
    criteria: dict[tuple[str, str], CriterionBucket],
) -> None:
    seen_occ: set[str] = set()
    for ev in payload.get("evaluations") or []:
        if not isinstance(ev, dict):
            continue
        cid = str(ev.get("criterionId") or "").strip()
        cname = str(ev.get("criterionName") or cid or "Tiêu chí")
        awarded_raw = ev.get("awardedScore")
        max_raw = ev.get("maxScore")
        if cid and awarded_raw is not None and max_raw is not None:
            key = (group_key, cid)
            bucket = criteria.get(key)
            if bucket is None:
                bucket = CriterionBucket(
                    group_key=group_key,
                    group_label=group_label,
                    criterion_id=cid,
                    criterion_name=cname,
                )
                criteria[key] = bucket
            bucket.awarded.append(Decimal(str(awarded_raw)))
            bucket.maxima.append(Decimal(str(max_raw)))
        for issue in ev.get("issues") or []:
            if not isinstance(issue, dict):
                continue
            code = str(issue.get("code") or "").strip().upper() or "OTHER"
            kind = str(issue.get("kind") or "located")
            segs = []
            for item in issue.get("evidence") or []:
                if isinstance(item, dict) and item.get("segmentId"):
                    segs.append(str(item["segmentId"]))
            occ = str(issue.get("occurrenceId") or "").strip() or issue_occurrence_id(
                cid, code, kind, segs if kind == "located" else []
            )
            if occ in seen_occ:
                continue
            seen_occ.add(occ)
            bucket = issues.get(code)
            if bucket is None:
                bucket = IssueBucket(label=str(issue.get("message") or code))
                issues[code] = bucket
            elif not bucket.label:
                bucket.label = str(issue.get("message") or code)
            bucket.occurrence_count += 1
            bucket.students.add(student_id)
            bucket.papers.add((assignment_id, student_id))
            bucket.assignment_ids.add(assignment_id)
            src = str(issue.get("source") or "ai").strip() or "ai"
            bucket.sources.add("teacher" if src == "teacher" else "ai")


def serialize_issues(issues: dict[str, IssueBucket], denom: int) -> list[dict[str, Any]]:
    rows = []
    for code, bucket in sorted(issues.items(), key=lambda kv: (-kv[1].occurrence_count, kv[0])):
        sources = bucket.sources or {"ai"}
        if sources == {"teacher"}:
            source = "teacher"
        elif "teacher" in sources and "ai" in sources:
            source = "mixed"
        else:
            source = "ai"
        paper_n = len(bucket.papers)
        student_n = len(bucket.students)
        rows.append(
            {
                "code": code,
                "label": bucket.label or code,
                "occurrenceCount": bucket.occurrence_count,
                "paperCount": paper_n,
                "studentCount": student_n,
                "studentRate": (student_n / denom) if denom else None,
                "paperRate": (paper_n / denom) if denom else None,
                "denominator": denom,
                "source": source,
                "teacherConfirmed": source == "teacher",
                "assignmentCount": len(bucket.assignment_ids),
            }
        )
    return rows


def serialize_criteria(criteria: dict[tuple[str, str], CriterionBucket]) -> list[dict[str, Any]]:
    rows = []
    for key, bucket in sorted(criteria.items(), key=lambda kv: (kv[1].group_label, kv[0][1])):
        n = len(bucket.awarded)
        if n == 0:
            continue
        mean_awarded = sum(bucket.awarded, Decimal("0")) / Decimal(n)
        mean_max = sum(bucket.maxima, Decimal("0")) / Decimal(n)
        rates = []
        for awarded, maximum in zip(bucket.awarded, bucket.maxima, strict=False):
            if maximum > 0:
                rates.append(awarded / maximum)
        mean_rate = (sum(rates, Decimal("0")) / Decimal(len(rates))) if rates else None
        rows.append(
            {
                "groupKey": bucket.group_key,
                "groupLabel": bucket.group_label,
                "criterionId": bucket.criterion_id,
                "criterionName": bucket.criterion_name,
                "meanAwarded": decimal_to_number(mean_awarded),
                "meanMax": decimal_to_number(mean_max),
                "meanRate": decimal_to_number(mean_rate) if mean_rate is not None else None,
                "n": n,
            }
        )
    return rows


def build_distribution(scales: list[Decimal]) -> list[dict[str, Any]]:
    n = len(scales)
    counts = {label: 0 for label, *_ in SCALE10_BINS}
    for value in scales:
        counts[scale10_bin(float(value))] += 1
    rows = []
    for label, *_ in SCALE10_BINS:
        count = counts[label]
        rows.append(
            {
                "range": label,
                "label": "Thang 10",
                "count": count,
                "rate": (count / n) if n else None,
            }
        )
    return rows


def aggregate_scores(scales: list[Decimal], totals: list[Decimal] | None = None) -> dict[str, Any]:
    if not scales:
        mean10 = min10 = max10 = None
    else:
        n = Decimal(len(scales))
        mean10 = sum(scales, Decimal("0")) / n
        min10 = min(scales)
        max10 = max(scales)
    mean_raw = None
    if totals:
        mean_raw = sum(totals, Decimal("0")) / Decimal(len(totals))
    return {
        "scoredCount": len(scales),
        "meanScore": decimal_to_number(mean_raw) if mean_raw is not None else None,
        "meanScoreScale10": decimal_to_number(mean10) if mean10 is not None else None,
        "minScoreScale10": decimal_to_number(min10) if min10 is not None else None,
        "maxScoreScale10": decimal_to_number(max10) if max10 is not None else None,
        "distribution": build_distribution(scales),
        "scoreFormula": SCORE_FORMULA,
    }


class StatsEngine:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def submission_progress_for_revisions(
        self, revision_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, dict[str, int]]:
        wanted = [item for item in revision_ids if item]
        if not wanted:
            return {}
        access_rows = (
            await self.session.execute(
                select(AssignmentAccess.assignment_revision_id, AssignmentAccess.student_id).where(
                    AssignmentAccess.assignment_revision_id.in_(wanted),
                    AssignmentAccess.revoked_at.is_(None),
                )
            )
        ).all()
        assigned: dict[uuid.UUID, set[uuid.UUID]] = defaultdict(set)
        for revision_id, student_id in access_rows:
            assigned[revision_id].add(student_id)
        submissions = (
            await self.session.execute(select(Submission).where(Submission.assignment_revision_id.in_(wanted)))
        ).scalars().all()
        by_rev: dict[uuid.UUID, list[Submission]] = defaultdict(list)
        attempt_ids: list[uuid.UUID] = []
        job_ids: list[uuid.UUID] = []
        result_ids: list[uuid.UUID] = []
        for sub in submissions:
            by_rev[sub.assignment_revision_id].append(sub)
            if sub.current_attempt_id:
                attempt_ids.append(sub.current_attempt_id)
            if sub.current_assessment_job_id:
                job_ids.append(sub.current_assessment_job_id)
            if sub.current_published_result_id:
                result_ids.append(sub.current_published_result_id)
        attempts = await self._map_attempts(attempt_ids)
        jobs = await self._map_jobs(job_ids)
        results = await self._map_results(result_ids)
        out: dict[uuid.UUID, dict[str, int]] = {}
        for revision_id in wanted:
            counts = empty_progress()
            students = assigned.get(revision_id, set())
            counts["assigned"] = len(students)
            seen: set[uuid.UUID] = set()
            for sub in by_rev.get(revision_id, []):
                seen.add(sub.student_id)
                attempt = attempts.get(sub.current_attempt_id) if sub.current_attempt_id else None
                job = jobs.get(sub.current_assessment_job_id) if sub.current_assessment_job_id else None
                published = results.get(sub.current_published_result_id) if sub.current_published_result_id else None
                status = row_status(attempt=attempt, job=job, published=published)
                official = bool(attempt and attempt.state == READY_TO_GRADE and attempt.official_submitted_at)
                apply_operational_counts(
                    counts, status, official=official, published=bool(published and published.is_published)
                )
            out[revision_id] = counts
        return out

    async def papers_for_assignment(
        self,
        assignment: Assignment,
        revision: AssignmentRevision,
        classroom: Classroom | None,
        *,
        student_id: uuid.UUID | None = None,
    ) -> list[PaperContext]:
        students = await self._assigned_students(revision.id, student_id=student_id)
        return await self._papers(assignment, revision, classroom, students)

    async def papers_for_assignments(
        self,
        items: list[tuple[Assignment, AssignmentRevision, Classroom | None]],
        *,
        student_id: uuid.UUID | None = None,
    ) -> list[PaperContext]:
        papers: list[PaperContext] = []
        for assignment, revision, classroom in items:
            papers.extend(
                await self.papers_for_assignment(assignment, revision, classroom, student_id=student_id)
            )
        return papers

    def compute(
        self,
        papers: list[PaperContext],
        *,
        mode: str,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> dict[str, Any]:
        counts = empty_progress()
        assigned_students: set[uuid.UUID] = set()
        assignment_ids: set[uuid.UUID] = set()
        scales: list[Decimal] = []
        totals: list[Decimal] = []
        maxima: list[Decimal] = []
        issues: dict[str, IssueBucket] = {}
        criteria: dict[tuple[str, str], CriterionBucket] = {}
        per_assignment: dict[uuid.UUID, dict[str, Any]] = {}
        student_scores: dict[uuid.UUID, list[tuple[datetime | None, uuid.UUID, Decimal, dict[str, Any]]]] = defaultdict(
            list
        )

        for paper in papers:
            assigned_students.add(paper.student.id)
            assignment_ids.add(paper.assignment.id)
            info = per_assignment.setdefault(
                paper.assignment.id,
                {
                    "id": str(paper.assignment.id),
                    "code": paper.assignment.code,
                    "title": paper.assignment.title,
                    "classroomId": str(paper.assignment.classroom_id) if paper.assignment.classroom_id else None,
                    "classroomName": paper.classroom.name if paper.classroom else None,
                    "maxScore": decimal_to_number(Decimal(str(paper.rubric.get("maxScore") or paper.assignment.max_score))),
                    "scoreStep": paper.rubric.get("scoreStep"),
                    "rubricTitle": paper.rubric.get("title") or "",
                    "genre": (paper.revision.snapshot or {}).get("genre") or paper.revision.genre,
                    "writingTask": (paper.revision.snapshot or {}).get("writingTask") or "",
                    "publishedAt": paper.assignment.published_at.isoformat() if paper.assignment.published_at else None,
                    "assigned": 0,
                    "officialSubmitted": 0,
                    "scoredCount": 0,
                    "meanScoreScale10": None,
                    "_scales": [],
                },
            )
            info["assigned"] += 1
            published_live = bool(paper.published_result and paper.published_result.is_published)
            if mode == MODE_OFFICIAL and not published_live:
                continue
            selected = select_score(paper, mode)
            moment = selected.official_submitted_at if selected else relevant_submit_at(paper, mode)
            if not in_time_window(moment, start, end):
                continue
            official = is_official_submit(paper, mode)
            apply_operational_counts(
                counts,
                operational_status(paper, mode),
                official=official,
                published=published_live,
            )
            if official:
                info["officialSubmitted"] += 1
            if selected is None:
                continue
            scales.append(selected.scale10)
            totals.append(selected.total)
            maxima.append(selected.max_score)
            info["_scales"].append(selected.scale10)
            info["scoredCount"] += 1
            rubric_title = paper.rubric.get("title") or paper.assignment.title
            collect_issues_and_criteria(
                payload=selected.payload,
                student_id=paper.student.id,
                assignment_id=paper.assignment.id,
                group_key=f"{paper.assignment.id}:{rubric_title}",
                group_label=f"{paper.assignment.title} · {rubric_title}",
                issues=issues,
                criteria=criteria,
            )
            student_scores[paper.student.id].append(
                (
                    selected.official_submitted_at or paper.assignment.published_at,
                    paper.assignment.id,
                    selected.scale10,
                    {
                        "assignmentId": str(paper.assignment.id),
                        "code": paper.assignment.code,
                        "title": paper.assignment.title,
                        "score": decimal_to_number(selected.total),
                        "scoreScale10": decimal_to_number(selected.scale10),
                        "maxScore": decimal_to_number(selected.max_score),
                        "status": paper.status,
                        "isPublished": published_live,
                        "officialSubmittedAt": selected.official_submitted_at.isoformat()
                        if selected.official_submitted_at
                        else None,
                    },
                )
            )

        counts["assigned"] = len(papers)
        mixed_max = len({round(float(item), 4) for item in maxima}) > 1
        score_stats = aggregate_scores(scales, None if mixed_max else totals)
        trend = []
        for assignment_id in sorted(per_assignment, key=lambda k: per_assignment[k].get("publishedAt") or ""):
            info = per_assignment[assignment_id]
            local_scales: list[Decimal] = info.pop("_scales")
            if local_scales:
                info["meanScoreScale10"] = decimal_to_number(
                    sum(local_scales, Decimal("0")) / Decimal(len(local_scales))
                )
            trend.append(info)

        recurring = [
            row
            for row in serialize_issues(issues, score_stats["scoredCount"])
            if row["assignmentCount"] >= 2
        ]
        weak = sorted(
            [row for row in serialize_criteria(criteria) if row["meanRate"] is not None],
            key=lambda row: (row["meanRate"], row["criterionName"]),
        )[:6]
        strengths = sorted(
            [row for row in serialize_criteria(criteria) if row["meanRate"] is not None and row["n"] >= 2],
            key=lambda row: (-row["meanRate"], row["criterionName"]),
        )[:4]

        return {
            "mode": mode,
            "counts": {
                **counts,
                "assignedStudents": len(assigned_students),
                "assignedPapers": len(papers),
                "assignmentCount": len(assignment_ids),
                "scoredCount": score_stats["scoredCount"],
            },
            **score_stats,
            "issues": serialize_issues(issues, score_stats["scoredCount"]),
            "criteria": serialize_criteria(criteria),
            "recurringIssues": recurring,
            "weakCriteria": weak,
            "strengths": strengths,
            "trend": trend,
            "studentScores": student_scores,
            "maxScore": trend[0]["maxScore"] if len(trend) == 1 else 10,
        }

    def student_rows_for_assignment(
        self,
        papers: list[PaperContext],
        *,
        mode: str,
        search: str = "",
        status: str = "all",
        sort: str = "default",
        page: int = 1,
        page_size: int = 10,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> dict[str, Any]:
        rows: list[dict[str, Any]] = []
        for paper in papers:
            selected = select_score(paper, mode)
            in_window = True
            if start or end:
                moment = selected.official_submitted_at if selected else relevant_submit_at(paper, mode)
                in_window = in_time_window(moment, start, end)
            working = None
            working10 = None
            if provisional_ready(paper.attempt, paper.job, paper.current_result) and paper.current_result:
                payload = working_payload(paper.current_result)
                if payload:
                    total, scale, _max = scores_from_payload(payload, paper.current_result)
                    working = decimal_to_number(total) if total is not None else None
                    working10 = decimal_to_number(scale) if scale is not None else None
            published_score = None
            published10 = None
            pub_payload = published_payload(paper.published_result)
            if paper.published_result and pub_payload:
                total, scale, _max = scores_from_payload(pub_payload, paper.published_result)
                published_score = decimal_to_number(total) if total is not None else None
                published10 = decimal_to_number(scale) if scale is not None else None
            score = decimal_to_number(selected.total) if selected and in_window else None
            scale = decimal_to_number(selected.scale10) if selected and in_window else None
            rows.append(
                {
                    "studentId": str(paper.student.id),
                    "name": paper.student.display_name,
                    "code": paper.student.login_id,
                    "status": paper.status,
                    "pageCount": paper.attempt.page_count if paper.attempt else 0,
                    "officialSubmittedAt": paper.attempt.official_submitted_at.isoformat()
                    if paper.attempt and paper.attempt.official_submitted_at
                    else None,
                    "ocrSubmittedAt": paper.attempt.submitted_at.isoformat()
                    if paper.attempt and paper.attempt.submitted_at
                    else None,
                    "score": score,
                    "scoreScale10": scale,
                    "workingScore": working,
                    "workingScoreScale10": working10,
                    "publishedScore": published_score,
                    "publishedScoreScale10": published10,
                    "isPublished": bool(paper.published_result and paper.published_result.is_published),
                    "hasNewUnpublishedVersion": bool(
                        paper.published_result
                        and paper.published_result.is_published
                        and paper.attempt
                        and paper.attempt.confirmed_revision_id
                        and paper.published_result.transcription_revision_id != paper.attempt.confirmed_revision_id
                    ),
                    "scoreSource": selected.source if selected and in_window else None,
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
        start_i = (page - 1) * page_size
        return {
            "items": filtered[start_i : start_i + page_size],
            "page": page,
            "pageSize": page_size,
            "total": total,
            "totalPages": pages,
        }

    def competency_student_rows(
        self,
        papers: list[PaperContext],
        computed: dict[str, Any],
        *,
        search: str = "",
        sort: str = "default",
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        by_student: dict[uuid.UUID, dict[str, Any]] = {}
        student_scores: dict[uuid.UUID, list] = computed.get("studentScores") or {}
        assignment_order = [item["id"] for item in computed.get("trend") or []]
        for paper in papers:
            row = by_student.get(paper.student.id)
            if row is None:
                row = {
                    "studentId": str(paper.student.id),
                    "name": paper.student.display_name,
                    "code": paper.student.login_id,
                    "assignedCount": 0,
                    "resultCount": 0,
                    "meanScoreScale10": None,
                    "trend": None,
                    "assignments": [],
                }
                by_student[paper.student.id] = row
            row["assignedCount"] += 1
        for student_id, scores in student_scores.items():
            row = by_student.get(student_id)
            if row is None:
                continue
            ordered = sorted(scores, key=lambda item: (item[0] is None, item[0] or datetime.min.replace(tzinfo=timezone.utc)))
            row["resultCount"] = len(ordered)
            if ordered:
                mean = sum((item[2] for item in ordered), Decimal("0")) / Decimal(len(ordered))
                row["meanScoreScale10"] = decimal_to_number(mean)
            if len(ordered) >= 2:
                first = float(ordered[0][2])
                last = float(ordered[-1][2])
                if last - first >= 0.25:
                    row["trend"] = "up"
                elif first - last >= 0.25:
                    row["trend"] = "down"
                else:
                    row["trend"] = "flat"
            else:
                row["trend"] = None
            by_id = {str(item[1]): item[3] for item in ordered}
            row["assignments"] = [by_id[aid] for aid in assignment_order if aid in by_id]
            extras = [item[3] for item in ordered if str(item[1]) not in assignment_order]
            row["assignments"].extend(extras)
        rows = list(by_student.values())
        needle = (search or "").strip().lower()
        if needle:
            rows = [row for row in rows if needle in row["name"].lower() or needle in row["code"].lower()]
        if sort == "score_desc":
            rows.sort(key=lambda r: (r["meanScoreScale10"] is None, -(r["meanScoreScale10"] or 0), r["name"]))
        elif sort == "score_asc":
            rows.sort(key=lambda r: (r["meanScoreScale10"] is None, r["meanScoreScale10"] or 0, r["name"]))
        else:
            rows.sort(key=lambda r: r["name"])
        page = max(1, int(page or 1))
        page_size = min(50, max(1, int(page_size or 20)))
        total = len(rows)
        pages = max(1, (total + page_size - 1) // page_size)
        page = min(page, pages)
        start_i = (page - 1) * page_size
        return {
            "items": rows[start_i : start_i + page_size],
            "page": page,
            "pageSize": page_size,
            "total": total,
            "totalPages": pages,
        }

    async def _papers(
        self,
        assignment: Assignment,
        revision: AssignmentRevision,
        classroom: Classroom | None,
        students: list[User],
    ) -> list[PaperContext]:
        submissions = await self._submissions_map(revision.id)
        attempt_ids: list[uuid.UUID] = []
        job_ids: list[uuid.UUID] = []
        result_ids: list[uuid.UUID] = []
        for sub in submissions.values():
            if sub.current_attempt_id:
                attempt_ids.append(sub.current_attempt_id)
            if sub.current_assessment_job_id:
                job_ids.append(sub.current_assessment_job_id)
            if sub.current_assessment_result_id:
                result_ids.append(sub.current_assessment_result_id)
            if sub.current_published_result_id:
                result_ids.append(sub.current_published_result_id)
        jobs = await self._map_jobs(job_ids)
        results = await self._map_results(result_ids)
        for result in results.values():
            if result.attempt_id:
                attempt_ids.append(result.attempt_id)
        attempts = await self._map_attempts(attempt_ids)
        try:
            rubric = rubric_from_revision(revision.rubric, revision.snapshot)
        except Exception:
            rubric = {
                "title": "",
                "maxScore": float(assignment.max_score or 0),
                "scoreStep": float(assignment.score_step or 0),
                "criteria": [],
            }
        papers: list[PaperContext] = []
        for student in students:
            sub = submissions.get(student.id)
            attempt = attempts.get(sub.current_attempt_id) if sub and sub.current_attempt_id else None
            job = jobs.get(sub.current_assessment_job_id) if sub and sub.current_assessment_job_id else None
            current = results.get(sub.current_assessment_result_id) if sub and sub.current_assessment_result_id else None
            published = results.get(sub.current_published_result_id) if sub and sub.current_published_result_id else None
            published_attempt = None
            if published and published.attempt_id:
                published_attempt = attempts.get(published.attempt_id)
            status = row_status(attempt=attempt, job=job, published=published)
            papers.append(
                PaperContext(
                    assignment=assignment,
                    revision=revision,
                    classroom=classroom,
                    student=student,
                    submission=sub,
                    attempt=attempt,
                    published_attempt=published_attempt,
                    job=job,
                    current_result=current,
                    published_result=published,
                    rubric=rubric,
                    status=status,
                )
            )
        return papers

    async def _assigned_students(
        self, revision_id: uuid.UUID, *, student_id: uuid.UUID | None = None
    ) -> list[User]:
        stmt = (
            select(User)
            .join(AssignmentAccess, AssignmentAccess.student_id == User.id)
            .where(
                AssignmentAccess.assignment_revision_id == revision_id,
                AssignmentAccess.revoked_at.is_(None),
                User.role == UserRole.STUDENT,
            )
            .order_by(User.display_name.asc())
        )
        if student_id:
            stmt = stmt.where(User.id == student_id)
        return list((await self.session.execute(stmt)).scalars().all())

    async def _submissions_map(self, revision_id: uuid.UUID) -> dict[uuid.UUID, Submission]:
        rows = (
            await self.session.execute(select(Submission).where(Submission.assignment_revision_id == revision_id))
        ).scalars().all()
        return {row.student_id: row for row in rows}

    async def _map_jobs(self, ids: list[uuid.UUID]) -> dict[uuid.UUID, AssessmentJob]:
        wanted = list({item for item in ids if item})
        if not wanted:
            return {}
        rows = (await self.session.execute(select(AssessmentJob).where(AssessmentJob.id.in_(wanted)))).scalars().all()
        return {row.id: row for row in rows}

    async def _map_results(self, ids: list[uuid.UUID]) -> dict[uuid.UUID, AssessmentResult]:
        wanted = list({item for item in ids if item})
        if not wanted:
            return {}
        rows = (
            await self.session.execute(select(AssessmentResult).where(AssessmentResult.id.in_(wanted)))
        ).scalars().all()
        return {row.id: row for row in rows}

    async def _map_attempts(self, ids: list[uuid.UUID]) -> dict[uuid.UUID, SubmissionAttempt]:
        wanted = list({item for item in ids if item})
        if not wanted:
            return {}
        rows = (
            await self.session.execute(select(SubmissionAttempt).where(SubmissionAttempt.id.in_(wanted)))
        ).scalars().all()
        return {row.id: row for row in rows}


def filter_fingerprint(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def insight_scope_key(*, kind: str, assignment_id: uuid.UUID | None, fingerprint: str) -> str:
    if kind == "assignment" and assignment_id:
        return f"assignment:{assignment_id}:{fingerprint[:24]}"
    return f"competency:{fingerprint[:40]}"


def insight_input_hash(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
