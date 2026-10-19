"""Teacher catalog, classrooms, and assignment instances.

Revision ID: 0006_teacher_catalog
Revises: 0005_socratic_outline_init
Create Date: 2026-10-19

Adds chuyên đề, ngữ liệu, đề nguồn, barem, lớp, and assignment rows.
Published assignments freeze a snapshot into assignment_revisions.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0006_teacher_catalog"
down_revision: Union[str, Sequence[str], None] = "0005_socratic_outline_init"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE classrooms (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            owner_teacher_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
            code VARCHAR(32) NOT NULL,
            name VARCHAR(128) NOT NULL,
            grade_level INTEGER NOT NULL,
            academic_year VARCHAR(16) NOT NULL DEFAULT '2026-2027',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT classrooms_owner_code_key UNIQUE (owner_teacher_id, code)
        );
        CREATE INDEX classrooms_owner_teacher_id_idx ON classrooms (owner_teacher_id);

        CREATE TABLE class_memberships (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            classroom_id UUID NOT NULL REFERENCES classrooms (id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            membership_role VARCHAR(16) NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT class_memberships_class_user_key UNIQUE (classroom_id, user_id)
        );
        CREATE INDEX class_memberships_user_id_idx ON class_memberships (user_id);

        CREATE TABLE topics (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            owner_teacher_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
            title VARCHAR(255) NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            grade_level INTEGER NOT NULL,
            genre VARCHAR(32) NOT NULL DEFAULT 'NLVH',
            status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX topics_owner_teacher_id_idx ON topics (owner_teacher_id);

        CREATE TABLE materials (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            owner_teacher_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
            topic_id UUID NULL REFERENCES topics (id) ON DELETE SET NULL,
            title VARCHAR(255) NOT NULL,
            author VARCHAR(255) NOT NULL DEFAULT '',
            source_info TEXT NOT NULL DEFAULT '',
            grade_level INTEGER NOT NULL DEFAULT 11,
            status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX materials_owner_teacher_id_idx ON materials (owner_teacher_id);
        CREATE INDEX materials_topic_id_idx ON materials (topic_id);

        CREATE TABLE material_versions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            material_id UUID NOT NULL REFERENCES materials (id) ON DELETE CASCADE,
            version INTEGER NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            source_notes JSONB NOT NULL DEFAULT '[]',
            status VARCHAR(16) NOT NULL DEFAULT 'READY',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT material_versions_material_version_key UNIQUE (material_id, version)
        );
        CREATE INDEX material_versions_material_id_idx ON material_versions (material_id);

        CREATE TABLE material_chunks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            material_version_id UUID NOT NULL REFERENCES material_versions (id) ON DELETE CASCADE,
            chunk_id VARCHAR(64) NOT NULL,
            title VARCHAR(255) NOT NULL DEFAULT '',
            text TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            CONSTRAINT material_chunks_version_chunk_key UNIQUE (material_version_id, chunk_id)
        );
        CREATE INDEX material_chunks_version_id_idx ON material_chunks (material_version_id);

        CREATE TABLE source_prompts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            owner_teacher_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
            topic_id UUID NULL REFERENCES topics (id) ON DELETE SET NULL,
            title VARCHAR(255) NOT NULL,
            writing_task TEXT NOT NULL DEFAULT '',
            extra_guidance TEXT NOT NULL DEFAULT '',
            genre VARCHAR(32) NOT NULL DEFAULT 'NLVH',
            grade_level INTEGER NOT NULL DEFAULT 11,
            status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX source_prompts_owner_teacher_id_idx ON source_prompts (owner_teacher_id);
        CREATE INDEX source_prompts_topic_id_idx ON source_prompts (topic_id);

        CREATE TABLE source_prompt_materials (
            source_prompt_id UUID NOT NULL REFERENCES source_prompts (id) ON DELETE CASCADE,
            material_id UUID NOT NULL REFERENCES materials (id) ON DELETE CASCADE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (source_prompt_id, material_id)
        );

        CREATE TABLE rubrics (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            owner_teacher_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
            title VARCHAR(255) NOT NULL,
            short_title VARCHAR(128) NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            status VARCHAR(16) NOT NULL DEFAULT 'READY',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX rubrics_owner_teacher_id_idx ON rubrics (owner_teacher_id);

        CREATE TABLE rubric_versions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            rubric_id UUID NOT NULL REFERENCES rubrics (id) ON DELETE CASCADE,
            version INTEGER NOT NULL,
            max_score NUMERIC(8, 2) NOT NULL,
            score_step NUMERIC(8, 2) NOT NULL DEFAULT 0.25,
            criteria JSONB NOT NULL DEFAULT '[]',
            status VARCHAR(16) NOT NULL DEFAULT 'APPROVED',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT rubric_versions_rubric_version_key UNIQUE (rubric_id, version)
        );
        CREATE INDEX rubric_versions_rubric_id_idx ON rubric_versions (rubric_id);

        CREATE TABLE assignments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            teacher_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
            classroom_id UUID NULL REFERENCES classrooms (id) ON DELETE SET NULL,
            source_prompt_id UUID NOT NULL REFERENCES source_prompts (id) ON DELETE RESTRICT,
            rubric_id UUID NULL REFERENCES rubrics (id) ON DELETE SET NULL,
            rubric_version_id UUID NULL REFERENCES rubric_versions (id) ON DELETE SET NULL,
            published_revision_id UUID NULL,
            title VARCHAR(255) NOT NULL,
            extra_instructions TEXT NOT NULL DEFAULT '',
            assignment_rubric JSONB NOT NULL DEFAULT '{}',
            max_score NUMERIC(8, 2) NOT NULL DEFAULT 4,
            score_step NUMERIC(8, 2) NOT NULL DEFAULT 0.25,
            due_at TIMESTAMPTZ NULL,
            code VARCHAR(32) NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
            recipient_student_ids JSONB NOT NULL DEFAULT '[]',
            published_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT assignments_code_key UNIQUE (code)
        );
        CREATE INDEX assignments_teacher_id_idx ON assignments (teacher_id);
        CREATE INDEX assignments_classroom_id_idx ON assignments (classroom_id);
        CREATE INDEX assignments_source_prompt_id_idx ON assignments (source_prompt_id);
        CREATE INDEX assignments_status_idx ON assignments (status);

        ALTER TABLE assignment_revisions
            ADD COLUMN assignment_id UUID NULL REFERENCES assignments (id) ON DELETE SET NULL,
            ADD COLUMN snapshot JSONB NULL,
            ADD COLUMN due_at TIMESTAMPTZ NULL;
        CREATE INDEX assignment_revisions_assignment_id_idx
            ON assignment_revisions (assignment_id);

        ALTER TABLE assignments
            ADD CONSTRAINT assignments_published_revision_id_fkey
            FOREIGN KEY (published_revision_id) REFERENCES assignment_revisions (id)
            ON DELETE SET NULL;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_published_revision_id_fkey;
        ALTER TABLE assignment_revisions DROP COLUMN IF EXISTS due_at;
        ALTER TABLE assignment_revisions DROP COLUMN IF EXISTS snapshot;
        ALTER TABLE assignment_revisions DROP COLUMN IF EXISTS assignment_id;
        DROP TABLE IF EXISTS assignments;
        DROP TABLE IF EXISTS rubric_versions;
        DROP TABLE IF EXISTS rubrics;
        DROP TABLE IF EXISTS source_prompt_materials;
        DROP TABLE IF EXISTS source_prompts;
        DROP TABLE IF EXISTS material_chunks;
        DROP TABLE IF EXISTS material_versions;
        DROP TABLE IF EXISTS materials;
        DROP TABLE IF EXISTS topics;
        DROP TABLE IF EXISTS class_memberships;
        DROP TABLE IF EXISTS classrooms;
        """
    )
