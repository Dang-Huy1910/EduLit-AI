"""Make the writing profile cumulative and keep its version history.

Revision ID: 0018_writing_profile_history
Revises: 0017_terms_and_class_join
Create Date: 2026-10-22

`writing_profiles.analyzed_sources` records which published results the
current profile already read, so a refresh only sends new papers to the model
together with the previous profile. Every successful synthesis also appends a
compact snapshot to `writing_profile_versions` for the progress view.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0018_writing_profile_history"
down_revision: Union[str, Sequence[str], None] = "0017_terms_and_class_join"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE writing_profiles
            ADD COLUMN IF NOT EXISTS analyzed_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;

        CREATE TABLE IF NOT EXISTS writing_profile_versions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            student_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            version INTEGER NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            traits JSONB NOT NULL DEFAULT '[]'::jsonb,
            source_count INTEGER NOT NULL DEFAULT 0,
            new_source_count INTEGER NOT NULL DEFAULT 0,
            evidence_count INTEGER NOT NULL DEFAULT 0,
            prompt_version VARCHAR(32) NOT NULL DEFAULT 'v1',
            model VARCHAR(64) NOT NULL DEFAULT '',
            analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT writing_profile_versions_student_version_key UNIQUE (student_id, version)
        );
        CREATE INDEX IF NOT EXISTS writing_profile_versions_student_idx
            ON writing_profile_versions (student_id, version DESC);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS writing_profile_versions;
        ALTER TABLE writing_profiles
            DROP COLUMN IF EXISTS version,
            DROP COLUMN IF EXISTS analyzed_sources;
        """
    )
