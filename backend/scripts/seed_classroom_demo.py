"""Seed lớp 11A14 demo from frontend mock data.

Additive and idempotent. Does not reset the live database and does not call AI.

Creates/updates:
- 41 student accounts from roster_11a14.json (password HocSinh@2024)
- memberships in classroom 11A14 (owned by dang.loan)
- published assignment VAN11-NLVH-01 with the 4-criterion GDPT rubric
- 41 official submissions (pages + confirmed OCR + published grades)
- READY outline-prep rows so the outline worker does not call a live model
- cached class insight for the default official report filters

Usage (from backend/):
  uv run python scripts/seed_classroom_demo.py
  uv run python scripts/seed_classroom_demo.py --apply
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
REPO_ROOT = BACKEND_DIR.parent
FRONTEND_ROOT = REPO_ROOT / "frontend"
MOCK_DIR = FRONTEND_ROOT / "src" / "lib" / "mock"
PUBLIC_ROOT = FRONTEND_ROOT / "public"

sys.path.insert(0, str(SCRIPT_DIR))

from seed_demo import (  # noqa: E402
    RUBRIC_4D_CRITERIA,
    seed_catalog,
    seed_classroom,
    seed_student,
    seed_teacher,
)

from app.ai.schemas import ASSESSMENT_OUTPUT_SCHEMA_VERSION, CLASS_INSIGHT_SCHEMA_VERSION  # noqa: E402
from app.config import Settings, get_settings  # noqa: E402
from app.core.http import utcnow  # noqa: E402
from app.core.passwords import hash_password_sync  # noqa: E402
from app.db.models import (  # noqa: E402
    AssessmentJob,
    AssessmentJobStatus,
    AssessmentResult,
    Assignment,
    AssignmentAccess,
    AssignmentRevision,
    ClassInsight,
    ClassInsightStatus,
    ClassMembership,
    Classroom,
    OcrResult,
    OutlinePrepStatus,
    PageBlobKind,
    Rubric,
    RubricVersion,
    SourcePrompt,
    StudentOutlinePrep,
    Submission,
    SubmissionAttempt,
    SubmissionAttemptState,
    SubmissionPage,
    SubmissionPageBlob,
    TranscriptionRevision,
    TranscriptionRevisionStatus,
    User,
    UserRole,
    UserStatus,
)
from app.db.session import get_session_factory  # noqa: E402
from app.identity.domain import normalize_email, normalize_login_id  # noqa: E402
from app.services.assessment_scoring import finalize_payload, rubric_from_revision  # noqa: E402
from app.services.assignment_service import AssignmentService  # noqa: E402
from app.services.ocr_normalize import materialize_page  # noqa: E402
from app.services.report_service import ReportService  # noqa: E402
from app.services.rubric import assignment_rubric_document  # noqa: E402
from app.services.stats_engine import (  # noqa: E402
    MODE_OFFICIAL,
    filter_fingerprint,
    insight_input_hash,
    insight_scope_key,
)
from app.ai.schemas import OcrPageModel, OcrSegmentModel  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("seed_classroom_demo")

DEMO_PASSWORD = "HocSinh@2024"
DEMO_ASSIGNMENT_CODE = "VAN11-NLVH-01"
DEMO_ASSIGNMENT_TITLE = 'Phân tích "Màu tự do của đất" — Trần Quang Quý'
PROMPT_TITLE = 'Cảm nhận tự do trong "Màu tự do của đất"'
CLASS_CODE = "11A14"
TZ_VN = ZoneInfo("Asia/Ho_Chi_Minh")
DUE_AT = datetime(2026, 10, 28, 23, 59, tzinfo=TZ_VN)
CRITERION_ID_MAP = {"C4_STRUCTURE_FORMAT": "C4_STRUCTURE_PRESENTATION"}
DEMO_PROVIDER = "demo"
DEMO_MODEL = "mock/classroom-demo"

WRITING_TASK = (
    'Viết bài văn nghị luận (khoảng 600 chữ) phân tích cách nhà thơ Trần Quang Quý cảm nhận '
    '"tự do" qua những hình ảnh làng quê trong bài thơ "Màu tự do của đất", đồng thời liên hệ '
    "với một bài thơ hoặc đoạn thơ khác viết về làng quê, đồng ruộng để làm rõ cách nhìn riêng "
    "của tác giả."
)

DEMO_OUTLINE: dict[str, Any] = {
    "thesis": (
        "Trần Quang Quý cảm nhận tự do qua hình ảnh làng quê: tự do đầu tiên "
        "là không thoát ly bùn đất."
    ),
    "sections": [
        {
            "id": "intro",
            "title": "I. Mở bài — Đặt vấn đề",
            "points": [
                {
                    "id": "intro-1",
                    "text": (
                        'Đặt bài thơ "Màu tự do của đất" vào vấn đề cảm nhận tự do '
                        "qua hình ảnh làng quê."
                    ),
                    "kind": "claim",
                    "source_chunk_id": None,
                }
            ],
        },
        {
            "id": "body",
            "title": "II. Thân bài — Triển khai luận điểm",
            "points": [
                {
                    "id": "body-1",
                    "text": (
                        "Làng quê được cảm nhận bằng khứu giác và hơi thở: khói rơm rạ, "
                        "hít thở mầu tự do của đất."
                    ),
                    "kind": "evidence",
                    "source_chunk_id": None,
                },
                {
                    "id": "body-2",
                    "text": (
                        "Ràng buộc như cội rễ: cây cột tâm thức làng, mái đình cong "
                        "câu ngược tầm nhìn."
                    ),
                    "kind": "claim",
                    "source_chunk_id": None,
                },
                {
                    "id": "body-3",
                    "text": (
                        "Nghịch lí trung tâm: thèm giải phóng khỏi nhọc nhằn cơ bắp "
                        "nhưng tự do đầu tiên là không thoát ly bùn đất."
                    ),
                    "kind": "claim",
                    "source_chunk_id": None,
                },
                {
                    "id": "body-4",
                    "text": "Nghệ thuật chuỗi buộc – neo – cởi và kết cấu vòng tròn ngọn khói.",
                    "kind": "evidence",
                    "source_chunk_id": None,
                },
                {
                    "id": "body-5",
                    "text": (
                        "Liên hệ Bếp lửa (Bằng Việt) hoặc Quê hương (Tế Hanh) để làm rõ "
                        "nét riêng của Trần Quang Quý."
                    ),
                    "kind": "claim",
                    "source_chunk_id": None,
                },
            ],
        },
        {
            "id": "conclusion",
            "title": "III. Kết bài — Đánh giá & Thông điệp",
            "points": [
                {
                    "id": "conc-1",
                    "text": (
                        "Khái quát đóng góp của hình ảnh làng quê và cách nhìn tự do gắn với cội rễ."
                    ),
                    "kind": "claim",
                    "source_chunk_id": None,
                }
            ],
        },
    ],
    "arguments": [],
    "counterArguments": [],
}


def load_json_export(path: Path, export_name: str) -> Any:
    text = path.read_text(encoding="utf-8")
    marker = f"export const {export_name}"
    start_token = text.index(marker)
    brace = text.index("{", start_token)
    depth = 0
    end = None
    for index, char in enumerate(text[brace:], brace):
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                end = index + 1
                break
    if end is None:
        raise RuntimeError(f"Could not parse {export_name} from {path}")
    return json.loads(text[brace:end])


def jpeg_size(data: bytes) -> tuple[int, int]:
    if len(data) < 4 or data[0:2] != b"\xff\xd8":
        return 0, 0
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in {0xC0, 0xC1, 0xC2, 0xC3}:
            height = int.from_bytes(data[i + 5 : i + 7], "big")
            width = int.from_bytes(data[i + 7 : i + 9], "big")
            return width, height
        if marker in {0xD8, 0xD9, 0x01} or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        seglen = int.from_bytes(data[i + 2 : i + 4], "big")
        if seglen < 2:
            break
        i += 2 + seglen
    return 0, 0


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_vn_datetime(raw: str | None) -> datetime:
    if not raw:
        return datetime(2026, 10, 24, 15, 0, tzinfo=TZ_VN)
    try:
        return datetime.strptime(raw.strip(), "%d/%m/%Y %H:%M").replace(tzinfo=TZ_VN)
    except ValueError:
        return datetime(2026, 10, 24, 15, 0, tzinfo=TZ_VN)


def load_roster() -> list[dict[str, Any]]:
    data = json.loads((MOCK_DIR / "roster_11a14.json").read_text(encoding="utf-8"))
    if len(data) != 41:
        raise RuntimeError(f"Expected 41 roster students, got {len(data)}")
    return data


def load_central_submissions() -> dict[str, dict[str, Any]]:
    payload = load_json_export(MOCK_DIR / "submissionsManifest.ts", "INITIAL_SUBMISSIONS")
    by_student: dict[str, dict[str, Any]] = {}
    for item in payload.values():
        if item.get("assignmentId") != "assign-nlvh-mau-tu-do-dat":
            continue
        student_id = str(item.get("studentId") or "")
        preferred = f"sub-{student_id}"
        current = by_student.get(student_id)
        if current is None or item.get("id") == preferred:
            by_student[student_id] = item
    return by_student


def rubric_document() -> dict[str, Any]:
    return assignment_rubric_document(
        {
            "title": "Barem chuẩn 4 tiêu chí (Bộ GD&ĐT)",
            "shortTitle": "Barem 4 tiêu chí",
            "description": (
                "Khung ma trận 4 tiêu chí chuẩn của Bộ GD&ĐT. "
                "Weight là điểm tối đa, không phải hệ số nhân."
            ),
            "version": "v2.0-GDPT2018",
            "gradeLevel": 11,
            "maxScore": 4,
            "scoreStep": 0.05,
            "criteria": RUBRIC_4D_CRITERIA,
        }
    )


def mapped_criterion_id(raw: str) -> str:
    return CRITERION_ID_MAP.get(raw, raw)


def build_grade_output(submission: dict[str, Any]) -> dict[str, Any]:
    evaluations = []
    for item in submission.get("evaluations") or []:
        cid = mapped_criterion_id(str(item.get("criterionId") or ""))
        evaluations.append(
            {
                "criterionId": cid,
                "awardedScore": item.get("awardedScore"),
                "comment": item.get("comment") or "",
                "strengths": item.get("strengths") or [],
                "weaknesses": item.get("weaknesses") or [],
                "missingElements": item.get("missingElements") or [],
                "issues": [],
            }
        )
    guidance = [
        str(task.get("description") or "").strip()
        for task in submission.get("pedagogicalTasks") or []
        if str(task.get("description") or "").strip()
    ]
    overall = str(submission.get("teacherNotes") or "").strip()
    if not overall:
        overall = "Bài đã chấm theo barem demo; giáo viên xem nhận xét từng tiêu chí."
    return {
        "evaluations": evaluations,
        "overallComment": overall,
        "improvementGuidance": guidance,
    }


def transcription_pages_from_lines(
    pages_meta: list[SubmissionPage], lines_by_index: dict[int, list[str]]
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for page in sorted(pages_meta, key=lambda item: item.page_index):
        lines = lines_by_index.get(page.page_index) or []
        segments = [
            OcrSegmentModel(order=offset, text=line, needs_review=False)
            for offset, line in enumerate(lines, start=1)
            if str(line).strip()
        ]
        model = OcrPageModel(segments=segments, needs_review=False)
        out.append(
            materialize_page(page_id=page.id, page_index=page.page_index, model_page=model)
        )
    return out


async def get_or_create_student(
    session: AsyncSession,
    *,
    login_id: str,
    email: str,
    display_name: str,
    password_hash: str,
    counts: dict[str, int],
) -> User:
    result = await session.execute(select(User).where(User.login_id == login_id))
    user = result.scalar_one_or_none()
    if user is None:
        by_email = await session.execute(select(User).where(User.email == email))
        user = by_email.scalar_one_or_none()
    if user is None:
        user = User(
            login_id=login_id,
            email=email,
            display_name=display_name,
            password_hash=password_hash,
            role=UserRole.STUDENT,
            status=UserStatus.ACTIVE,
            email_verified_at=utcnow(),
        )
        session.add(user)
        await session.flush()
        counts["students_created"] += 1
        logger.info("Created student %s (%s)", login_id, display_name)
        return user
    user.display_name = display_name
    user.email = email
    user.role = UserRole.STUDENT
    user.status = UserStatus.ACTIVE
    user.email_verified_at = user.email_verified_at or utcnow()
    counts["students_existing"] += 1
    return user


async def ensure_membership(
    session: AsyncSession, classroom: Classroom, user: User, role: str, counts: dict[str, int]
) -> None:
    existing = await session.execute(
        select(ClassMembership).where(
            ClassMembership.classroom_id == classroom.id,
            ClassMembership.user_id == user.id,
        )
    )
    row = existing.scalar_one_or_none()
    if row is None:
        session.add(
            ClassMembership(
                classroom_id=classroom.id,
                user_id=user.id,
                membership_role=role,
                status="ACTIVE",
            )
        )
        counts["memberships_created"] += 1
        return
    row.status = "ACTIVE"
    row.membership_role = role


async def ensure_access(
    session: AsyncSession, revision: AssignmentRevision, student: User, counts: dict[str, int]
) -> None:
    existing = await session.execute(
        select(AssignmentAccess).where(
            AssignmentAccess.assignment_revision_id == revision.id,
            AssignmentAccess.student_id == student.id,
        )
    )
    access = existing.scalar_one_or_none()
    if access is None:
        session.add(
            AssignmentAccess(assignment_revision_id=revision.id, student_id=student.id)
        )
        counts["access_created"] += 1
        return
    if access.revoked_at is not None:
        access.revoked_at = None
        counts["access_restored"] += 1


async def ensure_outline_prep(
    session: AsyncSession, revision: AssignmentRevision, student: User, counts: dict[str, int]
) -> None:
    existing = await session.execute(
        select(StudentOutlinePrep).where(
            StudentOutlinePrep.assignment_revision_id == revision.id,
            StudentOutlinePrep.student_id == student.id,
        )
    )
    prep = existing.scalar_one_or_none()
    now = utcnow()
    if prep is None:
        session.add(
            StudentOutlinePrep(
                assignment_revision_id=revision.id,
                student_id=student.id,
                status=OutlinePrepStatus.READY.value,
                outline=DEMO_OUTLINE,
                sources=[],
                message="Đây là dàn ý gợi ý theo đề; em có thể hỏi để hiểu hoặc nhờ chỉnh sửa.",
                needs_clarification=False,
                model_metadata={
                    "provider": DEMO_PROVIDER,
                    "model": DEMO_MODEL,
                    "source": "classroom-demo-seed",
                },
                attempt_count=1,
                finished_at=now,
            )
        )
        counts["outlines_created"] += 1
        return
    if prep.status != OutlinePrepStatus.READY.value or not prep.outline:
        prep.status = OutlinePrepStatus.READY.value
        prep.outline = DEMO_OUTLINE
        prep.sources = []
        prep.needs_clarification = False
        prep.clarification_question = None
        prep.last_error = None
        prep.lease_token = None
        prep.lease_expires_at = None
        prep.finished_at = now
        prep.updated_at = now
        counts["outlines_updated"] += 1


async def get_or_create_assignment(
    session: AsyncSession,
    teacher: User,
    classroom: Classroom,
    student_ids: list[str],
    counts: dict[str, int],
) -> tuple[Assignment, AssignmentRevision]:
    await seed_catalog(session, teacher)
    prompt = (
        await session.execute(
            select(SourcePrompt).where(
                SourcePrompt.owner_teacher_id == teacher.id,
                SourcePrompt.title == PROMPT_TITLE,
            )
        )
    ).scalar_one_or_none()
    if prompt is None:
        raise RuntimeError(f"Missing source prompt {PROMPT_TITLE!r} after catalog seed")

    rubric_row = (
        await session.execute(
            select(Rubric).where(
                Rubric.owner_teacher_id == teacher.id,
                Rubric.title.like("%4 tiêu chí%"),
            )
        )
    ).scalar_one_or_none()
    rubric_version = None
    if rubric_row is not None:
        rubric_version = (
            await session.execute(
                select(RubricVersion)
                .where(RubricVersion.rubric_id == rubric_row.id)
                .order_by(RubricVersion.version.desc())
            )
        ).scalars().first()

    rubric_doc = rubric_document()
    existing = (
        await session.execute(
            select(Assignment).where(
                Assignment.teacher_id == teacher.id,
                Assignment.code == DEMO_ASSIGNMENT_CODE,
            )
        )
    ).scalar_one_or_none()
    now = utcnow()
    if existing is None:
        assignment = Assignment(
            teacher_id=teacher.id,
            classroom_id=classroom.id,
            source_prompt_id=prompt.id,
            rubric_id=rubric_row.id if rubric_row else None,
            rubric_version_id=rubric_version.id if rubric_version else None,
            title=DEMO_ASSIGNMENT_TITLE,
            extra_instructions="",
            assignment_rubric=rubric_doc,
            max_score=rubric_doc["maxScore"],
            score_step=rubric_doc["scoreStep"],
            due_at=DUE_AT,
            code=DEMO_ASSIGNMENT_CODE,
            status="DRAFT",
            recipient_student_ids=student_ids,
        )
        session.add(assignment)
        await session.flush()
        counts["assignment_created"] += 1
    else:
        assignment = existing
        assignment.classroom_id = classroom.id
        assignment.source_prompt_id = prompt.id
        assignment.title = DEMO_ASSIGNMENT_TITLE
        assignment.assignment_rubric = rubric_doc
        assignment.max_score = rubric_doc["maxScore"]
        assignment.score_step = rubric_doc["scoreStep"]
        assignment.due_at = DUE_AT
        assignment.recipient_student_ids = student_ids
        assignment.updated_at = now
        counts["assignment_existing"] += 1

    asvc = AssignmentService(session)
    prompt_payload = await asvc.catalog._prompt_dict(prompt, full=True)
    chunks = asvc._snapshot_chunks(prompt_payload)
    snapshot = {
        "assignmentId": str(assignment.id),
        "sourcePromptId": str(prompt.id),
        "title": assignment.title,
        "writingTask": prompt.writing_task or WRITING_TASK,
        "writingTaskSummary": prompt.writing_task_summary or "",
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
        "genre": "Nghị luận văn học",
        "writing_task": prompt.writing_task or WRITING_TASK,
        "writing_task_summary": prompt.writing_task_summary or "",
        "extra_instructions": assignment.extra_instructions,
        "requirements": [line.strip() for line in WRITING_TASK.splitlines() if line.strip()][:12],
    }
    revision_rubric = {
        "title": rubric_doc["title"],
        "maxScore": rubric_doc["maxScore"],
        "scoreStep": rubric_doc["scoreStep"],
        "criteria": rubric_doc["criteria"],
    }

    revision = None
    if assignment.published_revision_id:
        revision = await session.get(AssignmentRevision, assignment.published_revision_id)
    if revision is None:
        revision = (
            await session.execute(
                select(AssignmentRevision)
                .where(
                    AssignmentRevision.assignment_id == assignment.id,
                    AssignmentRevision.code == DEMO_ASSIGNMENT_CODE,
                )
                .order_by(AssignmentRevision.created_at.desc())
            )
        ).scalars().first()
    if revision is None:
        revision = AssignmentRevision(
            assignment_id=assignment.id,
            code=DEMO_ASSIGNMENT_CODE,
            title=assignment.title,
            instructions=instructions,
            genre=prompt.genre or "NLVH",
            rubric=revision_rubric,
            context_chunks=chunks,
            status="PUBLISHED",
            readiness_policy={"requiredContentKeys": ["thesis", "sections"], "minSections": 1},
            snapshot=snapshot,
            due_at=assignment.due_at,
        )
        session.add(revision)
        await session.flush()
        counts["revision_created"] += 1
    else:
        revision.assignment_id = assignment.id
        revision.title = assignment.title
        revision.instructions = instructions
        revision.genre = prompt.genre or "NLVH"
        revision.rubric = revision_rubric
        revision.context_chunks = chunks
        revision.status = "PUBLISHED"
        revision.snapshot = snapshot
        revision.due_at = assignment.due_at
        revision.updated_at = now
        counts["revision_existing"] += 1

    assignment.status = "PUBLISHED"
    assignment.published_revision_id = revision.id
    assignment.published_at = assignment.published_at or now
    assignment.updated_at = now
    return assignment, revision


async def seed_one_submission(
    session: AsyncSession,
    *,
    teacher: User,
    revision: AssignmentRevision,
    student: User,
    mock_sub: dict[str, Any],
    counts: dict[str, int],
) -> None:
    existing = (
        await session.execute(
            select(Submission).where(
                Submission.assignment_revision_id == revision.id,
                Submission.student_id == student.id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None and existing.current_published_result_id:
        counts["submissions_existing"] += 1
        return

    pages_spec = list(mock_sub.get("pages") or [])
    if not pages_spec:
        raise RuntimeError(f"No pages for {student.login_id}")
    blobs: list[tuple[dict[str, Any], bytes, str, int, int]] = []
    for spec in pages_spec:
        rel = str(spec.get("imageUrl") or spec.get("localPath") or "").lstrip("/")
        path = PUBLIC_ROOT / rel
        if not path.is_file():
            raise RuntimeError(f"Missing page image {path}")
        data = path.read_bytes()
        digest = sha256_bytes(data)
        width, height = jpeg_size(data)
        blobs.append((spec, data, digest, width, height))

    now = parse_vn_datetime(mock_sub.get("submissionDate"))
    if existing is None:
        submission = Submission(assignment_revision_id=revision.id, student_id=student.id)
        session.add(submission)
        await session.flush()
        counts["submissions_created"] += 1
    else:
        submission = existing
        counts["submissions_updated"] += 1

    attempt = None
    if submission.current_attempt_id:
        attempt = await session.get(SubmissionAttempt, submission.current_attempt_id)
    if attempt is None:
        attempt = SubmissionAttempt(
            submission_id=submission.id,
            assignment_revision_id=revision.id,
            attempt_number=1,
        )
        session.add(attempt)
        await session.flush()

    page_rows: list[SubmissionPage] = []
    for spec, data, digest, width, height in blobs:
        page_index = int(spec.get("pageIndex") or 0)
        filename = str(spec.get("filename") or Path(str(spec.get("imageUrl") or "")).name or f"page-{page_index}.jpg")
        page = SubmissionPage(
            attempt_id=attempt.id,
            page_index=page_index,
            original_filename=filename,
            mime_type="image/jpeg",
            byte_size=len(data),
            width=width,
            height=height,
            rotation_degrees=0,
            mask_regions=[],
            original_sha256=digest,
            processed_sha256=digest,
            processed_mime_type="image/jpeg",
            processed_byte_size=len(data),
        )
        session.add(page)
        await session.flush()
        session.add(
            SubmissionPageBlob(
                page_id=page.id,
                kind=PageBlobKind.ORIGINAL.value,
                mime_type="image/jpeg",
                sha256=digest,
                byte_size=len(data),
                bytes=data,
            )
        )
        session.add(
            SubmissionPageBlob(
                page_id=page.id,
                kind=PageBlobKind.PROCESSED.value,
                mime_type="image/jpeg",
                sha256=digest,
                byte_size=len(data),
                bytes=data,
            )
        )
        page_rows.append(page)
        counts["pages_created"] += 1

    lines_by_index: dict[int, list[str]] = {}
    for item in mock_sub.get("transcriptionByPage") or []:
        lines_by_index[int(item.get("pageIndex") or 0)] = list(item.get("lines") or [])
    tx_pages = transcription_pages_from_lines(page_rows, lines_by_index)

    ocr = (
        await session.execute(select(OcrResult).where(OcrResult.attempt_id == attempt.id))
    ).scalar_one_or_none()
    if ocr is None:
        ocr = OcrResult(
            attempt_id=attempt.id,
            pages=tx_pages,
            raw_json={"source": "classroom-demo-seed"},
            prompt_version="demo",
            schema_version="ocr_page.v1",
            provider=DEMO_PROVIDER,
            model=DEMO_MODEL,
        )
        session.add(ocr)
        await session.flush()
    else:
        ocr.pages = tx_pages

    tx = TranscriptionRevision(
        attempt_id=attempt.id,
        ocr_result_id=ocr.id,
        revision=1,
        status=TranscriptionRevisionStatus.CONFIRMED.value,
        pages=tx_pages,
        confirmed_at=now,
        confirmed_by=student.id,
    )
    session.add(tx)
    await session.flush()

    input_hash = sha256_bytes("|".join(f"{p.page_index}:{p.processed_sha256}" for p in page_rows).encode())
    attempt.attempt_number = attempt.attempt_number or 1
    attempt.state = SubmissionAttemptState.READY_TO_GRADE.value
    attempt.input_hash = input_hash
    attempt.page_count = len(page_rows)
    attempt.submitted_at = now
    attempt.ocr_status = "READY"
    attempt.ocr_attempt_count = 1
    attempt.ocr_finished_at = now
    attempt.ocr_model_metadata = {"provider": DEMO_PROVIDER, "model": DEMO_MODEL}
    attempt.current_revision = 1
    attempt.confirmed_revision_id = tx.id
    attempt.confirmed_at = now
    attempt.confirmed_by = student.id
    attempt.official_submitted_at = now
    attempt.updated_at = now

    rubric = rubric_from_revision(revision.rubric, revision.snapshot)
    finalized = finalize_payload(rubric=rubric, output=build_grade_output(mock_sub), pages=tx_pages)
    job = AssessmentJob(
        submission_id=submission.id,
        attempt_id=attempt.id,
        transcription_revision_id=tx.id,
        assignment_revision_id=revision.id,
        student_id=student.id,
        input_hash=sha256_bytes(json.dumps(finalized, ensure_ascii=False, sort_keys=True).encode()),
        status=AssessmentJobStatus.READY.value,
        attempt_count=1,
        finished_at=now,
        prompt_version="demo",
        schema_version=ASSESSMENT_OUTPUT_SCHEMA_VERSION,
        provider=DEMO_PROVIDER,
        model=DEMO_MODEL,
    )
    session.add(job)
    await session.flush()
    result = AssessmentResult(
        job_id=job.id,
        submission_id=submission.id,
        attempt_id=attempt.id,
        transcription_revision_id=tx.id,
        assignment_revision_id=revision.id,
        student_id=student.id,
        rubric_snapshot=rubric,
        prompt_version="demo",
        schema_version=ASSESSMENT_OUTPUT_SCHEMA_VERSION,
        provider=DEMO_PROVIDER,
        model=DEMO_MODEL,
        ai_payload=finalized,
        ai_raw={"source": "classroom-demo-seed"},
        ai_total_score=Decimal(str(finalized["totalScore"])),
        teacher_payload=finalized,
        teacher_id=teacher.id,
        teacher_updated_at=now,
        total_score=Decimal(str(finalized["totalScore"])),
        max_score=Decimal(str(finalized["maxScore"])),
        score_step=Decimal(str(finalized["scoreStep"])),
        score_scale10=Decimal(str(finalized["scoreScale10"])),
        version=1,
        is_published=True,
        published_payload=finalized,
        published_at=now,
        published_by=teacher.id,
    )
    session.add(result)
    await session.flush()
    job.result_id = result.id
    submission.current_attempt_id = attempt.id
    submission.current_assessment_job_id = job.id
    submission.current_assessment_result_id = result.id
    submission.current_published_result_id = result.id
    submission.updated_at = now
    counts["grades_created"] += 1


def insight_payload_from_stats(computed: dict[str, Any]) -> dict[str, Any]:
    issues = list(computed.get("issues") or [])[:3]
    priorities: list[dict[str, Any]] = []
    for issue in issues:
        title = str(issue.get("issueType") or issue.get("label") or issue.get("code") or "Ưu tiên ôn tập")
        evidence = (
            f"{issue.get('studentCount', issue.get('count', 0))} học sinh "
            f"({issue.get('percentage') or issue.get('rate') or '—'}) trên tiêu chí "
            f"{issue.get('criterionName') or issue.get('criterionId') or ''}."
        )
        action = str(issue.get("action") or "").strip()
        activities = [action] if action else [
            "Dành một hoạt động lớp để ôn đúng chỗ mất điểm phổ biến trên barem 4 tiêu chí."
        ]
        priorities.append(
            {
                "title": title[:255],
                "evidence": evidence[:1000],
                "suggestedActivities": activities,
            }
        )
    if not priorities:
        priorities = [
            {
                "title": "Ôn liên hệ tác phẩm ngoài để làm nổi nét riêng của Trần Quang Quý",
                "evidence": "Nhiều bài còn liên hệ chung chung hoặc chưa so sánh được nét riêng.",
                "suggestedActivities": [
                    'Hướng dẫn so sánh nét riêng với "Bếp lửa" (Bằng Việt) và "Quê hương" (Tế Hanh).'
                ],
            },
            {
                "title": "Phân tích nghịch lí tự do không thoát ly bùn đất",
                "evidence": "Một số bài còn diễn xuôi thơ, chưa chạm chiều sâu triết lí của tự do.",
                "suggestedActivities": [
                    "Thảo luận nhóm: khát vọng thoát nhọc nhằn cơ bắp và tự do gắn với đất đai."
                ],
            },
            {
                "title": "Khai thác chuỗi buộc – neo – cởi",
                "evidence": "Chuỗi động từ then chốt chưa được nhiều bài khai thác thành trục lập luận.",
                "suggestedActivities": [
                    'Vẽ sơ đồ tư duy liên kết "buộc" (khổ 1), "neo" (khổ 3), "cởi" (khổ 4).'
                ],
            },
        ]
    mean = computed.get("meanScoreScale10")
    notes = (
        f"Gợi ý dạy học demo cho {computed.get('scoredCount', 0)} bài đã công bố. "
        f"Điểm trung bình thang 10: {mean}."
    )
    return {"priorities": priorities, "notes": notes, "source": "demo"}


async def seed_class_insight(
    session: AsyncSession,
    settings: Settings,
    teacher: User,
    assignment: Assignment,
    revision: AssignmentRevision,
    classroom: Classroom,
    counts: dict[str, int],
) -> None:
    reports = ReportService(session, settings)
    papers = await reports.stats.papers_for_assignment(assignment, revision, classroom)
    computed = reports.stats.compute(papers, mode=MODE_OFFICIAL)
    fingerprint = filter_fingerprint(
        {
            "assignmentId": str(assignment.id),
            "studentId": None,
            "from": None,
            "to": None,
        }
    )
    scope_key = insight_scope_key(kind="assignment", assignment_id=assignment.id, fingerprint=fingerprint)
    hash_payload = reports._insight_hash_payload(
        scope_kind="assignment",
        scope_key=scope_key,
        mode=MODE_OFFICIAL,
        fingerprint=fingerprint,
        computed=computed,
        context={
            "assignmentTitle": assignment.title,
            "writingTask": (revision.snapshot or {}).get("writingTask") or "",
            "rubricTitle": (computed.get("trend") or [{}])[0].get("rubricTitle") if computed.get("trend") else "",
        },
    )
    input_hash = insight_input_hash(hash_payload)
    existing = (
        await session.execute(
            select(ClassInsight).where(
                ClassInsight.teacher_id == teacher.id,
                ClassInsight.scope_key == scope_key,
                ClassInsight.mode == MODE_OFFICIAL,
            )
        )
    ).scalar_one_or_none()
    now = utcnow()
    payload = insight_payload_from_stats(computed)
    if existing is None:
        session.add(
            ClassInsight(
                teacher_id=teacher.id,
                scope_kind="assignment",
                scope_key=scope_key,
                mode=MODE_OFFICIAL,
                filter_fingerprint=fingerprint,
                assignment_id=assignment.id,
                assignment_revision_id=revision.id,
                input_hash=input_hash,
                status=ClassInsightStatus.READY.value,
                attempt_count=1,
                finished_at=now,
                prompt_version=settings.INSIGHT_PROMPT_VERSION or "v1",
                schema_version=CLASS_INSIGHT_SCHEMA_VERSION,
                provider=DEMO_PROVIDER,
                model=DEMO_MODEL,
                stats_snapshot={"scoredCount": computed.get("scoredCount")},
                payload=payload,
            )
        )
        counts["insights_created"] += 1
        return
    existing.input_hash = input_hash
    existing.filter_fingerprint = fingerprint
    existing.assignment_id = assignment.id
    existing.assignment_revision_id = revision.id
    existing.status = ClassInsightStatus.READY.value
    existing.payload = payload
    existing.last_error = None
    existing.lease_token = None
    existing.lease_expires_at = None
    existing.finished_at = now
    existing.provider = DEMO_PROVIDER
    existing.model = DEMO_MODEL
    existing.updated_at = now
    counts["insights_updated"] += 1


async def run(*, apply: bool) -> dict[str, int]:
    settings = get_settings()
    if settings.is_production:
        raise SystemExit("Refusing to seed demo data when APP_ENV=production")

    roster = load_roster()
    submissions = load_central_submissions()
    missing = [row["id"] for row in roster if row["id"] not in submissions]
    if missing:
        raise RuntimeError(f"Roster students missing mock submissions: {missing}")

    counts = {
        "students_created": 0,
        "students_existing": 0,
        "memberships_created": 0,
        "assignment_created": 0,
        "assignment_existing": 0,
        "revision_created": 0,
        "revision_existing": 0,
        "access_created": 0,
        "access_restored": 0,
        "outlines_created": 0,
        "outlines_updated": 0,
        "submissions_created": 0,
        "submissions_updated": 0,
        "submissions_existing": 0,
        "pages_created": 0,
        "grades_created": 0,
        "insights_created": 0,
        "insights_updated": 0,
    }

    factory = get_session_factory(settings)
    password_hash = hash_password_sync(DEMO_PASSWORD)
    async with factory() as session:
        teacher = await seed_teacher(session, settings)
        seed_an = await seed_student(session)
        classroom = await seed_classroom(session, teacher, seed_an)
        if classroom.code != CLASS_CODE:
            raise RuntimeError(f"Expected classroom {CLASS_CODE}, got {classroom.code}")

        demo_users: list[User] = []
        for row in roster:
            email = normalize_email(row["email"])
            login_id = normalize_login_id(email.split("@", 1)[0])
            user = await get_or_create_student(
                session,
                login_id=login_id,
                email=email,
                display_name=str(row["name"]),
                password_hash=password_hash,
                counts=counts,
            )
            await ensure_membership(session, classroom, user, "STUDENT", counts)
            demo_users.append(user)

        assignment, revision = await get_or_create_assignment(
            session,
            teacher,
            classroom,
            [str(user.id) for user in demo_users],
            counts,
        )
        for user, row in zip(demo_users, roster, strict=True):
            await ensure_access(session, revision, user, counts)
            await ensure_outline_prep(session, revision, user, counts)
            await seed_one_submission(
                session,
                teacher=teacher,
                revision=revision,
                student=user,
                mock_sub=submissions[row["id"]],
                counts=counts,
            )

        await session.flush()
        await seed_class_insight(session, settings, teacher, assignment, revision, classroom, counts)

        logger.info("Classroom %s assignment %s", classroom.code, assignment.code)
        logger.info("Students in demo roster: %s", len(demo_users))
        logger.info("Counts: %s", json.dumps(counts, ensure_ascii=False))
        if apply:
            await session.commit()
            logger.info("Applied classroom demo seed.")
        else:
            await session.rollback()
            logger.info("Dry-run only; rolled back. Pass --apply to write.")
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed 11A14 classroom demo data from mock files")
    parser.add_argument("--apply", action="store_true", help="Write to the database")
    parser.add_argument("--dry-run", action="store_true", help="Parse and plan without writing (default)")
    args = parser.parse_args()
    asyncio.run(run(apply=bool(args.apply)))


if __name__ == "__main__":
    main()
