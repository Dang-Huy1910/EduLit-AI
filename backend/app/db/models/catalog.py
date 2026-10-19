"""Teacher catalog, classroom, and assignment aggregates.

Chuyên đề, ngữ liệu, đề nguồn, barem, lớp, and assignment instances
that freeze a snapshot into AssignmentRevision on publish.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.socratic import AssignmentRevision
    from app.db.models.user import User


class Classroom(Base):
    __tablename__ = "classrooms"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    owner_teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    grade_level: Mapped[int] = mapped_column(Integer, nullable=False)
    academic_year: Mapped[str] = mapped_column(String(16), nullable=False, default="2026-2027")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    memberships: Mapped[list[ClassMembership]] = relationship(
        "ClassMembership", back_populates="classroom", cascade="all, delete-orphan"
    )
    owner: Mapped[User] = relationship("User", foreign_keys=[owner_teacher_id])

    __table_args__ = (
        UniqueConstraint("owner_teacher_id", "code", name="classrooms_owner_code_key"),
        Index("classrooms_owner_teacher_id_idx", "owner_teacher_id"),
    )


class ClassMembership(Base):
    __tablename__ = "class_memberships"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    classroom_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    membership_role: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    classroom: Mapped[Classroom] = relationship("Classroom", back_populates="memberships")
    user: Mapped[User] = relationship("User")

    __table_args__ = (
        UniqueConstraint("classroom_id", "user_id", name="class_memberships_class_user_key"),
        Index("class_memberships_user_id_idx", "user_id"),
    )


class Topic(Base):
    """Chuyên đề — nhóm kiến thức chứa/liên kết ngữ liệu và đề nguồn."""

    __tablename__ = "topics"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    owner_teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    grade_level: Mapped[int] = mapped_column(Integer, nullable=False)
    genre: Mapped[str] = mapped_column(String(32), nullable=False, default="NLVH")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (Index("topics_owner_teacher_id_idx", "owner_teacher_id"),)


class Material(Base):
    """Ngữ liệu — văn bản, tác phẩm, trích đoạn và thông tin nguồn."""

    __tablename__ = "materials"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    owner_teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    topic_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("topics.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    author: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    source_info: Mapped[str] = mapped_column(Text, nullable=False, default="")
    grade_level: Mapped[int] = mapped_column(Integer, nullable=False, default=11)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT")
    source_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teacher_documents.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    versions: Mapped[list[MaterialVersion]] = relationship(
        "MaterialVersion", back_populates="material", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("materials_owner_teacher_id_idx", "owner_teacher_id"),
        Index("materials_topic_id_idx", "topic_id"),
        Index("materials_source_document_id_idx", "source_document_id"),
    )


class MaterialVersion(Base):
    __tablename__ = "material_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    material_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("materials.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    source_notes: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="READY")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    material: Mapped[Material] = relationship("Material", back_populates="versions")
    chunks: Mapped[list[MaterialChunk]] = relationship(
        "MaterialChunk", back_populates="version_row", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("material_id", "version", name="material_versions_material_version_key"),
        Index("material_versions_material_id_idx", "material_id"),
    )


class MaterialChunk(Base):
    __tablename__ = "material_chunks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    material_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("material_versions.id", ondelete="CASCADE"), nullable=False
    )
    chunk_id: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    text: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    version_row: Mapped[MaterialVersion] = relationship("MaterialVersion", back_populates="chunks")

    __table_args__ = (
        UniqueConstraint(
            "material_version_id", "chunk_id", name="material_chunks_version_chunk_key"
        ),
        Index("material_chunks_version_id_idx", "material_version_id"),
    )


class SourcePrompt(Base):
    """Đề nguồn — yêu cầu viết gắn với một hoặc nhiều ngữ liệu, có thể tái sử dụng."""

    __tablename__ = "source_prompts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    owner_teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    topic_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("topics.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    writing_task: Mapped[str] = mapped_column(Text, nullable=False, default="")
    writing_task_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    extra_guidance: Mapped[str] = mapped_column(Text, nullable=False, default="")
    genre: Mapped[str] = mapped_column(String(32), nullable=False, default="NLVH")
    grade_level: Mapped[int] = mapped_column(Integer, nullable=False, default=11)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT")
    source_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teacher_documents.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    links: Mapped[list[SourcePromptMaterial]] = relationship(
        "SourcePromptMaterial", back_populates="prompt", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("source_prompts_owner_teacher_id_idx", "owner_teacher_id"),
        Index("source_prompts_topic_id_idx", "topic_id"),
        Index("source_prompts_source_document_id_idx", "source_document_id"),
    )


class SourcePromptMaterial(Base):
    __tablename__ = "source_prompt_materials"

    source_prompt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_prompts.id", ondelete="CASCADE"), primary_key=True
    )
    material_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("materials.id", ondelete="CASCADE"), primary_key=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    prompt: Mapped[SourcePrompt] = relationship("SourcePrompt", back_populates="links")
    material: Mapped[Material] = relationship("Material")


class Rubric(Base):
    __tablename__ = "rubrics"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    owner_teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    short_title: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="READY")
    source_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teacher_documents.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    versions: Mapped[list[RubricVersion]] = relationship(
        "RubricVersion", back_populates="rubric", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("rubrics_owner_teacher_id_idx", "owner_teacher_id"),
        Index("rubrics_source_document_id_idx", "source_document_id"),
    )


class RubricVersion(Base):
    __tablename__ = "rubric_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    rubric_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rubrics.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    max_score: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False)
    score_step: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=0.25)
    criteria: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="APPROVED")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    rubric: Mapped[Rubric] = relationship("Rubric", back_populates="versions")

    __table_args__ = (
        UniqueConstraint("rubric_id", "version", name="rubric_versions_rubric_version_key"),
        Index("rubric_versions_rubric_id_idx", "rubric_id"),
    )


class Assignment(Base):
    """Một lần giao đề nguồn cho lớp/học sinh, với barem và thời hạn cụ thể."""

    __tablename__ = "assignments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    classroom_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("classrooms.id", ondelete="SET NULL"), nullable=True
    )
    source_prompt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_prompts.id", ondelete="RESTRICT"), nullable=False
    )
    rubric_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rubrics.id", ondelete="SET NULL"), nullable=True
    )
    rubric_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rubric_versions.id", ondelete="SET NULL"), nullable=True
    )
    published_revision_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assignment_revisions.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    extra_instructions: Mapped[str] = mapped_column(Text, nullable=False, default="")
    assignment_rubric: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    max_score: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=4)
    score_step: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=0.25)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT")
    recipient_student_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    classroom: Mapped[Classroom | None] = relationship("Classroom")
    source_prompt: Mapped[SourcePrompt] = relationship("SourcePrompt")
    published_revision: Mapped[AssignmentRevision | None] = relationship(
        "AssignmentRevision",
        foreign_keys=[published_revision_id],
        primaryjoin="Assignment.published_revision_id==AssignmentRevision.id",
        post_update=True,
        viewonly=True,
    )

    __table_args__ = (
        UniqueConstraint("code", name="assignments_code_key"),
        Index("assignments_teacher_id_idx", "teacher_id"),
        Index("assignments_classroom_id_idx", "classroom_id"),
        Index("assignments_source_prompt_id_idx", "source_prompt_id"),
        Index("assignments_status_idx", "status"),
    )


class TeacherDocument(Base):
    """Teacher-uploaded original file plus conversion/analysis draft.

    Original bytes live in TeacherDocumentBlob and are never loaded here.
    """

    __tablename__ = "teacher_documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    owner_teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="UPLOADED")
    intent: Mapped[str] = mapped_column(String(16), nullable=False, default="MIXED")
    needs_ocr: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    truncated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    conversion_warning: Mapped[str] = mapped_column(Text, nullable=False, default="")
    error_code: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    error_message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    converted_markdown: Mapped[str] = mapped_column(Text, nullable=False, default="")
    teacher_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    converted_markdown_sha256: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    teacher_markdown_sha256: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    analysis_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    analysis_markdown_sha256: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    teacher_draft_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    teacher_draft_markdown_sha256: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    selected_item_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    topic_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("topics.id", ondelete="SET NULL"), nullable=True
    )
    grade_level: Mapped[int] = mapped_column(Integer, nullable=False, default=11)
    genre: Mapped[str] = mapped_column(String(32), nullable=False, default="NLVH")
    created_material_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_prompt_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_rubric_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    processing_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    converted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        Index("teacher_documents_owner_teacher_id_idx", "owner_teacher_id"),
        Index("teacher_documents_status_idx", "status"),
        Index("teacher_documents_sha256_idx", "sha256"),
    )


class TeacherDocumentBlob(Base):
    """Original upload bytes. Query this table explicitly; never lazy-load."""

    __tablename__ = "teacher_document_blobs"

    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teacher_documents.id", ondelete="CASCADE"),
        primary_key=True,
    )
    original_bytes: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
