"""Rename the demo classroom 11A14 to 12A14.

Revision ID: 0015_classroom_12a14
Revises: 0014_teacher_env_password
Create Date: 2026-10-20

The demo class moved up a grade for semester I 2026-2027. The classroom id is
kept, so memberships, assignments and published results stay linked. A
database that already ran scripts/sql/rename-classroom-12a14.sql, or that
already has a 12A14 classroom for the teacher, is left unchanged.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0015_classroom_12a14"
down_revision: Union[str, Sequence[str], None] = "0014_teacher_env_password"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _rename(old_code: str, new_code: str, name: str, grade_level: int) -> None:
    op.execute(
        f"""
        UPDATE classrooms AS c
        SET code = '{new_code}',
            name = '{name}',
            grade_level = {grade_level},
            updated_at = now()
        FROM users AS u
        WHERE c.owner_teacher_id = u.id
          AND u.login_id = 'dang.loan'
          AND c.code = '{old_code}'
          AND NOT EXISTS (
              SELECT 1 FROM classrooms AS other
              WHERE other.owner_teacher_id = c.owner_teacher_id
                AND other.code = '{new_code}'
          );
        """
    )


def upgrade() -> None:
    _rename("11A14", "12A14", "Lớp 12A14 • THPT Đan Phượng", 12)


def downgrade() -> None:
    _rename("12A14", "11A14", "Lớp 11A14 • THPT Đan Phượng", 11)
