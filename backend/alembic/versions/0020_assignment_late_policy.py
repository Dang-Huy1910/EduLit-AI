"""Add assignment late submission policy and student due extensions.

Revision ID: 0020_assignment_late_policy
Revises: 0019_drop_material_status_enum
Create Date: 2026-10-28

Existing assignments keep accepting late submissions by default.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0020_assignment_late_policy"
down_revision: Union[str, Sequence[str], None] = "0019_drop_material_status_enum"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE assignments
            ADD COLUMN late_policy VARCHAR(16) NOT NULL DEFAULT 'ALLOW_LATE',
            ADD COLUMN due_extensions JSONB NOT NULL DEFAULT '{}'::jsonb,
            ADD CONSTRAINT assignments_late_policy_check
                CHECK (late_policy IN ('ALLOW_LATE', 'CLOSE_AT_DUE'));
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE assignments
            DROP CONSTRAINT assignments_late_policy_check,
            DROP COLUMN due_extensions,
            DROP COLUMN late_policy;
        """
    )
