"""Per-student outline preparation jobs.

Revision ID: 0009_student_outline_preps
Revises: 0008_assignment_outline_scaffold
Create Date: 2026-10-19

Replaces the per-revision shared scaffold with one durable job per
(assignment_revision, student).
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0009_student_outline_preps"
down_revision: Union[str, Sequence[str], None] = "0008_assignment_outline_scaffold"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE student_outline_preps (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            assignment_revision_id UUID NOT NULL REFERENCES assignment_revisions (id) ON DELETE CASCADE,
            student_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            status VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
            outline JSONB,
            sources JSONB,
            message TEXT,
            needs_clarification BOOLEAN NOT NULL DEFAULT FALSE,
            clarification_question TEXT,
            model_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 3,
            last_error TEXT,
            lease_token UUID,
            lease_expires_at TIMESTAMPTZ,
            started_at TIMESTAMPTZ,
            finished_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT student_outline_preps_revision_student_key
                UNIQUE (assignment_revision_id, student_id)
        );
        CREATE INDEX student_outline_preps_status_idx ON student_outline_preps (status);
        CREATE INDEX student_outline_preps_claim_idx
            ON student_outline_preps (status, lease_expires_at, created_at);
        DROP TABLE IF EXISTS assignment_outline_scaffolds;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS student_outline_preps;
        CREATE TABLE assignment_outline_scaffolds (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            assignment_revision_id UUID NOT NULL REFERENCES assignment_revisions (id) ON DELETE CASCADE,
            status VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
            outline JSONB,
            sources JSONB,
            message TEXT,
            needs_clarification BOOLEAN NOT NULL DEFAULT FALSE,
            clarification_question TEXT,
            model_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 3,
            last_error TEXT,
            lease_token UUID,
            lease_expires_at TIMESTAMPTZ,
            started_at TIMESTAMPTZ,
            finished_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT assignment_outline_scaffolds_revision_key UNIQUE (assignment_revision_id)
        );
        CREATE INDEX assignment_outline_scaffolds_status_idx ON assignment_outline_scaffolds (status);
        """
    )
