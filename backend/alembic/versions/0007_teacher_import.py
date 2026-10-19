"""Teacher document import: original BYTEA, conversion, analysis draft.

Revision ID: 0007_teacher_import
Revises: 0006_teacher_catalog
Create Date: 2026-10-19

Stores original uploaded bytes separately from catalog rows. Catalog
items may link back to the confirmed document.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0007_teacher_import"
down_revision: Union[str, Sequence[str], None] = "0006_teacher_catalog"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE teacher_documents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            owner_teacher_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
            original_filename VARCHAR(255) NOT NULL,
            mime_type VARCHAR(128) NOT NULL,
            byte_size INTEGER NOT NULL,
            sha256 VARCHAR(64) NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'UPLOADED',
            intent VARCHAR(16) NOT NULL DEFAULT 'MIXED',
            needs_ocr BOOLEAN NOT NULL DEFAULT FALSE,
            truncated BOOLEAN NOT NULL DEFAULT FALSE,
            conversion_warning TEXT NOT NULL DEFAULT '',
            error_code VARCHAR(64) NOT NULL DEFAULT '',
            error_message TEXT NOT NULL DEFAULT '',
            converted_markdown TEXT NOT NULL DEFAULT '',
            teacher_markdown TEXT,
            converted_markdown_sha256 VARCHAR(64) NOT NULL DEFAULT '',
            teacher_markdown_sha256 VARCHAR(64) NOT NULL DEFAULT '',
            analysis_json JSONB,
            analysis_markdown_sha256 VARCHAR(64) NOT NULL DEFAULT '',
            teacher_draft_json JSONB,
            teacher_draft_markdown_sha256 VARCHAR(64) NOT NULL DEFAULT '',
            selected_item_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            topic_id UUID REFERENCES topics (id) ON DELETE SET NULL,
            grade_level INTEGER NOT NULL DEFAULT 11,
            genre VARCHAR(32) NOT NULL DEFAULT 'NLVH',
            created_material_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_prompt_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_rubric_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            processing_started_at TIMESTAMPTZ,
            converted_at TIMESTAMPTZ,
            analyzed_at TIMESTAMPTZ,
            confirmed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX teacher_documents_owner_teacher_id_idx ON teacher_documents (owner_teacher_id);
        CREATE INDEX teacher_documents_status_idx ON teacher_documents (status);
        CREATE INDEX teacher_documents_sha256_idx ON teacher_documents (sha256);

        CREATE TABLE teacher_document_blobs (
            document_id UUID PRIMARY KEY REFERENCES teacher_documents (id) ON DELETE CASCADE,
            original_bytes BYTEA NOT NULL
        );

        ALTER TABLE materials
            ADD COLUMN source_document_id UUID REFERENCES teacher_documents (id) ON DELETE SET NULL;
        CREATE INDEX materials_source_document_id_idx ON materials (source_document_id);

        ALTER TABLE source_prompts
            ADD COLUMN writing_task_summary TEXT NOT NULL DEFAULT '',
            ADD COLUMN source_document_id UUID REFERENCES teacher_documents (id) ON DELETE SET NULL;
        CREATE INDEX source_prompts_source_document_id_idx ON source_prompts (source_document_id);

        ALTER TABLE rubrics
            ADD COLUMN source_document_id UUID REFERENCES teacher_documents (id) ON DELETE SET NULL;
        CREATE INDEX rubrics_source_document_id_idx ON rubrics (source_document_id);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE rubrics DROP COLUMN IF EXISTS source_document_id;
        ALTER TABLE source_prompts DROP COLUMN IF EXISTS source_document_id;
        ALTER TABLE source_prompts DROP COLUMN IF EXISTS writing_task_summary;
        ALTER TABLE materials DROP COLUMN IF EXISTS source_document_id;
        DROP TABLE IF EXISTS teacher_document_blobs;
        DROP TABLE IF EXISTS teacher_documents;
        """
    )
