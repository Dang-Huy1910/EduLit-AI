"""Add assignment revision limits, submission rounds, and superseded results.

Revision ID: 0022_revision_rounds
Revises: 0021_teacher_document_ocr
Create Date: 2026-10-28

All existing attempts belong to round 1; revisions remain disabled by default.
Existing results keep superseded_at NULL because legacy publication history
cannot distinguish replacement by a newer round from manual unpublishing.
Those old unpublished results therefore remain hidden from students.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0022_revision_rounds"
down_revision: Union[str, Sequence[str], None] = "0021_teacher_document_ocr"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE assignments
            ADD COLUMN max_revisions INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN revision_due_at TIMESTAMPTZ,
            ADD CONSTRAINT assignments_max_revisions_check
                CHECK (max_revisions >= 0 AND max_revisions <= 2);

        ALTER TABLE submission_attempts
            ADD COLUMN revision_round INTEGER NOT NULL DEFAULT 1,
            ADD CONSTRAINT submission_attempts_revision_round_check CHECK (revision_round >= 1);

        ALTER TABLE assessment_results ADD COLUMN superseded_at TIMESTAMPTZ;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE assessment_results DROP COLUMN superseded_at;
        ALTER TABLE submission_attempts
            DROP CONSTRAINT submission_attempts_revision_round_check,
            DROP COLUMN revision_round;
        ALTER TABLE assignments
            DROP CONSTRAINT assignments_max_revisions_check,
            DROP COLUMN revision_due_at,
            DROP COLUMN max_revisions;
        """
    )
