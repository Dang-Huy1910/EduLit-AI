"""Student handwritten submission, OCR jobs, and transcription revisions.

Blobs live in submission_page_blobs and are never joined into list queries.
Student confirms the transcription; there is no teacher OCR approval table.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import (
    OcrJobStatus,
    PageBlobKind,
    SubmissionAttemptState,
    TranscriptionRevisionStatus,
)

if TYPE_CHECKING:
    from app.db.models.socratic import AssignmentRevision
    from app.db.models.user import User


class Submission(Base):
    """One submission per student and published assignment revision."""

    __tablename__ = "submissions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    assignment_revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assignment_revisions.id", ondelete="CASCADE"),
        nullable=False,
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    current_attempt_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    attempts: Mapped[list[SubmissionAttempt]] = relationship(
        "SubmissionAttempt", back_populates="submission", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint(
            "assignment_revision_id",
            "student_id",
            name="submissions_revision_student_key",
        ),
        Index("submissions_student_id_idx", "student_id"),
        Index("submissions_revision_id_idx", "assignment_revision_id"),
    )


class SubmissionAttempt(Base):
    """A frozen or draft set of pages plus OCR/transcription state."""

    __tablename__ = "submission_attempts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False,
    )
    assignment_revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assignment_revisions.id", ondelete="CASCADE"),
        nullable=False,
    )
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[str] = mapped_column(
        String(32), nullable=False, default=SubmissionAttemptState.DRAFT.value
    )
    input_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    page_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ocr_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=OcrJobStatus.NONE.value
    )
    ocr_attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ocr_max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    ocr_lease_token: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    ocr_lease_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ocr_last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    ocr_page_errors: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    ocr_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ocr_finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ocr_model_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    current_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    confirmed_revision_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    submission: Mapped[Submission] = relationship("Submission", back_populates="attempts")
    pages: Mapped[list[SubmissionPage]] = relationship(
        "SubmissionPage",
        back_populates="attempt",
        cascade="all, delete-orphan",
        order_by="SubmissionPage.page_index",
    )
    transcriptions: Mapped[list[TranscriptionRevision]] = relationship(
        "TranscriptionRevision",
        back_populates="attempt",
        cascade="all, delete-orphan",
        order_by="TranscriptionRevision.revision",
    )

    __table_args__ = (
        UniqueConstraint(
            "submission_id",
            "attempt_number",
            name="submission_attempts_submission_number_key",
        ),
        Index("submission_attempts_state_idx", "state"),
        Index(
            "submission_attempts_ocr_claim_idx",
            "ocr_status",
            "ocr_lease_expires_at",
            "created_at",
        ),
        Index("submission_attempts_submission_id_idx", "submission_id"),
        Index("submission_attempts_input_hash_idx", "submission_id", "input_hash"),
    )


class SubmissionPage(Base):
    """Page metadata. Binary lives in submission_page_blobs."""

    __tablename__ = "submission_pages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    attempt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submission_attempts.id", ondelete="CASCADE"),
        nullable=False,
    )
    page_index: Mapped[int] = mapped_column(Integer, nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    width: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    height: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rotation_degrees: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    mask_regions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    original_sha256: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    processed_sha256: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    processed_mime_type: Mapped[str] = mapped_column(String(128), nullable=False, default="image/jpeg")
    processed_byte_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    attempt: Mapped[SubmissionAttempt] = relationship("SubmissionAttempt", back_populates="pages")

    __table_args__ = (
        UniqueConstraint("attempt_id", "page_index", name="submission_pages_attempt_index_key"),
        Index("submission_pages_attempt_id_idx", "attempt_id"),
    )


class SubmissionPageBlob(Base):
    """Original or OCR-ready bytes. Query explicitly; never lazy-load."""

    __tablename__ = "submission_page_blobs"

    page_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submission_pages.id", ondelete="CASCADE"),
        primary_key=True,
    )
    kind: Mapped[str] = mapped_column(
        String(16), primary_key=True, default=PageBlobKind.ORIGINAL.value
    )
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    bytes: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)


class OcrResult(Base):
    """Immutable original OCR output for one frozen attempt."""

    __tablename__ = "ocr_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    attempt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submission_attempts.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    pages: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    raw_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    prompt_version: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    schema_version: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    model: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )


class TranscriptionRevision(Base):
    """Student working copy or confirmed transcription."""

    __tablename__ = "transcription_revisions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    attempt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submission_attempts.id", ondelete="CASCADE"),
        nullable=False,
    )
    ocr_result_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ocr_results.id", ondelete="SET NULL"), nullable=True
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=TranscriptionRevisionStatus.DRAFT.value
    )
    pages: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    attempt: Mapped[SubmissionAttempt] = relationship(
        "SubmissionAttempt", back_populates="transcriptions"
    )

    __table_args__ = (
        UniqueConstraint(
            "attempt_id",
            "revision",
            name="transcription_revisions_attempt_revision_key",
        ),
        Index("transcription_revisions_attempt_id_idx", "attempt_id"),
    )
