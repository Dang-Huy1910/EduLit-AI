"""Worker scheduling and shutdown with in-memory claims and jobs."""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections import deque
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

from app.config import Settings
from app.workers import assessment, ocr, outline_prep
from app.workers._loop import run_claim_loop

logger = logging.getLogger("edulit.test_worker")


# These tests replace the shared database setup with in-memory sessions.
@pytest.fixture
def migrate_test_db() -> None:
    """The fake sessions need no schema migrations."""


@pytest.fixture
def db_engine() -> None:
    """The fake sessions need no database engine or table cleanup."""


@pytest.fixture(autouse=True)
def worker_logging(monkeypatch) -> None:
    # Earlier migration tests can disable existing loggers via Alembic's fileConfig.
    for worker_logger in (logger, ocr.logger, outline_prep.logger, assessment.logger):
        monkeypatch.setattr(worker_logger, "disabled", False)


class FakeSession:
    def __init__(self) -> None:
        self.in_transaction = False
        self.closed = False
        self.outcome = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        self.closed = True

    @asynccontextmanager
    async def begin(self):
        self.in_transaction = True
        try:
            yield
        except BaseException:
            self.outcome = "rollback"
            raise
        else:
            self.outcome = "commit"
        finally:
            self.in_transaction = False


class FakeFactory:
    def __init__(self) -> None:
        self.sessions: list[FakeSession] = []

    def __call__(self) -> FakeSession:
        session = FakeSession()
        self.sessions.append(session)
        return session


def loop_options(factory: FakeFactory, stop: asyncio.Event, **overrides) -> dict:
    return {
        "session_factory": factory,
        "logger": logger,
        "worker_name": "test",
        "task_name": lambda job_id: f"test-{job_id}",
        "concurrency": 2,
        "lease_seconds": 60,
        "poll_seconds": 0.001,
        "stop_event": stop,
        **overrides,
    }


async def test_loop_runs_every_claimed_job_after_commit() -> None:
    factory = FakeFactory()
    stop = asyncio.Event()
    jobs = [(index, uuid.uuid4()) for index in range(5)]
    pending = deque(jobs)
    completed = []

    async def claim(session, *, limit, lease_seconds):
        assert session.in_transaction
        assert lease_seconds == 60
        return [pending.popleft() for _ in range(min(limit, len(pending)))]

    async def run_one(job_id, token):
        assert all(session.closed and session.outcome == "commit" for session in factory.sessions)
        assert asyncio.current_task().get_name() == f"test-{job_id}"
        completed.append((job_id, token))
        if len(completed) == len(jobs):
            stop.set()
        return "done"

    await asyncio.wait_for(
        run_claim_loop(claim=claim, run_one=run_one, **loop_options(factory, stop)),
        timeout=5,
    )

    assert completed == jobs
    assert len(factory.sessions) == 3


async def test_loop_limits_running_jobs_and_refills_available_slots() -> None:
    factory = FakeFactory()
    stop = asyncio.Event()
    release = asyncio.Event()
    saturated = asyncio.Event()
    capacity_checked = asyncio.Event()
    concurrency = 3
    pending = deque((index, uuid.uuid4()) for index in range(7))
    limits = []
    active = 0
    peak = 0
    completed = []

    async def claim(session, *, limit, lease_seconds):
        limits.append(limit)
        assert 0 < limit <= concurrency - active
        return [pending.popleft() for _ in range(min(limit, len(pending)))]

    async def before_claim():
        if active == concurrency:
            capacity_checked.set()

    async def run_one(job_id, token):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        if active == concurrency:
            saturated.set()
        try:
            await release.wait()
            completed.append(job_id)
            if len(completed) == 7:
                stop.set()
            return "done"
        finally:
            active -= 1

    async def scenario():
        worker = asyncio.create_task(
            run_claim_loop(
                claim=claim,
                run_one=run_one,
                before_claim=before_claim,
                **loop_options(factory, stop, concurrency=concurrency),
            )
        )
        try:
            await saturated.wait()
            await capacity_checked.wait()
            assert active == concurrency
            assert limits == [concurrency]
            release.set()
            await worker
        finally:
            stop.set()
            release.set()
            await worker

    await asyncio.wait_for(scenario(), timeout=5)

    assert peak == concurrency
    assert active == 0
    assert sorted(completed) == list(range(7))


