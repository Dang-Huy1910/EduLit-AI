"""Shared claim, lease and poll loop for durable workers."""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable, Coroutine
from typing import Any, Protocol, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

JobId = TypeVar("JobId")


class ClaimJobs(Protocol[JobId]):
    async def __call__(
        self, session: AsyncSession, *, limit: int, lease_seconds: int
    ) -> list[tuple[JobId, uuid.UUID]]: ...


async def run_claim_loop(
    *,
    claim: ClaimJobs[JobId],
    run_one: Callable[[JobId, uuid.UUID], Coroutine[Any, Any, str]],
    session_factory: async_sessionmaker[AsyncSession],
    logger: logging.Logger,
    worker_name: str,
    task_name: Callable[[JobId], str],
    concurrency: int,
    lease_seconds: int,
    poll_seconds: float,
    stop_event: asyncio.Event,
    before_claim: Callable[[], Awaitable[None]] | None = None,
) -> None:
    """Claim within a transaction and drain running jobs on shutdown.

    before_claim runs each iteration, even when all slots are occupied, so
    worker-specific backfill retries keep their original ordering and timing.
    """
    in_flight: set[asyncio.Task[str]] = set()
    try:
        while not stop_event.is_set():
            if before_claim is not None:
                await before_claim()

            slots = concurrency - len(in_flight)
            claimed: list[tuple[JobId, uuid.UUID]] = []
            if slots > 0:
                try:
                    async with session_factory() as session:
                        async with session.begin():
                            claimed = await claim(
                                session, limit=slots, lease_seconds=lease_seconds
                            )
                except Exception:
                    logger.exception("%s claim_failed", worker_name)
                    claimed = []

            for job_id, token in claimed:
                task = asyncio.create_task(run_one(job_id, token), name=task_name(job_id))
                in_flight.add(task)
                task.add_done_callback(in_flight.discard)

            if not in_flight:
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=poll_seconds)
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
                    logger.warning("%s task_error type=%s", worker_name, type(exc).__name__)
    finally:
        if in_flight:
            await asyncio.gather(*in_flight, return_exceptions=True)
        logger.info("%s worker stopped", worker_name)
