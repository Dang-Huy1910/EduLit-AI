"""Add outline init status and chat turn metadata.

Revision ID: 0005_socratic_outline_init
Revises: 0004_socratic_outline_backfill
Create Date: 2026-10-19

Stores the one-time AI outline initialization lifecycle on the session so
refresh/retry/concurrent tabs cannot overwrite a student-edited outline.
Persists turn_meta (intent, applied ops, proposals) on chat messages.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0005_socratic_outline_init"
down_revision: Union[str, Sequence[str], None] = "0004_socratic_outline_backfill"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "socratic_sessions",
        sa.Column(
            "outline_init_status",
            sa.String(length=32),
            nullable=False,
            server_default=sa.text("'NONE'"),
        ),
    )
    op.execute(
        """
        UPDATE socratic_sessions
        SET outline_init_status = 'COMPLETED'
        WHERE outline_version > 0
        """
    )
    op.add_column(
        "chat_messages",
        sa.Column("turn_meta", JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("chat_messages", "turn_meta")
    op.drop_column("socratic_sessions", "outline_init_status")
