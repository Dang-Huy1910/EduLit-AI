"""Rubric grading jobs, published results, and class insights.

Revision ID: 0011_assessment_grading
Revises: 0010_submission_ocr
Create Date: 2026-10-19

Splits OCR freeze time from official submit. Backfills official_submitted_at
from confirmed_at and enqueues grading jobs for already-confirmed attempts.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0011_assessment_grading"
down_revision: Union[str, Sequence[str], None] = "0010_submission_ocr"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE submission_attempts
            ADD COLUMN official_submitted_at TIMESTAMPTZ;

        UPDATE submission_attempts
        SET official_submitted_at = confirmed_at
        WHERE state = 'READY_TO_GRADE' AND confirmed_at IS NOT NULL;

        ALTER TABLE submissions
            ADD COLUMN current_assessment_job_id UUID,
            ADD COLUMN current_assessment_result_id UUID,
            ADD COLUMN current_published_result_id UUID,
            ADD COLUMN reopen_granted_at TIMESTAMPTZ,
            ADD COLUMN reopen_granted_by UUID REFERENCES users (id) ON DELETE SET NULL,
            ADD COLUMN published_history JSONB NOT NULL DEFAULT '[]'::jsonb;

        CREATE TABLE assessment_jobs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            submission_id UUID NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
            attempt_id UUID NOT NULL REFERENCES submission_attempts (id) ON DELETE CASCADE,
            transcription_revision_id UUID NOT NULL REFERENCES transcription_revisions (id) ON DELETE CASCADE,
            assignment_revision_id UUID NOT NULL REFERENCES assignment_revisions (id) ON DELETE CASCADE,
            student_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            input_hash VARCHAR(64) NOT NULL DEFAULT '',
            status VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
            attempt_count INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 3,
            lease_token UUID,
            lease_expires_at TIMESTAMPTZ,
            last_error TEXT,
            started_at TIMESTAMPTZ,
            finished_at TIMESTAMPTZ,
            prompt_version VARCHAR(32) NOT NULL DEFAULT 'v1',
            schema_version VARCHAR(32) NOT NULL DEFAULT '',
            provider VARCHAR(32) NOT NULL DEFAULT '',
            model VARCHAR(64) NOT NULL DEFAULT '',
            result_id UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT assessment_jobs_transcription_revision_key UNIQUE (transcription_revision_id)
        );
        CREATE INDEX assessment_jobs_submission_id_idx ON assessment_jobs (submission_id);
        CREATE INDEX assessment_jobs_student_id_idx ON assessment_jobs (student_id);
        CREATE INDEX assessment_jobs_claim_idx
            ON assessment_jobs (status, lease_expires_at, created_at);
        CREATE INDEX assessment_jobs_input_hash_idx ON assessment_jobs (input_hash);

        CREATE TABLE assessment_results (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            job_id UUID NOT NULL REFERENCES assessment_jobs (id) ON DELETE CASCADE,
            submission_id UUID NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
            attempt_id UUID NOT NULL REFERENCES submission_attempts (id) ON DELETE CASCADE,
            transcription_revision_id UUID NOT NULL REFERENCES transcription_revisions (id) ON DELETE CASCADE,
            assignment_revision_id UUID NOT NULL REFERENCES assignment_revisions (id) ON DELETE CASCADE,
            student_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            rubric_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
            prompt_version VARCHAR(32) NOT NULL DEFAULT '',
            schema_version VARCHAR(32) NOT NULL DEFAULT '',
            provider VARCHAR(32) NOT NULL DEFAULT '',
            model VARCHAR(64) NOT NULL DEFAULT '',
            ai_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            ai_raw JSONB NOT NULL DEFAULT '{}'::jsonb,
            ai_total_score NUMERIC(8, 2) NOT NULL,
            teacher_payload JSONB,
            teacher_id UUID REFERENCES users (id) ON DELETE SET NULL,
            teacher_updated_at TIMESTAMPTZ,
            total_score NUMERIC(8, 2) NOT NULL,
            max_score NUMERIC(8, 2) NOT NULL,
            score_step NUMERIC(8, 2) NOT NULL,
            score_scale10 NUMERIC(8, 2) NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            is_published BOOLEAN NOT NULL DEFAULT FALSE,
            published_payload JSONB,
            published_at TIMESTAMPTZ,
            published_by UUID REFERENCES users (id) ON DELETE SET NULL,
            unpublished_at TIMESTAMPTZ,
            published_history JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX assessment_results_job_id_idx ON assessment_results (job_id);
        CREATE INDEX assessment_results_submission_id_idx ON assessment_results (submission_id);
        CREATE INDEX assessment_results_transcription_idx ON assessment_results (transcription_revision_id);
        CREATE INDEX assessment_results_published_idx ON assessment_results (is_published);

        CREATE TABLE class_insights (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            assignment_id UUID NOT NULL UNIQUE REFERENCES assignments (id) ON DELETE CASCADE,
            assignment_revision_id UUID NOT NULL REFERENCES assignment_revisions (id) ON DELETE CASCADE,
            input_hash VARCHAR(64) NOT NULL DEFAULT '',
            status VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
            attempt_count INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 3,
            lease_token UUID,
            lease_expires_at TIMESTAMPTZ,
            last_error TEXT,
            started_at TIMESTAMPTZ,
            finished_at TIMESTAMPTZ,
            prompt_version VARCHAR(32) NOT NULL DEFAULT 'v1',
            schema_version VARCHAR(32) NOT NULL DEFAULT '',
            provider VARCHAR(32) NOT NULL DEFAULT '',
            model VARCHAR(64) NOT NULL DEFAULT '',
            stats_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
            payload JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX class_insights_claim_idx
            ON class_insights (status, lease_expires_at, created_at);

        INSERT INTO assessment_jobs (
            submission_id,
            attempt_id,
            transcription_revision_id,
            assignment_revision_id,
            student_id,
            input_hash,
            status,
            max_attempts,
            prompt_version,
            schema_version
        )
        SELECT
            s.id,
            a.id,
            a.confirmed_revision_id,
            a.assignment_revision_id,
            s.student_id,
            '',
            'QUEUED',
            3,
            'v1',
            'assessment_output.v1'
        FROM submission_attempts a
        JOIN submissions s ON s.id = a.submission_id
        WHERE a.state = 'READY_TO_GRADE'
          AND a.confirmed_revision_id IS NOT NULL
        ON CONFLICT (transcription_revision_id) DO NOTHING;

        UPDATE submissions s
        SET current_assessment_job_id = j.id,
            updated_at = now()
        FROM assessment_jobs j
        WHERE j.submission_id = s.id
          AND s.current_attempt_id = j.attempt_id
          AND s.current_assessment_job_id IS NULL;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS class_insights;
        DROP TABLE IF EXISTS assessment_results;
        DROP TABLE IF EXISTS assessment_jobs;
        ALTER TABLE submissions
            DROP COLUMN IF EXISTS published_history,
            DROP COLUMN IF EXISTS reopen_granted_by,
            DROP COLUMN IF EXISTS reopen_granted_at,
            DROP COLUMN IF EXISTS current_published_result_id,
            DROP COLUMN IF EXISTS current_assessment_result_id,
            DROP COLUMN IF EXISTS current_assessment_job_id;
        ALTER TABLE submission_attempts
            DROP COLUMN IF EXISTS official_submitted_at;
        """
    )
