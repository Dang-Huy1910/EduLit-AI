"""Generalize class insight cache for assignment and competency scopes.

Revision ID: 0012_teaching_insights
Revises: 0011_assessment_grading
Create Date: 2026-10-19

Keeps existing insight rows. One assignment previously mapped to one official
cache; provisional and multi-assignment caches are additional rows.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0012_teaching_insights"
down_revision: Union[str, Sequence[str], None] = "0011_assessment_grading"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE class_insights
            ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES users (id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS scope_kind VARCHAR(32) NOT NULL DEFAULT 'assignment',
            ADD COLUMN IF NOT EXISTS scope_key VARCHAR(160) NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS mode VARCHAR(32) NOT NULL DEFAULT 'official',
            ADD COLUMN IF NOT EXISTS filter_fingerprint VARCHAR(64) NOT NULL DEFAULT '';

        ALTER TABLE class_insights
            ALTER COLUMN assignment_id DROP NOT NULL,
            ALTER COLUMN assignment_revision_id DROP NOT NULL;

        ALTER TABLE class_insights
            DROP CONSTRAINT IF EXISTS class_insights_assignment_id_key;

        UPDATE class_insights ci
        SET
            teacher_id = a.teacher_id,
            scope_kind = 'assignment',
            scope_key = 'assignment:' || ci.assignment_id::text,
            mode = 'official',
            filter_fingerprint = md5(ci.assignment_id::text)
        FROM assignments a
        WHERE ci.assignment_id = a.id
          AND (ci.teacher_id IS NULL OR ci.scope_key = '');

        DELETE FROM class_insights WHERE teacher_id IS NULL;

        ALTER TABLE class_insights
            ALTER COLUMN teacher_id SET NOT NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS class_insights_teacher_scope_mode_key
            ON class_insights (teacher_id, scope_key, mode);
        CREATE INDEX IF NOT EXISTS class_insights_teacher_id_idx
            ON class_insights (teacher_id);
        CREATE INDEX IF NOT EXISTS class_insights_assignment_id_idx
            ON class_insights (assignment_id);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM class_insights WHERE assignment_id IS NULL OR scope_kind <> 'assignment';
        DROP INDEX IF EXISTS class_insights_teacher_scope_mode_key;
        DROP INDEX IF EXISTS class_insights_teacher_id_idx;
        DROP INDEX IF EXISTS class_insights_assignment_id_idx;
        ALTER TABLE class_insights
            DROP COLUMN IF EXISTS teacher_id,
            DROP COLUMN IF EXISTS scope_kind,
            DROP COLUMN IF EXISTS scope_key,
            DROP COLUMN IF EXISTS mode,
            DROP COLUMN IF EXISTS filter_fingerprint;
        ALTER TABLE class_insights
            ALTER COLUMN assignment_id SET NOT NULL,
            ALTER COLUMN assignment_revision_id SET NOT NULL;
        ALTER TABLE class_insights
            ADD CONSTRAINT class_insights_assignment_id_key UNIQUE (assignment_id);
        """
    )
