"""Durable rubric-grading and class-insight worker.

Jobs live in assessment_jobs / class_insights. Restart continues queued and
expired-lease rows. GET never enqueues.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings, get_settings
from app.db.session import get_session_factory
from app.services import assessment_jobs

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
    in_flight: set[asyncio.Task[str]] = set()
    backfilled = False

    logger.info(
        "assessment worker started concurrency=%s lease_s=%s poll_s=%s",
        concurrency,
        lease_seconds,
        poll_seconds,
    )

    try:
        while not stop.is_set():
            if not backfilled:
                try:
                    async with factory() as session:
                        async with session.begin():
                            created = await assessment_jobs.enqueue_missing_jobs(session, cfg)
                        if created:
                            logger.info("assessment backfill queued=%s", created)
                    backfilled = True
                except Exception:
                    logger.exception("assessment backfill_failed")

            slots = concurrency - len(in_flight)
            claimed: list[tuple] = []
            insights: list[tuple] = []
            if slots > 0:
                try:
                    async with factory() as session:
                        async with session.begin():
                            claimed = await assessment_jobs.claim_jobs(
                                session, limit=slots, lease_seconds=lease_seconds
                            )
                            leftover = slots - len(claimed)
                            if leftover > 0:
                                insights = await assessment_jobs.claim_insight_jobs(
                                    session, limit=leftover, lease_seconds=lease_seconds
                                )
                except Exception:
                    logger.exception("assessment claim_failed")
                    claimed = []
                    insights = []

            for job_id, token in claimed:
                task = asyncio.create_task(
                    _run_one(factory, cfg, job_id, token),
                    name=f"grade-{job_id}",
                )
                in_flight.add(task)
                task.add_done_callback(in_flight.discard)
            for insight_id, token in insights:
                task = asyncio.create_task(
                    _run_insight(factory, cfg, insight_id, token),
                    name=f"insight-{insight_id}",
                )
                in_flight.add(task)
                task.add_done_callback(in_flight.discard)

            if not in_flight:
                try:
                    await asyncio.wait_for(stop.wait(), timeout=poll_seconds)
                except asyncio.TimeoutError:
                    continue
                break

            done, _ = await asyncio.wait(
                in_flight,
                timeout=poll_seconds,
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in done:
                exc = task.exception() if not task.cancelled() else None
                if exc:
                    logger.warning("assessment task_error type=%s", type(exc).__name__)
    finally:
        if in_flight:
            await asyncio.gather(*in_flight, return_exceptions=True)
        logger.info("assessment worker stopped")


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