async def test_loop_recovers_after_claim_error(caplog) -> None:
    factory = FakeFactory()
    stop = asyncio.Event()
    token = uuid.uuid4()
    calls = 0
    completed = []

    async def claim(session, *, limit, lease_seconds):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RuntimeError("temporary claim failure")
        return [(1, token)]

    async def run_one(job_id, lease_token):
        completed.append((job_id, lease_token))
        stop.set()
        return "done"

    await asyncio.wait_for(
        run_claim_loop(claim=claim, run_one=run_one, **loop_options(factory, stop)),
        timeout=5,
    )

    assert calls == 2
    assert completed == [(1, token)]
    assert [session.outcome for session in factory.sessions] == ["rollback", "commit"]
    record = next(record for record in caplog.records if record.getMessage() == "test claim_failed")
    assert record.levelno == logging.ERROR
    assert record.exc_info[0] is RuntimeError


async def test_loop_drains_running_job_before_returning_on_stop() -> None:
    class ObservedStop(asyncio.Event):
        def __init__(self):
            super().__init__()
            self.observed = asyncio.Event()

        def is_set(self):
            stopped = super().is_set()
            if stopped:
                self.observed.set()
            return stopped

    factory = FakeFactory()
    stop = ObservedStop()
    started = asyncio.Event()
    release = asyncio.Event()
    finished = asyncio.Event()
    cancelled = asyncio.Event()
    calls = 0

    async def claim(session, *, limit, lease_seconds):
        nonlocal calls
        calls += 1
        return [(1, uuid.uuid4())]

    async def run_one(job_id, token):
        started.set()
        try:
            await release.wait()
        except asyncio.CancelledError:
            cancelled.set()
            raise
        finished.set()
        return "done"

    async def scenario():
        worker = asyncio.create_task(
            run_claim_loop(claim=claim, run_one=run_one, **loop_options(factory, stop, concurrency=1))
        )
        try:
            await started.wait()
            stop.set()
            await stop.observed.wait()
            assert not worker.done()
            assert not finished.is_set()
            assert not cancelled.is_set()
        finally:
            stop.set()
            release.set()
            await worker

    await asyncio.wait_for(scenario(), timeout=5)

    assert finished.is_set()
    assert not cancelled.is_set()
    assert calls == 1


async def test_loop_logs_job_error_and_continues_claiming(caplog) -> None:
    factory = FakeFactory()
    stop = asyncio.Event()
    pending = deque([(1, uuid.uuid4()), (2, uuid.uuid4())])
    completed = []

    async def claim(session, *, limit, lease_seconds):
        return [pending.popleft()]

    async def run_one(job_id, token):
        if job_id == 1:
            raise ValueError("job failure")
        completed.append(job_id)
        stop.set()
        return "done"

    await asyncio.wait_for(
        run_claim_loop(claim=claim, run_one=run_one, **loop_options(factory, stop, concurrency=1)),
        timeout=5,
    )

    assert completed == [2]
    record = next(
        record for record in caplog.records if record.getMessage() == "test task_error type=ValueError"
    )
    assert record.levelno == logging.WARNING


@pytest.mark.parametrize(
    ("module", "service", "prefix", "task_prefix"),
    [
        (ocr, ocr.ocr_service, "OCR", "ocr"),
        (outline_prep, outline_prep.outline_prep_service, "OUTLINE_PREP", "outline-prep"),
    ],
)
async def test_worker_adapts_claims_and_keeps_task_names(
    monkeypatch, module, service, prefix, task_prefix
) -> None:
    factory = FakeFactory()
    stop = asyncio.Event()
    cfg = Settings().model_copy(update={f"{prefix}_CONCURRENCY": 2})
    job_id, token = uuid.uuid4(), uuid.uuid4()
    completed = []

    async def claim(session, *, limit, lease_seconds):
        assert session.in_transaction
        assert limit == 2
        assert lease_seconds == getattr(cfg, f"{prefix}_LEASE_SECONDS")
        if module is outline_prep:
            return [
                SimpleNamespace(id=uuid.uuid4(), lease_token=None),
                SimpleNamespace(id=job_id, lease_token=token),
            ]
        return [(job_id, token)]

    async def run_one(actual_factory, settings, actual_id, actual_token):
        assert actual_factory is factory
        assert settings is cfg
        assert all(session.closed for session in factory.sessions)
        assert asyncio.current_task().get_name() == f"{task_prefix}-{job_id}"
        completed.append((actual_id, actual_token))
        stop.set()
        return "done"

    monkeypatch.setattr(service, "claim_jobs", claim)
    monkeypatch.setattr(module, "_run_one", run_one)
    worker = ocr.run_ocr_worker if module is ocr else outline_prep.run_outline_prep_worker
    await asyncio.wait_for(
        worker(settings=cfg, session_factory=factory, stop_event=stop), timeout=5
    )

    assert completed == [(job_id, token)]


