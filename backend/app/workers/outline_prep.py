"""Durable outline-prep worker.

Job state is stored in PostgreSQL. This loop claims rows, calls AI
outside the DB transaction, then writes READY/FAILED. Restarting the
process continues queued and expired-lease jobs.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings, get_settings
from app.db.session import get_session_factory
import app.services.outline_prep as outline_prep_service

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
    in_flight: set[asyncio.Task[str]] = set()

    logger.info(
        "outline_prep worker started concurrency=%s lease_s=%s poll_s=%s",
        concurrency,
        lease_seconds,
        poll_seconds,
    )

    try:
        while not stop.is_set():
            slots = concurrency - len(in_flight)
            claimed: list[tuple] = []
            if slots > 0:
                try:
                    async with factory() as session:
                        async with session.begin():
                            rows = await outline_prep_service.claim_jobs(
                                session, limit=slots, lease_seconds=lease_seconds
                            )
                            claimed = [(row.id, row.lease_token) for row in rows]
                except Exception:
                    logger.exception("outline_prep claim_failed")
                    claimed = []

            for job_id, token in claimed:
                if token is None:
                    continue
                task = asyncio.create_task(
                    _run_one(factory, cfg, job_id, token),
                    name=f"outline-prep-{job_id}",
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
                    logger.warning(
                        "outline_prep task_error type=%s",
                        type(exc).__name__,
                    )
    finally:
        if in_flight:
            await asyncio.gather(*in_flight, return_exceptions=True)
        logger.info("outline_prep worker stopped")


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
