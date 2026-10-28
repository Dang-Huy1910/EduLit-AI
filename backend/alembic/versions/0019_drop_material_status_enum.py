"""Drop the unused material version status enum.

Revision ID: 0019_drop_material_status_enum
Revises: 0018_writing_profile_history
Create Date: 2026-10-28

material_versions.status remains VARCHAR(16).
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0019_drop_material_status_enum"
down_revision: Union[str, Sequence[str], None] = "0018_writing_profile_history"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP TYPE IF EXISTS material_version_status")


def downgrade() -> None:
    op.execute(
        "CREATE TYPE material_version_status AS ENUM "
        "('UPLOADED', 'PRIVACY_REVIEW', 'READY', 'FAILED')"
    )
