"""Durable OCR worker.

Job state lives on submission_attempts. The loop claims rows, calls
vision outside the DB transaction, then writes READY/FAILED. Restart
continues queued and expired-lease jobs. A stale lease cannot overwrite
a newer result.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from functools import partial

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings, get_settings
from app.db.session import get_session_factory
from app.services import ocr_service
from app.workers._loop import run_claim_loop

logger = logging.getLogger("edulit.ocr_worker")


async def run_ocr_worker(
    *,
    settings: Settings | None = None,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
    stop_event: asyncio.Event | None = None,
) -> None:
    cfg = settings or get_settings()
    factory = session_factory or get_session_factory(cfg)
    stop = stop_event or asyncio.Event()
    concurrency = max(1, int(cfg.OCR_CONCURRENCY or 1))
    lease_seconds = max(60, int(cfg.OCR_LEASE_SECONDS or 600))
    poll_seconds = max(0.5, float(cfg.OCR_POLL_SECONDS or 2.0))

    logger.info(
        "ocr worker started concurrency=%s lease_s=%s poll_s=%s",
        concurrency,
        lease_seconds,
        poll_seconds,
    )

    await run_claim_loop(
        claim=ocr_service.claim_jobs,
        run_one=partial(_run_one, factory, cfg),
        session_factory=factory,
        logger=logger,
        worker_name="ocr",
        task_name=lambda job_id: f"ocr-{job_id}",
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
    return await ocr_service.process_claimed_job(
        factory, job_id, lease_token, settings=settings
    )


def start_ocr_worker(
    *,
    settings: Settings | None = None,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> tuple[asyncio.Task[None], Callable[[], None]]:
    stop = asyncio.Event()
    task = asyncio.create_task(
        run_ocr_worker(
            settings=settings,
            session_factory=session_factory,
            stop_event=stop,
        ),
        name="ocr-worker",
    )

    def stop_worker() -> None:
        stop.set()

    return task, stop_worker
