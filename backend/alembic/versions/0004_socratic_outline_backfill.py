"""Backfill outline_version and normalize legacy Socratic outline rows.

Revision ID: 0004_socratic_outline_backfill
Revises: 0003_socratic_reservation_access
Create Date: 2026-10-18

0003 added outline_version DEFAULT 0 and the one-ACCEPTED unique index
without backfilling existing outline history. Sessions that already had
dàn ý would look empty (outline_version=0) and the next save could
collide with revision 1.

This revision:
- Drops the unique accepted index so leftover duplicate ACCEPTED rows
  can be normalized.
- Keeps the highest ACCEPTED revision per session; marks older ACCEPTED
  rows SUPERSEDED without deleting content.
- Backfills socratic_sessions.outline_version from the current outline
  (accepted max, else any max revision, else 0).
- Recreates the unique accepted index after data is clean.

Downgrade leaves backfilled values in place (compatible with 0003).
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0004_socratic_outline_backfill"
down_revision: Union[str, Sequence[str], None] = "0003_socratic_reservation_access"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS outline_revisions_one_accepted_per_session;")
    op.execute(
        """
        UPDATE outline_revisions AS o
        SET review_status = 'SUPERSEDED'
        WHERE o.review_status = 'ACCEPTED'
          AND o.revision < (
              SELECT MAX(o2.revision)
              FROM outline_revisions AS o2
              WHERE o2.session_id = o.session_id
                AND o2.review_status = 'ACCEPTED'
          );
        """
    )
    op.execute(
        """
        UPDATE socratic_sessions AS s
        SET outline_version = COALESCE(
            (
                SELECT MAX(r.revision)
                FROM outline_revisions AS r
                WHERE r.session_id = s.id
                  AND r.review_status = 'ACCEPTED'
            ),
            (
                SELECT MAX(r.revision)
                FROM outline_revisions AS r
                WHERE r.session_id = s.id
            ),
            0
        );
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX outline_revisions_one_accepted_per_session
            ON outline_revisions (session_id)
            WHERE review_status = 'ACCEPTED';
        """
    )


def downgrade() -> None:
    # Backfilled outline_version values remain valid under 0003.
    # Unique index is the same object 0003 created; leave it in place.
    pass
