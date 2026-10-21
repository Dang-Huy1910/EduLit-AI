"""First writing profile for students who have not built one yet.

A student whose first paper is published should not look like they have no
writing style until they press "Cập nhật hồ sơ". This loop finds students with
a published result and no profile, and synthesizes their first profile one at
a time. There is no job table: a profile row, even an "insufficient evidence"
one, marks the student as done, and failures wait `WRITING_PROFILE_AUTO_RETRY_SECONDS`
in memory before the next try. Later updates stay with the student.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections.abc import Callable

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.ai import AiPort
from app.config import Settings, get_settings
from app.core.errors import ApiHttpException
from app.db.models import User
from app.db.session import get_session_factory
from app.services.writing_profile_service import WritingProfileService, students_without_profile

logger = logging.getLogger("edulit.writing_profile_worker")


async def sweep_once(
    factory: async_sessionmaker[AsyncSession],
    settings: Settings,
    *,
    backoff: dict[uuid.UUID, float],
    ai_port: AiPort | None = None,
    now: Callable[[], float] = time.monotonic,
) -> int:
    """Build first profiles for one batch of students. Returns how many were built."""
    retry_after = max(60.0, float(settings.WRITING_PROFILE_AUTO_RETRY_SECONDS or 1800))
    current = now()
    for student_id, failed_at in list(backoff.items()):
        if current - failed_at >= retry_after:
            del backoff[student_id]

    async with factory() as session:
        student_ids = await students_without_profile(
            session,
            limit=max(1, int(settings.WRITING_PROFILE_AUTO_BATCH or 5)),
            skip=set(backoff),
        )

    built = 0
    for student_id in student_ids:
        try:
            async with factory() as session:
                student = await session.get(User, student_id)
                if student is None:
                    continue
                service = WritingProfileService(session, settings, ai_port=ai_port)
                if await service.initialize(student):
                    built += 1
                else:
                    # Published but nothing readable yet: do not retry every poll.
                    backoff[student_id] = now()
        except ApiHttpException as exc:
            backoff[student_id] = now()
            logger.warning("writing_profile_auto failed student_id=%s code=%s", student_id, exc.code)
        except Exception:
            backoff[student_id] = now()
            logger.exception("writing_profile_auto unexpected student_id=%s", student_id)
    if built:
        logger.info("writing_profile_auto built=%s", built)
    return built


async def run_writing_profile_worker(
    *,
    settings: Settings | None = None,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
    stop_event: asyncio.Event | None = None,
) -> None:
    cfg = settings or get_settings()
    factory = session_factory or get_session_factory(cfg)
    stop = stop_event or asyncio.Event()
    poll_seconds = max(5.0, float(cfg.WRITING_PROFILE_AUTO_POLL_SECONDS or 30))
    backoff: dict[uuid.UUID, float] = {}
    logger.info("writing_profile worker started poll_s=%s", poll_seconds)
    try:
        while not stop.is_set():
            try:
                await sweep_once(factory, cfg, backoff=backoff)
            except Exception:
                logger.exception("writing_profile_auto sweep_failed")
            try:
                await asyncio.wait_for(stop.wait(), timeout=poll_seconds)
            except asyncio.TimeoutError:
                continue
    finally:
        logger.info("writing_profile worker stopped")


def start_writing_profile_worker(
    *,
    settings: Settings | None = None,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> tuple[asyncio.Task[None], Callable[[], None]]:
    stop = asyncio.Event()
    task = asyncio.create_task(
        run_writing_profile_worker(settings=settings, session_factory=session_factory, stop_event=stop),
        name="writing-profile-worker",
    )

    def stop_worker() -> None:
        stop.set()

    return task, stop_worker
