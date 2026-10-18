"""Socratic AI session schema.

Revision ID: 0002_socratic_schema
Revises: 0001_auth_schema
Create Date: 2026-10-18

Adds support for Socratic Writing Scaffold Agent (FR-06 to FR-10).
See SRS.md Section 4 and gemini-pipeline.md.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0002_socratic_schema"
down_revision: Union[str, Sequence[str], None] = "0001_auth_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Enums ──────────────────────────────────────────────────────────────────
    op.execute(
        """
        CREATE TYPE socratic_state AS ENUM ('INIT', 'THESIS', 'OUTLINE', 'REVIEW');
        CREATE TYPE chat_role AS ENUM ('STUDENT', 'ASSISTANT');
        CREATE TYPE message_status AS ENUM ('PENDING', 'VALIDATED', 'REJECTED', 'FALLBACK');
        CREATE TYPE outline_revision_status AS ENUM ('DRAFT', 'ACCEPTED', 'SUPERSEDED');
        CREATE TYPE idempotency_state AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');
        CREATE TYPE assignment_revision_status AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');
        CREATE TYPE material_version_status AS ENUM ('UPLOADED', 'PRIVACY_REVIEW', 'READY', 'FAILED');
        """
    )

    # ── Assignment Revision (minimal for Socratic context) ───────────────────────
    op.execute(
        """
        CREATE TABLE assignment_revisions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code VARCHAR(32) NOT NULL,
            title VARCHAR(255) NOT NULL,
            instructions JSONB NOT NULL DEFAULT '{}',
            genre VARCHAR(64) NOT NULL,
            rubric JSONB NOT NULL DEFAULT '{}',
            context_chunks JSONB NOT NULL DEFAULT '[]',
            status VARCHAR(32) NOT NULL DEFAULT 'PUBLISHED',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX assignment_revisions_code_idx ON assignment_revisions (code);
        """
    )

    # ── Socratic Session ────────────────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE socratic_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            student_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
            assignment_revision_id UUID NOT NULL REFERENCES assignment_revisions (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
            state socratic_state NOT NULL DEFAULT 'INIT',
            version INTEGER NOT NULL DEFAULT 1,
            last_message_at TIMESTAMPTZ NULL,
            processing_turn INTEGER NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT socratic_sessions_student_assignment_key
                UNIQUE (student_id, assignment_revision_id)
        );
        CREATE INDEX socratic_sessions_student_id_idx ON socratic_sessions (student_id);
        CREATE INDEX socratic_sessions_assignment_revision_id_idx ON socratic_sessions (assignment_revision_id);
        CREATE INDEX socratic_sessions_student_assignment_idx ON socratic_sessions (student_id, assignment_revision_id);
        """
    )

    # ── Chat Message ────────────────────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE chat_messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES socratic_sessions (id) ON DELETE CASCADE ON UPDATE RESTRICT,
            turn_id INTEGER NOT NULL,
            role chat_role NOT NULL,
            content TEXT NOT NULL,
            sources JSONB NULL,
            status message_status NOT NULL DEFAULT 'PENDING',
            provider VARCHAR(32) NULL,
            model VARCHAR(64) NULL,
            prompt_version VARCHAR(32) NULL,
            ai_run_id UUID NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX chat_messages_session_turn_idx ON chat_messages (session_id, turn_id);
        """
    )

    # ── Outline Revision ────────────────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE outline_revisions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES socratic_sessions (id) ON DELETE CASCADE ON UPDATE RESTRICT,
            revision INTEGER NOT NULL,
            content JSONB NOT NULL DEFAULT '{}',
            author VARCHAR(32) NOT NULL,
            source_refs JSONB NULL,
            review_status outline_revision_status NOT NULL DEFAULT 'DRAFT',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT outline_revisions_session_revision_key
                UNIQUE (session_id, revision)
        );
        CREATE INDEX outline_revisions_session_revision_idx ON outline_revisions (session_id, revision);
        """
    )

    # ── Idempotency Record ──────────────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE idempotency_records (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE RESTRICT,
            route VARCHAR(128) NOT NULL,
            key_hash VARCHAR(64) NOT NULL,
            request_hash VARCHAR(64) NOT NULL,
            state idempotency_state NOT NULL DEFAULT 'PROCESSING',
            resource_id UUID NULL,
            cached_response JSONB NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT idempotency_records_user_route_key_key
                UNIQUE (user_id, route, key_hash)
        );
        CREATE INDEX idempotency_records_user_route_key_idx ON idempotency_records (user_id, route, key_hash);
        CREATE INDEX idempotency_records_expires_at_idx ON idempotency_records (expires_at);
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS idempotency_records;")
    op.execute("DROP TABLE IF EXISTS outline_revisions;")
    op.execute("DROP TABLE IF EXISTS chat_messages;")
    op.execute("DROP TABLE IF EXISTS socratic_sessions;")
    op.execute("DROP TABLE IF EXISTS assignment_revisions;")

    op.execute("DROP TYPE IF EXISTS material_version_status;")
    op.execute("DROP TYPE IF EXISTS assignment_revision_status;")
    op.execute("DROP TYPE IF EXISTS idempotency_state;")
    op.execute("DROP TYPE IF EXISTS outline_revision_status;")
    op.execute("DROP TYPE IF EXISTS message_status;")
    op.execute("DROP TYPE IF EXISTS chat_role;")
    op.execute("DROP TYPE IF EXISTS socratic_state;")
