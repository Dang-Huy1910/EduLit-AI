"""Add durable OCR state and leases for teacher documents.

Revision ID: 0021_teacher_document_ocr
Revises: 0020_assignment_late_policy
Create Date: 2026-10-28
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0021_teacher_document_ocr"
down_revision: Union[str, Sequence[str], None] = "0020_assignment_late_policy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE teacher_documents
            ADD COLUMN ocr_status VARCHAR(16) NOT NULL DEFAULT 'NONE',
            ADD COLUMN ocr_attempt_count INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN ocr_lease_token UUID,
            ADD COLUMN ocr_lease_expires_at TIMESTAMPTZ,
            ADD COLUMN ocr_page_count INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN ocr_pages_done INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN ocr_last_error TEXT NOT NULL DEFAULT '',
            ADD COLUMN ocr_finished_at TIMESTAMPTZ,
            ADD COLUMN ocr_model_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            ADD CONSTRAINT teacher_documents_ocr_status_check
                CHECK (ocr_status IN ('NONE', 'QUEUED', 'PROCESSING', 'DONE', 'FAILED'));

        CREATE INDEX teacher_documents_ocr_claim_idx ON teacher_documents (ocr_status)
            WHERE ocr_status IN ('QUEUED', 'PROCESSING');
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX teacher_documents_ocr_claim_idx;
        ALTER TABLE teacher_documents
            DROP CONSTRAINT teacher_documents_ocr_status_check,
            DROP COLUMN ocr_model_metadata,
            DROP COLUMN ocr_finished_at,
            DROP COLUMN ocr_last_error,
            DROP COLUMN ocr_pages_done,
            DROP COLUMN ocr_page_count,
            DROP COLUMN ocr_lease_expires_at,
            DROP COLUMN ocr_lease_token,
            DROP COLUMN ocr_attempt_count,
            DROP COLUMN ocr_status;
        """
    )
