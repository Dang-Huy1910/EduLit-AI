"""Rubric grading jobs, results, and class teaching insights.

Job status is separate from the stored result. A READY job may still be
unpublished. Published student-facing scores live on AssessmentResult
`published_payload` and `submissions.current_published_result_id`.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.enums import AssessmentJobStatus, ClassInsightStatus

if TYPE_CHECKING:
    pass


class AssessmentJob(Base):
    """Durable grading job for one official transcription revision."""

    __tablename__ = "assessment_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False,
    )
    attempt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submission_attempts.id", ondelete="CASCADE"),
        nullable=False,
    )
    transcription_revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("transcription_revisions.id", ondelete="CASCADE"),
        nullable=False,
    )
    assignment_revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assignment_revisions.id", ondelete="CASCADE"),
        nullable=False,
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=AssessmentJobStatus.QUEUED.value
    )
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    lease_token: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    prompt_version: Mapped[str] = mapped_column(String(32), nullable=False, default="v1")
    schema_version: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    model: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    result_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        UniqueConstraint(
            "transcription_revision_id",
            name="assessment_jobs_transcription_revision_key",
        ),
        Index("assessment_jobs_submission_id_idx", "submission_id"),
        Index("assessment_jobs_student_id_idx", "student_id"),
        Index(
            "assessment_jobs_claim_idx",
            "status",
            "lease_expires_at",
            "created_at",
        ),
        Index("assessment_jobs_input_hash_idx", "input_hash"),
    )


class AssessmentResult(Base):
    """Stored grading output. Independent of whether the job is still running."""

    __tablename__ = "assessment_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessment_jobs.id", ondelete="CASCADE"),
        nullable=False,
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False,
    )
    attempt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submission_attempts.id", ondelete="CASCADE"),
        nullable=False,
    )
    transcription_revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("transcription_revisions.id", ondelete="CASCADE"),
        nullable=False,
    )
    assignment_revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assignment_revisions.id", ondelete="CASCADE"),
        nullable=False,
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    rubric_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    prompt_version: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    schema_version: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    model: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    ai_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    ai_raw: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    ai_total_score: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    teacher_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    teacher_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    teacher_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_score: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    max_score: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    score_step: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    score_scale10: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    published_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    unpublished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_history: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        Index("assessment_results_job_id_idx", "job_id"),
        Index("assessment_results_submission_id_idx", "submission_id"),
        Index("assessment_results_transcription_idx", "transcription_revision_id"),
        Index("assessment_results_published_idx", "is_published"),
    )


class ClassInsight(Base):
    """Cached AI teaching suggestions for one assignment, keyed by stats hash."""

    __tablename__ = "class_insights"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assignments.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    assignment_revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assignment_revisions.id", ondelete="CASCADE"),
        nullable=False,
    )
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=ClassInsightStatus.QUEUED.value
    )
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    lease_token: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    prompt_version: Mapped[str] = mapped_column(String(32), nullable=False, default="v1")
    schema_version: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    model: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    stats_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        Index("class_insights_claim_idx", "status", "lease_expires_at", "created_at"),
    )
