"""Per-student outline preparation jobs.

Jobs are rows in student_outline_preps. AI runs outside the DB
transaction. Workers claim with a lease so a restart resumes work.
"""

from __future__ import annotations

import logging
import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.adapters import (
    AiConfigurationError,
    AiError,
    AiInvalidOutputError,
    AiPort,
    AiTimeoutError,
    AiUnavailableError,
    create_ai_adapter,
)
from app.ai.prompt_assets import PromptAssetError, load_socratic_prompt
from app.config import Settings
from app.core.http import utcnow
from app.db.models import (
    AssignmentAccess,
    AssignmentRevision,
    OutlinePrepStatus,
    StudentOutlinePrep,
)
from app.services.writing_profile_service import outline_style_context
from app.workflows.guardrails import compact_log_reason
from app.workflows.outline_init import run_outline_init

logger = logging.getLogger("edulit.outline_prep")

QUEUED = OutlinePrepStatus.QUEUED.value
PROCESSING = OutlinePrepStatus.PROCESSING.value
READY = OutlinePrepStatus.READY.value
FAILED = OutlinePrepStatus.FAILED.value
NEEDS_CLARIFICATION = OutlinePrepStatus.NEEDS_CLARIFICATION.value

CLAIMABLE = (QUEUED, PROCESSING)
REQUEUEABLE = (FAILED, NEEDS_CLARIFICATION)


def empty_prep_counts() -> dict[str, int]:
    return {
        "total": 0,
        "ready": 0,
        "failed": 0,
        "queued": 0,
        "processing": 0,
        "needsClarification": 0,
    }


def counts_from_rows(rows: list[tuple[str, int]]) -> dict[str, int]:
    payload = empty_prep_counts()
    for status, count in rows:
        n = int(count or 0)
        payload["total"] += n
        key = (status or "").upper()
        if key == READY:
            payload["ready"] += n
        elif key == FAILED:
            payload["failed"] += n
        elif key == QUEUED:
            payload["queued"] += n
        elif key == PROCESSING:
            payload["processing"] += n
        elif key == NEEDS_CLARIFICATION:
            payload["needsClarification"] += n
    return payload