async def test_assessment_retries_backfill_while_full_and_claims_leftover_insights(
    monkeypatch, caplog
) -> None:
    factory = FakeFactory()
    stop = asyncio.Event()
    release = asyncio.Event()
    backfilled = asyncio.Event()
    cfg = Settings().model_copy(
        update={"ASSESSMENT_CONCURRENCY": 2, "ASSESSMENT_POLL_SECONDS": 0.5}
    )
    grade, insight = (uuid.uuid4(), uuid.uuid4()), (uuid.uuid4(), uuid.uuid4())
    backfill_calls = 0
    claim_order = []
    started = []
    finished = []

    async def backfill(session, settings):
        nonlocal backfill_calls
        assert session.in_transaction
        assert settings is cfg
        backfill_calls += 1
        if backfill_calls == 1:
            raise RuntimeError("temporary backfill failure")
        assert len(started) == 2
        backfilled.set()
        return 3

    async def claim_grades(session, *, limit, lease_seconds):
        assert session.in_transaction
        assert backfill_calls == 1
        assert limit == 2
        assert lease_seconds == cfg.ASSESSMENT_LEASE_SECONDS
        claim_order.append(("grade", session))
        return [grade]

    async def claim_insights(session, *, limit, lease_seconds):
        assert session is claim_order[0][1]
        assert session.in_transaction
        assert limit == 1
        assert lease_seconds == cfg.ASSESSMENT_LEASE_SECONDS
        claim_order.append(("insight", session))
        return [insight]

    async def run_job(actual_factory, settings, job_id, token):
        assert actual_factory is factory
        assert settings is cfg
        assert all(session.closed for session in factory.sessions)
        started.append((asyncio.current_task().get_name(), job_id, token))
        await release.wait()
        finished.append(job_id)
        return "done"

    monkeypatch.setattr(assessment.assessment_jobs, "enqueue_missing_jobs", backfill)
    monkeypatch.setattr(assessment.assessment_jobs, "claim_jobs", claim_grades)
    monkeypatch.setattr(assessment.assessment_jobs, "claim_insight_jobs", claim_insights)
    monkeypatch.setattr(assessment, "_run_one", run_job)
    monkeypatch.setattr(assessment, "_run_insight", run_job)

    async def scenario():
        worker = asyncio.create_task(
            assessment.run_assessment_worker(settings=cfg, session_factory=factory, stop_event=stop)
        )
        try:
            await backfilled.wait()
            assert not worker.done()
            assert not finished
        finally:
            stop.set()
            release.set()
            await worker

    with caplog.at_level(logging.INFO, logger=assessment.logger.name):
        await asyncio.wait_for(scenario(), timeout=5)

    assert backfill_calls == 2
    assert [kind for kind, _ in claim_order] == ["grade", "insight"]
    assert started == [(f"grade-{grade[0]}", *grade), (f"insight-{insight[0]}", *insight)]
    assert set(finished) == {grade[0], insight[0]}
    assert "assessment backfill_failed" in caplog.messages
    assert "assessment backfill queued=3" in caplog.messages
    assert "assessment worker stopped" in caplog.messages


async def test_assessment_discards_grade_claim_if_insight_claim_fails(monkeypatch, caplog) -> None:
    factory = FakeFactory()
    stop = asyncio.Event()
    cfg = Settings().model_copy(
        update={"ASSESSMENT_CONCURRENCY": 2, "ASSESSMENT_POLL_SECONDS": 0.5}
    )
    job = uuid.uuid4(), uuid.uuid4()
    claim_calls = 0
    backfill_calls = 0
    completed = []

    async def backfill(session, settings):
        nonlocal backfill_calls
        backfill_calls += 1
        return 0

    async def claim_grades(session, *, limit, lease_seconds):
        nonlocal claim_calls
        claim_calls += 1
        return [job]

    async def claim_insights(session, *, limit, lease_seconds):
        if claim_calls == 1:
            raise RuntimeError("insight claim failure")
        return []

    async def run_one(actual_factory, settings, job_id, token):
        assert claim_calls == 2
        completed.append((job_id, token))
        stop.set()
        return "done"

    monkeypatch.setattr(assessment.assessment_jobs, "enqueue_missing_jobs", backfill)
    monkeypatch.setattr(assessment.assessment_jobs, "claim_jobs", claim_grades)
    monkeypatch.setattr(assessment.assessment_jobs, "claim_insight_jobs", claim_insights)
    monkeypatch.setattr(assessment, "_run_one", run_one)
    await asyncio.wait_for(
        assessment.run_assessment_worker(settings=cfg, session_factory=factory, stop_event=stop),
        timeout=5,
    )

    assert completed == [job]
    assert backfill_calls == 1
    assert [session.outcome for session in factory.sessions] == ["commit", "rollback", "commit"]
    assert "assessment claim_failed" in caplog.messages
