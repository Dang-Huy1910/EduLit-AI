"""Cached student writing profile synthesized from published results.

One row per student. `source_hash` covers the eligible published results,
their published snapshots, the matching transcription copy and the prompt
version, so republishing the same result, revoking access, unpublishing or
deleting a paper invalidates the cache without deleting the row.

The profile never feeds grading; it is a study aid built from work the teacher
already published.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WritingProfile(Base):
    """Last validated writing-profile payload for one student."""

    __tablename__ = "writing_profiles"

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    source_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    evidence_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # [{"resultId", "snapshot"}] of every paper this profile has already read.
    analyzed_sources: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    prompt_version: Mapped[str] = mapped_column(String(32), nullable=False, default="v1")
    schema_version: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    model: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    analyzed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )


class WritingProfileVersion(Base):
    """Compact snapshot of one successful synthesis, for the progress view."""

    __tablename__ = "writing_profile_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # [{"traitId", "level", "evidenceCount"}] in the fixed trait order.
    traits: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    source_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    new_source_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    evidence_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    prompt_version: Mapped[str] = mapped_column(String(32), nullable=False, default="v1")
    model: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    analyzed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        UniqueConstraint("student_id", "version", name="writing_profile_versions_student_version_key"),
        Index("writing_profile_versions_student_idx", "student_id", "version"),
    )
