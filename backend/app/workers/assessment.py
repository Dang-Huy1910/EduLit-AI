"""Durable rubric-grading and class-insight worker.

Jobs live in assessment_jobs / class_insights. Restart continues queued and
expired-lease rows. GET never enqueues.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Callable

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings, get_settings
from app.db.session import get_session_factory
from app.services import assessment_jobs
from app.workers._loop import run_claim_loop

logger = logging.getLogger("edulit.assessment_worker")


async def run_assessment_worker(
    *,
    settings: Settings | None = None,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
    stop_event: asyncio.Event | None = None,
) -> None:
    cfg = settings or get_settings()
    factory = session_factory or get_session_factory(cfg)
    stop = stop_event or asyncio.Event()
    concurrency = max(1, int(cfg.ASSESSMENT_CONCURRENCY or 1))
    lease_seconds = max(60, int(cfg.ASSESSMENT_LEASE_SECONDS or 600))
    poll_seconds = max(0.5, float(cfg.ASSESSMENT_POLL_SECONDS or 2.0))
    backfilled = False

    async def backfill() -> None:
        nonlocal backfilled
        if backfilled:
            return
        try:
            async with factory() as session:
                async with session.begin():
                    created = await assessment_jobs.enqueue_missing_jobs(session, cfg)
                if created:
                    logger.info("assessment backfill queued=%s", created)
            backfilled = True
        except Exception:
            logger.exception("assessment backfill_failed")

    async def claim(
        session: AsyncSession, *, limit: int, lease_seconds: int
    ) -> list[tuple[tuple[str, uuid.UUID], uuid.UUID]]:
        claimed = await assessment_jobs.claim_jobs(
            session, limit=limit, lease_seconds=lease_seconds
        )
        insights: list[tuple[uuid.UUID, uuid.UUID]] = []
        leftover = limit - len(claimed)
        if leftover > 0:
            insights = await assessment_jobs.claim_insight_jobs(
                session, limit=leftover, lease_seconds=lease_seconds
            )
        return [(("grade", job_id), token) for job_id, token in claimed] + [
            (("insight", insight_id), token) for insight_id, token in insights
        ]

    async def run_one(job: tuple[str, uuid.UUID], token: uuid.UUID) -> str:
        kind, job_id = job
        if kind == "grade":
            return await _run_one(factory, cfg, job_id, token)
        return await _run_insight(factory, cfg, job_id, token)

    logger.info(
        "assessment worker started concurrency=%s lease_s=%s poll_s=%s",
        concurrency,
        lease_seconds,
        poll_seconds,
    )

    await run_claim_loop(
        claim=claim,
        run_one=run_one,
        session_factory=factory,
        logger=logger,
        worker_name="assessment",
        task_name=lambda job: f"{job[0]}-{job[1]}",
        concurrency=concurrency,
        lease_seconds=lease_seconds,
        poll_seconds=poll_seconds,
        stop_event=stop,
        before_claim=backfill,
    )


async def _run_one(factory, settings, job_id, lease_token) -> str:
    return await assessment_jobs.process_claimed_job(
        factory, job_id, lease_token, settings=settings
    )


async def _run_insight(factory, settings, insight_id, lease_token) -> str:
    return await assessment_jobs.process_claimed_insight(
        factory, insight_id, lease_token, settings=settings
    )


def start_assessment_worker(
    *,
    settings: Settings | None = None,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> tuple[asyncio.Task[None], Callable[[], None]]:
    stop = asyncio.Event()
    task = asyncio.create_task(
        run_assessment_worker(
            settings=settings,
            session_factory=session_factory,
            stop_event=stop,
        ),
        name="assessment-worker",
    )

    def stop_worker() -> None:
        stop.set()

    return task, stop_worker
