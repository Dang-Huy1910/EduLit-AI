from __future__ import annotations

from datetime import timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.core.errors import ERROR_MESSAGES, ApiHttpException
from app.core.http import utcnow
from app.db.session import get_session_factory

_HIT_SQL = text(
    """
    INSERT INTO rate_limit_buckets (bucket_key, count, reset_at)
    VALUES (:key, 1, :reset_at)
    ON CONFLICT (bucket_key) DO UPDATE
    SET
        count = CASE
            WHEN rate_limit_buckets.reset_at <= now() THEN 1
            ELSE rate_limit_buckets.count + 1
        END,
        reset_at = CASE
            WHEN rate_limit_buckets.reset_at <= now() THEN EXCLUDED.reset_at
            ELSE rate_limit_buckets.reset_at
        END
    RETURNING count, reset_at
    """
)


async def hit_rate_limit(
    settings: Settings,
    bucket_key: str,
    max_hits: int,
    *,
    factory: async_sessionmaker[AsyncSession] | None = None,
) -> None:
    """Increment a PostgreSQL bucket on its own connection and commit immediately.

    Rate-limit state must survive the request session rolling back on 401/409.
    """
    session_factory = factory or get_session_factory()
    now = utcnow()
    reset_at = now + timedelta(seconds=settings.RATE_LIMIT_WINDOW_SECONDS)
    async with session_factory() as session:
        result = await session.execute(
            _HIT_SQL,
            {"key": bucket_key, "reset_at": reset_at},
        )
        row = result.one()
        await session.commit()
    count = int(row.count)
    bucket_reset = row.reset_at
    if bucket_reset.tzinfo is None:
        bucket_reset = bucket_reset.replace(tzinfo=timezone.utc)
    if count > max_hits:
        retry_after = max(1, int((bucket_reset - now).total_seconds()))
        raise ApiHttpException(
            429,
            "AUTH_RATE_LIMIT",
            ERROR_MESSAGES["AUTH_RATE_LIMIT"],
            retry_after=retry_after,
        )
