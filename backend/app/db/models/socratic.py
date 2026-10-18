"""Socratic AI session models.

Supports the Socratic Writing Scaffold Agent (FR-06 to FR-10, BR-01 to BR-04).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import (
    ChatRole,
    IdempotencyState,
    MessageStatus,
    OutlineRevisionStatus,
    SocraticState,
)

socratic_state_enum = ENUM(SocraticState, name="socratic_state", create_type=False)
chat_role_enum = ENUM(ChatRole, name="chat_role", create_type=False)
message_status_enum = ENUM(MessageStatus, name="message_status", create_type=False)
outline_revision_status_enum = ENUM(
    OutlineRevisionStatus, name="outline_revision_status", create_type=False
)
idempotency_state_enum = ENUM(IdempotencyState, name="idempotency_state", create_type=False)

if TYPE_CHECKING:
    from app.db.models.user import User


class AssignmentRevision(Base):
    """Assignment revision used as Socratic context.

    Full assignment CRUD is out of scope. `code` is a lookup key only;
    authorization uses AssignmentAccess.
    """

    __tablename__ = "assignment_revisions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    instructions: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    genre: Mapped[str] = mapped_column(String(64), nullable=False)
    rubric: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    context_chunks: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="PUBLISHED")
    readiness_policy: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    sessions: Mapped[list[SocraticSession]] = relationship(
        "SocraticSession", back_populates="assignment_revision"
    )
    access_grants: Mapped[list[AssignmentAccess]] = relationship(
        "AssignmentAccess", back_populates="assignment_revision"
    )

    __table_args__ = (Index("assignment_revisions_code_idx", "code"),)


class AssignmentAccess(Base):
    """Explicit grant for a student to use one assignment revision.

    Code lookup is not authorization. Revoking a grant (revoked_at set)
    takes effect for existing sessions as well as new ones.
    """

    __tablename__ = "assignment_access"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    assignment_revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assignment_revisions.id", ondelete="CASCADE"),
        nullable=False,
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    assignment_revision: Mapped[AssignmentRevision] = relationship(
        "AssignmentRevision", back_populates="access_grants"
    )
    student: Mapped[User] = relationship("User")

    __table_args__ = (
        UniqueConstraint(
            "assignment_revision_id",
            "student_id",
            name="assignment_access_revision_student_key",
        ),
        Index("assignment_access_student_id_idx", "student_id"),
    )


class SocraticSession(Base):
    """A student's Socratic conversation session for an assignment revision.

    State machine: INIT → THESIS → OUTLINE → REVIEW
    """

    __tablename__ = "socratic_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    assignment_revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assignment_revisions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    state: Mapped[SocraticState] = mapped_column(
        socratic_state_enum,
        nullable=False,
        server_default=text("'INIT'"),
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    outline_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    processing_turn: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reservation_token: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    reservation_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    student: Mapped[User] = relationship("User", lazy="joined")
    assignment_revision: Mapped[AssignmentRevision] = relationship(
        "AssignmentRevision", lazy="joined"
    )
    messages: Mapped[list[ChatMessage]] = relationship(
        "ChatMessage",
        back_populates="session",
        order_by="ChatMessage.turn_id",
    )
    outline_revisions: Mapped[list[OutlineRevision]] = relationship(
        "OutlineRevision",
        back_populates="session",
        order_by="OutlineRevision.revision",
    )

    __table_args__ = (
        UniqueConstraint(
            "student_id",
            "assignment_revision_id",
            name="socratic_sessions_student_assignment_key",
        ),
        Index("socratic_sessions_student_id_idx", "student_id"),
        Index("socratic_sessions_assignment_revision_id_idx", "assignment_revision_id"),
    )


class ChatMessage(Base):
    """A single message in a Socratic session."""

    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("socratic_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    turn_id: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[ChatRole] = mapped_column(chat_role_enum, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sources: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[MessageStatus] = mapped_column(
        message_status_enum,
        nullable=False,
        server_default=text("'PENDING'"),
    )
    provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    prompt_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    prompt_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    schema_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    ai_run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    session: Mapped[SocraticSession] = relationship("SocraticSession", back_populates="messages")

    __table_args__ = (
        UniqueConstraint("session_id", "turn_id", "role", name="chat_messages_session_turn_role_key"),
        Index("chat_messages_session_turn_idx", "session_id", "turn_id"),
        Index("chat_messages_session_created_idx", "session_id", "created_at", "id"),
    )


class OutlineRevision(Base):
    """An immutable revision of the student's outline."""

    __tablename__ = "outline_revisions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("socratic_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    author: Mapped[str] = mapped_column(String(32), nullable=False)
    source_refs: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)
    review_status: Mapped[OutlineRevisionStatus] = mapped_column(
        outline_revision_status_enum,
        nullable=False,
        server_default=text("'DRAFT'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    session: Mapped[SocraticSession] = relationship(
        "SocraticSession", back_populates="outline_revisions"
    )

    __table_args__ = (
        UniqueConstraint("session_id", "revision", name="outline_revisions_session_revision_key"),
        Index("outline_revisions_session_revision_idx", "session_id", "revision"),
    )


class IdempotencyRecord(Base):
    """Idempotency record for safe request replay.

    Unique on (user_id, route, key_hash). Expired rows are reused in place
    rather than inserted again. TTL is IDEMPOTENCY_TTL_HOURS (24h).
    """

    __tablename__ = "idempotency_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    route: Mapped[str] = mapped_column(String(128), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    state: Mapped[IdempotencyState] = mapped_column(
        idempotency_state_enum,
        nullable=False,
        server_default=text("'PROCESSING'"),
    )
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    cached_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id", "route", "key_hash", name="idempotency_records_user_route_key_key"
        ),
        Index("idempotency_records_user_route_key_idx", "user_id", "route", "key_hash"),
        Index("idempotency_records_expires_at_idx", "expires_at"),
    )
