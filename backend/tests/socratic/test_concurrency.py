"""True concurrency tests using two independent AsyncSessions/connections."""

from __future__ import annotations

import asyncio
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.adapters import FakeAiAdapter
from app.core.http import utcnow
from app.db.models import OutlineRevision, OutlineRevisionStatus, SocraticSession
from app.db.session import get_session_factory
from app.services.socratic_service import ConflictError, SocraticService
from tests.socratic.test_service import VALID_AI


def _barrier_ai() -> FakeAiAdapter:
    ai = FakeAiAdapter()
    ai.add_response(VALID_AI)
    ai.hold_before_generate = asyncio.Event()
    ai.release_generate = asyncio.Event()
    return ai


@pytest.mark.asyncio
async def test_second_connection_blocked_while_reservation_held(
    db_session: AsyncSession, student_user: dict, published_assignment: dict
) -> None:
    factory = get_session_factory()
    setup = SocraticService(db_session, ai_port=FakeAiAdapter())
    session = await setup.create_session(student_user["user"], published_assignment["code"])
    await db_session.commit()

    ai = _barrier_ai()
    async with factory() as s1, factory() as s2:
        svc1 = SocraticService(s1, ai_port=ai)
        svc2 = SocraticService(s2, ai_port=ai)
        t1 = asyncio.create_task(
            svc1.process_turn(session.id, student_user["user"], "first")
        )
        await asyncio.wait_for(ai.hold_before_generate.wait(), timeout=5)
        t2 = asyncio.create_task(
            svc2.process_turn(session.id, student_user["user"], "second")
        )
        done, pending = await asyncio.wait({t2}, timeout=5)
        assert t2 in done
        with pytest.raises(ConflictError) as exc:
            t2.result()
        assert exc.value.code == "TURN_IN_PROGRESS"
        assert ai.call_count == 1
        ai.release_generate.set()
        msg, result = await t1
        assert result.status in {"VALIDATED", "FALLBACK"}
        assert msg.turn_id == 1


@pytest.mark.asyncio
async def test_expired_lease_can_be_taken_over(
    db_session: AsyncSession, student_user: dict, published_assignment: dict
) -> None:
    factory = get_session_factory()
    setup = SocraticService(db_session, ai_port=FakeAiAdapter())
    session = await setup.create_session(student_user["user"], published_assignment["code"])
    await db_session.execute(
        update(SocraticSession)
        .where(SocraticSession.id == session.id)
        .values(
            reservation_token=uuid.uuid4(),
            reservation_expires_at=utcnow() - timedelta(seconds=30),
            processing_turn=1,
        )
    )
    await db_session.commit()

    ai = FakeAiAdapter()
    ai.add_response(VALID_AI)
    async with factory() as s2:
        svc = SocraticService(s2, ai_port=ai)
        msg, result = await svc.process_turn(session.id, student_user["user"], "after expiry")
        assert result.status in {"VALIDATED", "FALLBACK"}
        assert msg.content


@pytest.mark.asyncio
async def test_stale_worker_cannot_finalize_after_takeover(
    db_session: AsyncSession, student_user: dict, published_assignment: dict
) -> None:
    factory = get_session_factory()
    setup = SocraticService(db_session, ai_port=FakeAiAdapter())
    session = await setup.create_session(student_user["user"], published_assignment["code"])
    await db_session.commit()

    stale_ai = _barrier_ai()
    winner_ai = FakeAiAdapter()
    winner_ai.add_response(
        '{"message": "Em sẽ triển khai luận điểm nào trước?",'
        ' "suggested_state": "THESIS", "sources": []}'
    )

    async with factory() as s1, factory() as s2:
        stale = SocraticService(s1, ai_port=stale_ai)
        winner = SocraticService(s2, ai_port=winner_ai)
        t_stale = asyncio.create_task(
            stale.process_turn(session.id, student_user["user"], "stale")
        )
        await asyncio.wait_for(stale_ai.hold_before_generate.wait(), timeout=5)
        await s2.execute(
            update(SocraticSession)
            .where(SocraticSession.id == session.id)
            .values(
                reservation_expires_at=utcnow() - timedelta(seconds=5),
            )
        )
        await s2.commit()
        msg, _ = await winner.process_turn(session.id, student_user["user"], "winner")
        stale_ai.release_generate.set()
        with pytest.raises(ConflictError) as exc:
            await t_stale
        assert exc.value.code == "STALE_RESERVATION"
        assert msg.content
        assert winner_ai.call_count == 1


@pytest.mark.asyncio
async def test_concurrent_outline_same_expected_version_one_wins(
    db_session: AsyncSession, student_user: dict, published_assignment: dict
) -> None:
    factory = get_session_factory()
    setup = SocraticService(db_session, ai_port=FakeAiAdapter())
    session = await setup.create_session(student_user["user"], published_assignment["code"])
    await db_session.commit()

    async def _write(label: str):
        async with factory() as db:
            svc = SocraticService(db, ai_port=FakeAiAdapter())
            return await svc.update_outline(
                session.id,
                student_user["user"],
                {"thesis": label, "sections": [{"title": label}]},
                expected_version=0,
            )

    r1, r2 = await asyncio.gather(_write("A"), _write("B"), return_exceptions=True)
    outcomes = [r1, r2]
    successes = [o for o in outcomes if not isinstance(o, Exception)]
    failures = [o for o in outcomes if isinstance(o, Exception)]
    assert len(successes) == 1
    assert len(failures) == 1
    assert isinstance(failures[0], ConflictError)
    accepted = (
        await db_session.execute(
            select(OutlineRevision).where(
                OutlineRevision.session_id == session.id,
                OutlineRevision.review_status == OutlineRevisionStatus.ACCEPTED,
            )
        )
    ).scalars().all()
    assert len(accepted) == 1