async def enqueue_for_students(
    session: AsyncSession,
    *,
    revision_id: uuid.UUID,
    student_ids: list[uuid.UUID],
    max_attempts: int,
) -> int:
    """Insert QUEUED jobs for students who do not already have a row.

    Must run in the same transaction as publish snapshot + access grants.
    Does not overwrite READY results.
    """
    created = 0
    seen: set[uuid.UUID] = set()
    for student_id in student_ids:
        if student_id in seen:
            continue
        seen.add(student_id)
        existing = await session.execute(
            select(StudentOutlinePrep.id).where(
                StudentOutlinePrep.assignment_revision_id == revision_id,
                StudentOutlinePrep.student_id == student_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            continue
        session.add(
            StudentOutlinePrep(
                assignment_revision_id=revision_id,
                student_id=student_id,
                status=QUEUED,
                max_attempts=max_attempts,
            )
        )
        created += 1
    return created


async def get_prep(
    session: AsyncSession,
    *,
    revision_id: uuid.UUID,
    student_id: uuid.UUID,
) -> StudentOutlinePrep | None:
    result = await session.execute(
        select(StudentOutlinePrep).where(
            StudentOutlinePrep.assignment_revision_id == revision_id,
            StudentOutlinePrep.student_id == student_id,
        )
    )
    return result.scalar_one_or_none()


async def ensure_job(
    session: AsyncSession,
    *,
    revision_id: uuid.UUID,
    student_id: uuid.UUID,
    max_attempts: int,
) -> StudentOutlinePrep:
    """Return the existing job or insert a QUEUED row (old published assignments).

    Concurrent callers share one row. INSERT ON CONFLICT keeps the outer
    transaction usable when the unique key already exists.
    """
    prep = await get_prep(session, revision_id=revision_id, student_id=student_id)
    if prep is not None:
        return prep
    await session.execute(
        pg_insert(StudentOutlinePrep)
        .values(
            assignment_revision_id=revision_id,
            student_id=student_id,
            status=QUEUED,
            max_attempts=max_attempts,
        )
        .on_conflict_do_nothing(
            constraint="student_outline_preps_revision_student_key"
        )
    )
    existing = await get_prep(session, revision_id=revision_id, student_id=student_id)
    if existing is None:
        raise RuntimeError("outline prep job missing after insert")
    return existing


async def requeue_job(
    session: AsyncSession,
    prep: StudentOutlinePrep,
    *,
    max_attempts: int,
) -> StudentOutlinePrep:
    """Re-queue a failed job. No-op if already queued/processing/ready."""
    status = (prep.status or "").upper()
    if status == READY and prep.outline:
        return prep
    if status in {QUEUED, PROCESSING}:
        return prep
    now = utcnow()
    result = await session.execute(
        update(StudentOutlinePrep)
        .where(
            StudentOutlinePrep.id == prep.id,
            StudentOutlinePrep.status.in_(REQUEUEABLE),
        )
        .values(
            status=QUEUED,
            lease_token=None,
            lease_expires_at=None,
            attempt_count=0,
            max_attempts=max_attempts,
            last_error=None,
            started_at=None,
            finished_at=None,
            updated_at=now,
        )
        .returning(StudentOutlinePrep.id)
    )
    if result.one_or_none() is None:
        await session.refresh(prep)
        return prep
    await session.refresh(prep)
    return prep


async def requeue_failed_for_revision(
    session: AsyncSession,
    *,
    revision_id: uuid.UUID,
    max_attempts: int,
) -> int:
    now = utcnow()
    result = await session.execute(
        update(StudentOutlinePrep)
        .where(
            StudentOutlinePrep.assignment_revision_id == revision_id,
            StudentOutlinePrep.status.in_(REQUEUEABLE),
        )
        .values(
            status=QUEUED,
            lease_token=None,
            lease_expires_at=None,
            attempt_count=0,
            max_attempts=max_attempts,
            last_error=None,
            started_at=None,
            finished_at=None,
            updated_at=now,
        )
    )
    return int(result.rowcount or 0)


async def counts_for_revision(
    session: AsyncSession, revision_id: uuid.UUID
) -> dict[str, int]:
    result = await session.execute(
        select(StudentOutlinePrep.status, func.count())
        .where(StudentOutlinePrep.assignment_revision_id == revision_id)
        .group_by(StudentOutlinePrep.status)
    )
    return counts_from_rows([(row[0], int(row[1])) for row in result.all()])


async def counts_for_revisions(
    session: AsyncSession, revision_ids: list[uuid.UUID]
) -> dict[uuid.UUID, dict[str, int]]:
    out: dict[uuid.UUID, dict[str, int]] = {rid: empty_prep_counts() for rid in revision_ids}
    if not revision_ids:
        return out
    result = await session.execute(
        select(
            StudentOutlinePrep.assignment_revision_id,
            StudentOutlinePrep.status,
            func.count(),
        )
        .where(StudentOutlinePrep.assignment_revision_id.in_(revision_ids))
        .group_by(StudentOutlinePrep.assignment_revision_id, StudentOutlinePrep.status)
    )
    grouped: dict[uuid.UUID, list[tuple[str, int]]] = {}
    for revision_id, status, count in result.all():
        grouped.setdefault(revision_id, []).append((status, int(count)))
    for revision_id, rows in grouped.items():
        out[revision_id] = counts_from_rows(rows)
    return out


async def expire_stuck_jobs(session: AsyncSession) -> int:
    """Mark PROCESSING jobs whose lease and attempts are exhausted as FAILED."""
    now = utcnow()
    result = await session.execute(
        update(StudentOutlinePrep)
        .where(
            StudentOutlinePrep.status == PROCESSING,
            or_(
                StudentOutlinePrep.lease_expires_at.is_(None),
                StudentOutlinePrep.lease_expires_at <= now,
            ),
            StudentOutlinePrep.attempt_count >= StudentOutlinePrep.max_attempts,
        )
        .values(
            status=FAILED,
            lease_token=None,
            lease_expires_at=None,
            finished_at=now,
            last_error=compact_log_reason("Lease hết hạn sau số lần thử tối đa"),
            updated_at=now,
        )
    )
    return int(result.rowcount or 0)


async def claim_jobs(
    session: AsyncSession,
    *,
    limit: int,
    lease_seconds: int,
) -> list[StudentOutlinePrep]:
    now = utcnow()
    await expire_stuck_jobs(session)
    result = await session.execute(
        select(StudentOutlinePrep)
        .where(
            or_(
                StudentOutlinePrep.status == QUEUED,
                and_(
                    StudentOutlinePrep.status == PROCESSING,
                    or_(
                        StudentOutlinePrep.lease_expires_at.is_(None),
                        StudentOutlinePrep.lease_expires_at <= now,
                    ),
                    StudentOutlinePrep.attempt_count < StudentOutlinePrep.max_attempts,
                ),
            )
        )
        .order_by(StudentOutlinePrep.created_at.asc())
        .limit(max(1, limit))
        .with_for_update(skip_locked=True)
    )
    rows = list(result.scalars().all())
    claimed: list[StudentOutlinePrep] = []
    for row in rows:
        token = uuid.uuid4()
        expires = now + timedelta(seconds=lease_seconds)
        updated = await session.execute(
            update(StudentOutlinePrep)
            .where(StudentOutlinePrep.id == row.id)
            .values(
                status=PROCESSING,
                lease_token=token,
                lease_expires_at=expires,
                attempt_count=StudentOutlinePrep.attempt_count + 1,
                started_at=row.started_at or now,
                updated_at=now,
            )
            .returning(StudentOutlinePrep.id)
        )
        if updated.one_or_none() is None:
            continue
        await session.refresh(row)
        claimed.append(row)
    return claimed


async def _eligible_to_generate(
    session: AsyncSession, prep: StudentOutlinePrep
) -> tuple[AssignmentRevision | None, str]:
    revision = (
        await session.execute(
            select(AssignmentRevision)
            .where(AssignmentRevision.id == prep.assignment_revision_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if revision is None or revision.status != "PUBLISHED":
        return None, "Bài tập không còn ở trạng thái đã giao"
    access = (
        await session.execute(
            select(AssignmentAccess)
            .where(
                AssignmentAccess.assignment_revision_id == prep.assignment_revision_id,
                AssignmentAccess.student_id == prep.student_id,
            )
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if access is None or access.revoked_at is not None:
        return None, "Học sinh không còn quyền nhận bài"
    return revision, ""


async def _finish_job(
    session: AsyncSession,
    *,
    job_id: uuid.UUID,
    lease_token: uuid.UUID,
    values: dict[str, Any],
) -> bool:
    now = utcnow()
    values = {**values, "updated_at": now, "finished_at": now}
    result = await session.execute(
        update(StudentOutlinePrep)
        .where(
            StudentOutlinePrep.id == job_id,
            StudentOutlinePrep.lease_token == lease_token,
            StudentOutlinePrep.status == PROCESSING,
        )
        .values(**values)
        .returning(StudentOutlinePrep.id)
    )
    return result.one_or_none() is not None


async def _release_for_retry(
    session: AsyncSession,
    *,
    job_id: uuid.UUID,
    lease_token: uuid.UUID,
    last_error: str,
) -> None:
    now = utcnow()
    prep = await session.get(StudentOutlinePrep, job_id)
    if prep is None or prep.lease_token != lease_token:
        return
    terminal = prep.attempt_count >= prep.max_attempts
    await session.execute(
        update(StudentOutlinePrep)
        .where(
            StudentOutlinePrep.id == job_id,
            StudentOutlinePrep.lease_token == lease_token,
        )
        .values(
            status=FAILED if terminal else QUEUED,
            lease_token=None,
            lease_expires_at=None,
            last_error=compact_log_reason(last_error),
            finished_at=now if terminal else None,
            updated_at=now,
        )
    )


async def process_claimed_job(
    session: AsyncSession,
    prep: StudentOutlinePrep,
    *,
    settings: Settings,
    ai_port: AiPort | None = None,
) -> str:
    """Run AI for one claimed job. Uses this session only around DB I/O."""
    job_id = prep.id
    lease_token = prep.lease_token
    student_id = prep.student_id
    if lease_token is None:
        return FAILED

    revision, reason = await _eligible_to_generate(session, prep)
    if revision is None:
        await _finish_job(
            session,
            job_id=job_id,
            lease_token=lease_token,
            values={
                "status": FAILED,
                "lease_token": None,
                "lease_expires_at": None,
                "last_error": compact_log_reason(reason),
            },
        )
        await session.commit()
        logger.warning(
            "outline_prep ineligible job_id=%s stage=pre_generate reason=%s",
            job_id,
            compact_log_reason(reason),
        )
        return FAILED

    title = revision.title
    instructions = revision.instructions or {}
    rubric = revision.rubric or {}
    chunks = list(revision.context_chunks or [])
    style_profile = await outline_style_context(session, student_id, settings)
    await session.commit()

    try:
        port = ai_port or create_ai_adapter(settings)
        prompt_asset = load_socratic_prompt(settings.OUTLINE_INIT_PROMPT_VERSION, kind="outline-init")
    except (AiConfigurationError, PromptAssetError) as exc:
        async with session.begin():
            await _release_for_retry(
                session,
                job_id=job_id,
                lease_token=lease_token,
                last_error=getattr(exc, "reason", None) or str(exc) or "AI_CONFIGURATION",
            )
        logger.warning(
            "outline_prep config job_id=%s stage=load_prompt reason=%s",
            job_id,
            compact_log_reason(str(exc)),
        )
        return FAILED

    max_tokens = max(int(settings.AI_MAX_OUTPUT_TOKENS or 512), 2048)
    try:
        init_result = await run_outline_init(
            title=title,
            instructions=instructions,
            rubric=rubric,
            context_chunks=chunks,
            ai_port=port,
            prompt_asset=prompt_asset,
            max_output_tokens=max_tokens,
            style_profile=style_profile,
        )
    except AiInvalidOutputError as exc:
        async with session.begin():
            await _release_for_retry(
                session,
                job_id=job_id,
                lease_token=lease_token,
                last_error=exc.message or exc.code,
            )
        logger.warning(
            "outline_prep invalid_output job_id=%s student_id=%s stage=generate reason=%s",
            job_id,
            student_id,
            compact_log_reason(exc.message or exc.code),
        )
        return FAILED
    except (AiUnavailableError, AiTimeoutError, AiConfigurationError, AiError) as exc:
        async with session.begin():
            await _release_for_retry(
                session,
                job_id=job_id,
                lease_token=lease_token,
                last_error=getattr(exc, "code", None) or type(exc).__name__,
            )
        logger.warning(
            "outline_prep provider job_id=%s stage=generate code=%s",
            job_id,
            getattr(exc, "code", type(exc).__name__),
        )
        return FAILED
    except Exception:
        async with session.begin():
            await _release_for_retry(
                session,
                job_id=job_id,
                lease_token=lease_token,
                last_error="OUTLINE_PREP_INTERNAL",
            )
        logger.exception("outline_prep unexpected job_id=%s stage=generate", job_id)
        return FAILED

    metadata = {
        "provider": port.provider_name,
        "model": init_result.model or port.model_name,
        "promptVersion": init_result.prompt_version,
        "promptHash": init_result.prompt_hash,
        "schemaVersion": init_result.schema_version,
        "styleProfileVersion": style_profile["profileVersion"] if style_profile else None,
    }

    async with session.begin():
        current = await session.get(StudentOutlinePrep, job_id)
        if current is None or current.lease_token != lease_token:
            logger.warning(
                "outline_prep stale_lease job_id=%s stage=save",
                job_id,
            )
            return FAILED
        revision, reason = await _eligible_to_generate(session, current)
        if revision is None:
            await _finish_job(
                session,
                job_id=job_id,
                lease_token=lease_token,
                values={
                    "status": FAILED,
                    "lease_token": None,
                    "lease_expires_at": None,
                    "last_error": compact_log_reason(reason),
                    "model_metadata": metadata,
                },
            )
            return FAILED

        if init_result.needs_clarification or init_result.status == "NEEDS_CLARIFICATION":
            saved = await _finish_job(
                session,
                job_id=job_id,
                lease_token=lease_token,
                values={
                    "status": NEEDS_CLARIFICATION,
                    "lease_token": None,
                    "lease_expires_at": None,
                    "outline": None,
                    "sources": [],
                    "message": init_result.message,
                    "needs_clarification": True,
                    "clarification_question": init_result.message,
                    "model_metadata": metadata,
                    "last_error": None,
                },
            )
            return NEEDS_CLARIFICATION if saved else FAILED

        if init_result.status != "COMPLETED" or not init_result.content:
            await _release_for_retry(
                session,
                job_id=job_id,
                lease_token=lease_token,
                last_error=init_result.status or "AI_INVALID_OUTPUT",
            )
            return FAILED

        saved = await _finish_job(
            session,
            job_id=job_id,
            lease_token=lease_token,
            values={
                "status": READY,
                "lease_token": None,
                "lease_expires_at": None,
                "outline": init_result.content,
                "sources": init_result.sources or [],
                "message": init_result.message,
                "needs_clarification": False,
                "clarification_question": None,
                "model_metadata": metadata,
                "last_error": None,
            },
        )
        if not saved:
            logger.warning("outline_prep save_miss job_id=%s stage=save", job_id)
            return FAILED
        logger.info(
            "outline_prep ready job_id=%s student_id=%s attempt=%s",
            job_id,
            student_id,
            current.attempt_count,
        )
        return READY


def public_init_status(
    *,
    outline_version: int,
    session_status: str | None,
    prep: StudentOutlinePrep | None,
) -> str:
    if outline_version > 0:
        return "COMPLETED"
    session_status = (session_status or "NONE").upper()
    if prep is None:
        return session_status or "NONE"
    status = (prep.status or "").upper()
    if status in {QUEUED, PROCESSING}:
        return "PROCESSING"
    if status == READY:
        return "READY"
    if status == FAILED:
        return "FAILED"
    if status == NEEDS_CLARIFICATION:
        return "NEEDS_CLARIFICATION"
    return session_status or "NONE"
