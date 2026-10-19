"""Student handwritten submissions and OCR review.

Revision ID: 0010_submission_ocr
Revises: 0009_student_outline_preps
Create Date: 2026-10-19

Student confirms the transcription. No teacher OCR-approval table.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0010_submission_ocr"
down_revision: Union[str, Sequence[str], None] = "0009_student_outline_preps"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE submissions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            assignment_revision_id UUID NOT NULL REFERENCES assignment_revisions (id) ON DELETE CASCADE,
            student_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            current_attempt_id UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT submissions_revision_student_key UNIQUE (assignment_revision_id, student_id)
        );
        CREATE INDEX submissions_student_id_idx ON submissions (student_id);
        CREATE INDEX submissions_revision_id_idx ON submissions (assignment_revision_id);

        CREATE TABLE submission_attempts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            submission_id UUID NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
            assignment_revision_id UUID NOT NULL REFERENCES assignment_revisions (id) ON DELETE CASCADE,
            attempt_number INTEGER NOT NULL,
            state VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
            input_hash VARCHAR(64),
            page_count INTEGER NOT NULL DEFAULT 0,
            submitted_at TIMESTAMPTZ,
            ocr_status VARCHAR(32) NOT NULL DEFAULT 'NONE',
            ocr_attempt_count INTEGER NOT NULL DEFAULT 0,
            ocr_max_attempts INTEGER NOT NULL DEFAULT 3,
            ocr_lease_token UUID,
            ocr_lease_expires_at TIMESTAMPTZ,
            ocr_last_error TEXT,
            ocr_page_errors JSONB NOT NULL DEFAULT '{}'::jsonb,
            ocr_started_at TIMESTAMPTZ,
            ocr_finished_at TIMESTAMPTZ,
            ocr_model_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            current_revision INTEGER NOT NULL DEFAULT 0,
            confirmed_revision_id UUID,
            confirmed_at TIMESTAMPTZ,
            confirmed_by UUID REFERENCES users (id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT submission_attempts_submission_number_key UNIQUE (submission_id, attempt_number)
        );
        CREATE INDEX submission_attempts_state_idx ON submission_attempts (state);
        CREATE INDEX submission_attempts_ocr_claim_idx
            ON submission_attempts (ocr_status, ocr_lease_expires_at, created_at);
        CREATE INDEX submission_attempts_submission_id_idx ON submission_attempts (submission_id);
        CREATE INDEX submission_attempts_input_hash_idx ON submission_attempts (submission_id, input_hash);

        CREATE TABLE submission_pages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            attempt_id UUID NOT NULL REFERENCES submission_attempts (id) ON DELETE CASCADE,
            page_index INTEGER NOT NULL,
            original_filename VARCHAR(255) NOT NULL DEFAULT '',
            mime_type VARCHAR(128) NOT NULL,
            byte_size INTEGER NOT NULL DEFAULT 0,
            width INTEGER NOT NULL DEFAULT 0,
            height INTEGER NOT NULL DEFAULT 0,
            rotation_degrees INTEGER NOT NULL DEFAULT 0,
            mask_regions JSONB NOT NULL DEFAULT '[]'::jsonb,
            original_sha256 VARCHAR(64) NOT NULL DEFAULT '',
            processed_sha256 VARCHAR(64) NOT NULL DEFAULT '',
            processed_mime_type VARCHAR(128) NOT NULL DEFAULT 'image/jpeg',
            processed_byte_size INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT submission_pages_attempt_index_key UNIQUE (attempt_id, page_index)
        );
        CREATE INDEX submission_pages_attempt_id_idx ON submission_pages (attempt_id);

        CREATE TABLE submission_page_blobs (
            page_id UUID NOT NULL REFERENCES submission_pages (id) ON DELETE CASCADE,
            kind VARCHAR(16) NOT NULL,
            mime_type VARCHAR(128) NOT NULL,
            sha256 VARCHAR(64) NOT NULL,
            byte_size INTEGER NOT NULL,
            bytes BYTEA NOT NULL,
            PRIMARY KEY (page_id, kind)
        );

        CREATE TABLE ocr_results (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            attempt_id UUID NOT NULL UNIQUE REFERENCES submission_attempts (id) ON DELETE CASCADE,
            pages JSONB NOT NULL DEFAULT '[]'::jsonb,
            raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            prompt_version VARCHAR(32) NOT NULL DEFAULT '',
            schema_version VARCHAR(32) NOT NULL DEFAULT '',
            provider VARCHAR(32) NOT NULL DEFAULT '',
            model VARCHAR(64) NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE transcription_revisions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            attempt_id UUID NOT NULL REFERENCES submission_attempts (id) ON DELETE CASCADE,
            ocr_result_id UUID REFERENCES ocr_results (id) ON DELETE SET NULL,
            revision INTEGER NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
            pages JSONB NOT NULL DEFAULT '[]'::jsonb,
            confirmed_at TIMESTAMPTZ,
            confirmed_by UUID REFERENCES users (id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT transcription_revisions_attempt_revision_key UNIQUE (attempt_id, revision)
        );
        CREATE INDEX transcription_revisions_attempt_id_idx ON transcription_revisions (attempt_id);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS transcription_revisions;
        DROP TABLE IF EXISTS ocr_results;
        DROP TABLE IF EXISTS submission_page_blobs;
        DROP TABLE IF EXISTS submission_pages;
        DROP TABLE IF EXISTS submission_attempts;
        DROP TABLE IF EXISTS submissions;
        """
    )
