"""Cache one synthesized writing profile per student.

Revision ID: 0016_writing_profile
Revises: 0015_classroom_12a14
Create Date: 2026-10-20

The profile is derived from results the teacher already published. One JSON
payload per student; `source_hash` decides whether the cache is still valid.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0016_writing_profile"
down_revision: Union[str, Sequence[str], None] = "0015_classroom_12a14"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS writing_profiles (
            student_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            source_hash VARCHAR(64) NOT NULL DEFAULT '',
            source_count INTEGER NOT NULL DEFAULT 0,
            evidence_count INTEGER NOT NULL DEFAULT 0,
            prompt_version VARCHAR(32) NOT NULL DEFAULT 'v1',
            schema_version VARCHAR(32) NOT NULL DEFAULT '',
            provider VARCHAR(32) NOT NULL DEFAULT '',
            model VARCHAR(64) NOT NULL DEFAULT '',
            analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS writing_profiles_updated_at_idx
            ON writing_profiles (updated_at);
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS writing_profiles;")