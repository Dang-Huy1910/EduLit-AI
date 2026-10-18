"""Socratic reservation, assignment access, and outline constraints.

Revision ID: 0003_socratic_reservation_access
Revises: 0002_socratic_schema
Create Date: 2026-10-18
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0003_socratic_reservation_access"
down_revision: Union[str, Sequence[str], None] = "0002_socratic_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE assignment_revisions
            ADD COLUMN IF NOT EXISTS readiness_policy JSONB NOT NULL DEFAULT '{}'::jsonb;
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS assignment_access (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            assignment_revision_id UUID NOT NULL
                REFERENCES assignment_revisions (id) ON DELETE CASCADE ON UPDATE RESTRICT,
            student_id UUID NOT NULL
                REFERENCES users (id) ON DELETE CASCADE ON UPDATE RESTRICT,
            granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            revoked_at TIMESTAMPTZ NULL,
            CONSTRAINT assignment_access_revision_student_key
                UNIQUE (assignment_revision_id, student_id)
        );
        CREATE INDEX IF NOT EXISTS assignment_access_student_id_idx
            ON assignment_access (student_id);
        """
    )
    op.execute(
        """
        ALTER TABLE socratic_sessions
            ADD COLUMN IF NOT EXISTS outline_version INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE socratic_sessions
            ADD COLUMN IF NOT EXISTS reservation_token UUID NULL;
        ALTER TABLE socratic_sessions
            ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ NULL;
        """
    )
    op.execute(
        """
        ALTER TABLE chat_messages
            ADD COLUMN IF NOT EXISTS prompt_hash VARCHAR(64) NULL;
        ALTER TABLE chat_messages
            ADD COLUMN IF NOT EXISTS schema_version VARCHAR(32) NULL;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'chat_messages_session_turn_role_key'
            ) THEN
                ALTER TABLE chat_messages
                    ADD CONSTRAINT chat_messages_session_turn_role_key
                    UNIQUE (session_id, turn_id, role);
            END IF;
        END $$;
        CREATE INDEX IF NOT EXISTS chat_messages_session_created_idx
            ON chat_messages (session_id, created_at, id);
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS outline_revisions_one_accepted_per_session
            ON outline_revisions (session_id)
            WHERE review_status = 'ACCEPTED';
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS outline_revisions_one_accepted_per_session;")
    op.execute("DROP INDEX IF EXISTS chat_messages_session_created_idx;")
    op.execute(
        """
        ALTER TABLE chat_messages
            DROP CONSTRAINT IF EXISTS chat_messages_session_turn_role_key;
        ALTER TABLE chat_messages DROP COLUMN IF EXISTS schema_version;
        ALTER TABLE chat_messages DROP COLUMN IF EXISTS prompt_hash;
        """
    )
    op.execute(
        """
        ALTER TABLE socratic_sessions DROP COLUMN IF EXISTS reservation_expires_at;
        ALTER TABLE socratic_sessions DROP COLUMN IF EXISTS reservation_token;
        ALTER TABLE socratic_sessions DROP COLUMN IF EXISTS outline_version;
        """
    )
    op.execute("DROP TABLE IF EXISTS assignment_access;")
    op.execute("ALTER TABLE assignment_revisions DROP COLUMN IF EXISTS readiness_policy;")
