"""Add terms, subject classrooms, and classroom join codes.

Revision ID: 0017_terms_and_class_join
Revises: 0016_writing_profile
Create Date: 2026-10-21

Adds academic terms, ties subject classrooms to a term, and gives every
existing classroom a join code for student self-enrollment.
"""

from __future__ import annotations

import secrets
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017_terms_and_class_join"
down_revision: Union[str, Sequence[str], None] = "0016_writing_profile"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
JOIN_CODE_LENGTH = 6


def _generate_join_code() -> str:
    return "".join(secrets.choice(JOIN_CODE_ALPHABET) for _ in range(JOIN_CODE_LENGTH))


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE terms (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code VARCHAR(32) NOT NULL UNIQUE,
            name VARCHAR(64) NOT NULL,
            academic_year VARCHAR(16) NOT NULL,
            starts_on DATE NOT NULL,
            ends_on DATE NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT terms_dates_check CHECK (ends_on > starts_on)
        );

        INSERT INTO terms (code, name, academic_year, starts_on, ends_on)
        VALUES
            ('2026-2027-HK1', 'Học kỳ I', '2026-2027', '2026-09-05', '2027-01-16'),
            ('2026-2027-HK2', 'Học kỳ II', '2026-2027', '2027-01-18', '2027-05-31')
        ON CONFLICT (code) DO NOTHING;

        ALTER TABLE classrooms
            ADD COLUMN term_id UUID NULL REFERENCES terms (id) ON DELETE RESTRICT,
            ADD COLUMN subject VARCHAR(64) NOT NULL DEFAULT 'Ngữ văn',
            ADD COLUMN join_code VARCHAR(8) NULL,
            ADD COLUMN join_enabled BOOLEAN NOT NULL DEFAULT true,
            ADD COLUMN archived_at TIMESTAMPTZ NULL;

        UPDATE classrooms
        SET term_id = (SELECT id FROM terms WHERE code = '2026-2027-HK1')
        WHERE term_id IS NULL;

        ALTER TABLE classrooms ALTER COLUMN term_id SET NOT NULL;
        """
    )

    bind = op.get_bind()
    classroom_ids = bind.execute(
        sa.text("SELECT id FROM classrooms WHERE join_code IS NULL")
    ).scalars()
    issued: set[str] = set()
    for classroom_id in classroom_ids:
        join_code = _generate_join_code()
        while join_code in issued:
            join_code = _generate_join_code()
        issued.add(join_code)
        bind.execute(
            sa.text("UPDATE classrooms SET join_code = :join_code WHERE id = :id"),
            {"join_code": join_code, "id": classroom_id},
        )

    op.execute(
        """
        ALTER TABLE classrooms ALTER COLUMN join_code SET NOT NULL;
        CREATE UNIQUE INDEX classrooms_join_code_key ON classrooms (join_code);

        ALTER TABLE classrooms DROP CONSTRAINT classrooms_owner_code_key;
        ALTER TABLE classrooms
            ADD CONSTRAINT classrooms_term_subject_code_key UNIQUE (term_id, subject, code);
        CREATE INDEX classrooms_term_id_idx ON classrooms (term_id);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX classrooms_term_id_idx;
        ALTER TABLE classrooms DROP CONSTRAINT classrooms_term_subject_code_key;
        DROP INDEX classrooms_join_code_key;

        ALTER TABLE classrooms
            ADD CONSTRAINT classrooms_owner_code_key UNIQUE (owner_teacher_id, code);
        ALTER TABLE classrooms
            DROP COLUMN archived_at,
            DROP COLUMN join_enabled,
            DROP COLUMN join_code,
            DROP COLUMN subject,
            DROP COLUMN term_id;

        DROP TABLE terms;
        """
    )
