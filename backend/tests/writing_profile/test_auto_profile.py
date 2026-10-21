"""First writing profile built by the worker, without the student asking."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import AiTimeoutError
from app.ai.adapters import FakeAiAdapter
from app.config import Settings, get_settings
from app.db.models import WritingProfile
from app.db.session import get_session_factory
from app.workers.writing_profile import sweep_once
from tests.writing_profile.test_writing_profile import (
    make_paper,
    make_student,
    observation,
    profile_json,
    service,
)


class Clock:
    def __init__(self) -> None:
        self.value = 1000.0

    def __call__(self) -> float:
        return self.value


@pytest.mark.asyncio
async def test_first_published_paper_gets_a_profile_without_asking(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    student = await make_student(db_session, settings, client)
    student_id = student.id
    await make_paper(db_session, student)
    no_paper = await make_student(db_session, settings, client)
    no_paper_id = no_paper.id
    fake = FakeAiAdapter()
    fake.add_response(profile_json([observation("mạch nguồn không bao giờ cạn")]))
    # The worker is not limited by the student's own refresh quota.
    strict = get_settings().model_copy(update={"RATE_LIMIT_WRITING_PROFILE_MAX": 0})

    built = await sweep_once(get_session_factory(), strict, backoff={}, ai_port=fake)

    assert built == 1
    assert fake.call_count == 1
    db_session.expire_all()
    await db_session.refresh(student)
    row = await db_session.get(WritingProfile, student_id)
    assert row is not None and row.version == 1
    assert await db_session.get(WritingProfile, no_paper_id) is None
    read = await service(db_session, fake).get_profile(student)
    assert read["status"] == "ready"
    assert read["profile"]["stats"]["analyzedCount"] == 1
    assert len(read["history"]) == 1

    # Once a profile exists, later papers wait for the student to refresh.
    await make_paper(db_session, student, title="Bài thứ hai", published_at_offset_minutes=5)
    assert await sweep_once(get_session_factory(), strict, backoff={}, ai_port=fake) == 0
    assert fake.call_count == 1
    assert (await service(db_session, fake).get_profile(student))["status"] == "stale"


@pytest.mark.asyncio
async def test_insufficient_first_profile_is_kept_and_not_retried(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    student = await make_student(db_session, settings, client)
    await make_paper(db_session, student)
    fake = FakeAiAdapter()
    fake.add_response(profile_json([observation("Một câu không hề có trong bài viết")]))

    assert await sweep_once(get_session_factory(), get_settings(), backoff={}, ai_port=fake) == 1
    assert await sweep_once(get_session_factory(), get_settings(), backoff={}, ai_port=fake) == 0

    assert fake.call_count == 1
    read = await service(db_session, fake).get_profile(student)
    assert read["status"] == "ready"
    assert read["profile"]["insufficient"] is True


@pytest.mark.asyncio
async def test_ai_failure_waits_before_trying_again(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    student = await make_student(db_session, settings, client)
    await make_paper(db_session, student)
    fake = FakeAiAdapter()
    fake.set_fail_next(AiTimeoutError)
    fake.add_response(profile_json([observation("mạch nguồn không bao giờ cạn")]))
    backoff: dict[uuid.UUID, float] = {}
    clock = Clock()
    cfg = get_settings().model_copy(update={"WRITING_PROFILE_AUTO_RETRY_SECONDS": 600})

    assert await sweep_once(get_session_factory(), cfg, backoff=backoff, ai_port=fake, now=clock) == 0
    assert student.id in backoff
    assert await db_session.get(WritingProfile, student.id) is None

    clock.value += 300
    assert await sweep_once(get_session_factory(), cfg, backoff=backoff, ai_port=fake, now=clock) == 0
    assert fake.call_count == 1

    clock.value += 400
    assert await sweep_once(get_session_factory(), cfg, backoff=backoff, ai_port=fake, now=clock) == 1
    assert fake.call_count == 2
    assert student.id not in backoff
    db_session.expire_all()
    await db_session.refresh(student)
    read = await service(db_session, fake).get_profile(student)
    assert read["status"] == "ready"
    assert [item["version"] for item in read["history"]] == [1]
