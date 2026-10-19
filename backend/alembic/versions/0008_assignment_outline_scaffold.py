"""Precomputed outline scaffold for assignment revisions.

Revision ID: 0008_assignment_outline_scaffold
Revises: 0007_teacher_import
Create Date: 2026-10-19

Stores precomputed, validated outline scaffold for each published AssignmentRevision.
Superseded by 0009_student_outline_preps (per-student jobs).
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0008_assignment_outline_scaffold"
down_revision: Union[str, Sequence[str], None] = "0007_teacher_import"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
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


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS assignment_outline_scaffolds;
        """
    )
