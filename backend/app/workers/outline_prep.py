"""Durable outline-prep worker.

Job state is stored in PostgreSQL. This loop claims rows, calls AI
outside the DB transaction, then writes READY/FAILED. Restarting the
process continues queued and expired-lease jobs.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Callable
from functools import partial

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings, get_settings
from app.db.session import get_session_factory
import app.services.outline_prep as outline_prep_service
from app.workers._loop import run_claim_loop

logger = logging.getLogger("edulit.outline_prep_worker")


async def run_outline_prep_worker(
    *,
    settings: Settings | None = None,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
    stop_event: asyncio.Event | None = None,
) -> None:
    cfg = settings or get_settings()
    factory = session_factory or get_session_factory(cfg)
    stop = stop_event or asyncio.Event()
    concurrency = max(1, int(cfg.OUTLINE_PREP_CONCURRENCY or 1))
    lease_seconds = max(30, int(cfg.OUTLINE_PREP_LEASE_SECONDS or 300))
    poll_seconds = max(0.5, float(cfg.OUTLINE_PREP_POLL_SECONDS or 2.0))

    async def claim(
        session: AsyncSession, *, limit: int, lease_seconds: int
    ) -> list[tuple[uuid.UUID, uuid.UUID]]:
        rows = await outline_prep_service.claim_jobs(
            session, limit=limit, lease_seconds=lease_seconds
        )
        return [(row.id, row.lease_token) for row in rows if row.lease_token is not None]

    logger.info(
        "outline_prep worker started concurrency=%s lease_s=%s poll_s=%s",
        concurrency,
        lease_seconds,
        poll_seconds,
    )

    await run_claim_loop(
        claim=claim,
        run_one=partial(_run_one, factory, cfg),
        session_factory=factory,
        logger=logger,
        worker_name="outline_prep",
        task_name=lambda job_id: f"outline-prep-{job_id}",
        concurrency=concurrency,
        lease_seconds=lease_seconds,
        poll_seconds=poll_seconds,
        stop_event=stop,
    )


async def _run_one(
    factory: async_sessionmaker[AsyncSession],
    settings: Settings,
    job_id,
    lease_token,
) -> str:
    async with factory() as session:
        from app.db.models import StudentOutlinePrep

        prep = await session.get(StudentOutlinePrep, job_id)
        if prep is None or prep.lease_token != lease_token:
            return "STALE"
        return await outline_prep_service.process_claimed_job(session, prep, settings=settings)


def start_outline_prep_worker(
    *,
    settings: Settings | None = None,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> tuple[asyncio.Task[None], Callable[[], None]]:
    stop = asyncio.Event()
    task = asyncio.create_task(
        run_outline_prep_worker(
            settings=settings,
            session_factory=session_factory,
            stop_event=stop,
        ),
        name="outline-prep-worker",
    )

    def stop_worker() -> None:
        stop.set()

    return task, stop_worker
