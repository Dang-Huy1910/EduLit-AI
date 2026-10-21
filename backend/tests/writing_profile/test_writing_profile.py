"""Student writing profile: sources, evidence validation, cache and API guards."""

from __future__ import annotations

import json
import uuid
from datetime import timedelta
from decimal import Decimal
from typing import Annotated, Any

import pytest
from fastapi import Depends
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import AiTimeoutError
from app.ai.adapters import FakeAiAdapter
from app.config import Settings, get_settings
from app.core.errors import ApiHttpException
from app.core.http import utcnow
from app.db.models import (
    AssessmentJob,
    AssessmentResult,
    Assignment,
    AssignmentAccess,
    AssignmentRevision,
    SourcePrompt,
    Submission,
    SubmissionAttempt,
    TranscriptionRevision,
    User,
    UserRole,
    WritingProfile,
)
from app.identity.deps import get_session_context
from app.identity.service import SessionContext
from app.services.writing_profile_service import WritingProfileService
from tests.catalog.conftest import create_user, login_as
from tests.conftest import auth_headers

PAGE_ONE = (
    "Quê hương là chiếc nôi nuôi dưỡng tâm hồn, là mạch nguồn không bao giờ cạn. "
    "Mỗi người trẻ cần biết trân trọng cội nguồn của mình."
)
PAGE_TWO = (
    "Trong thời đại toàn cầu hóa, việc giữ gìn bản sắc càng có ý nghĩa. "
    "Tóm lại, cội nguồn là điểm tựa để em vững vàng bước tới."
)


async def make_paper(
    db: AsyncSession,
    student: User,
    *,
    title: str = "Nghị luận xã hội: Cội nguồn quê hương",
    genre: str = "nghi_luan_xa_hoi",
    pages: list[str] | None = None,
    comment: str = "Bài viết có bố cục rõ, dẫn chứng còn mỏng.",
    published: bool = True,
    published_at_offset_minutes: int = 0,
    with_catalog: bool = True,
) -> dict[str, Any]:
    """One graded paper whose result the teacher published (or not)."""
    code = f"WP{uuid.uuid4().hex[:8]}".upper()
    assignment = None
    if with_catalog:
        teacher = User(
            login_id=f"gv_{uuid.uuid4().hex[:8]}",
            email=f"gv_{uuid.uuid4().hex[:8]}@thptdanphuong.edu.vn",
            display_name="Giáo viên",
            password_hash="x",
            role=UserRole.TEACHER,
        )
        db.add(teacher)
        await db.flush()
        prompt = SourcePrompt(owner_teacher_id=teacher.id, title=title, status="READY")
        db.add(prompt)
        await db.flush()
        assignment = Assignment(
            teacher_id=teacher.id,
            source_prompt_id=prompt.id,
            title=title,
            code=code,
            status="PUBLISHED",
        )
        db.add(assignment)
        await db.flush()
    revision = AssignmentRevision(
        assignment_id=assignment.id if assignment else None,
        code=code,
        title=title,
        genre=genre,
        instructions={"task": "Viết bài"},
        rubric={},
        context_chunks=[],
        status="PUBLISHED",
    )
    db.add(revision)
    await db.flush()
    if assignment is not None:
        assignment.published_revision_id = revision.id
    db.add(AssignmentAccess(assignment_revision_id=revision.id, student_id=student.id))
    submission = Submission(assignment_revision_id=revision.id, student_id=student.id)
    db.add(submission)
    await db.flush()
    attempt, tx = await _confirmed_attempt(db, submission, revision, pages or [PAGE_ONE, PAGE_TWO], 1)
    result = await _result(
        db,
        submission,
        attempt,
        tx,
        comment=comment,
        published=published,
        published_at_offset_minutes=published_at_offset_minutes,
    )
    submission.current_attempt_id = attempt.id
    submission.current_assessment_result_id = result.id
    if published:
        submission.current_published_result_id = result.id
    paper = {
        "assignment": assignment,
        "revision": revision,
        "submission": submission,
        "attempt": attempt,
        "tx": tx,
        "result": result,
        # Ids captured before commit expires the ORM objects.
        "assignmentId": assignment.id if assignment else None,
        "revisionId": revision.id,
        "submissionId": submission.id,
        "resultId": result.id,
        "title": revision.title,
        "linkId": str(assignment.id) if assignment else str(revision.id),
    }
    await db.commit()
    return paper


async def _confirmed_attempt(
    db: AsyncSession,
    submission: Submission,
    revision: AssignmentRevision,
    pages: list[str],
    number: int,
) -> tuple[SubmissionAttempt, TranscriptionRevision]:
    attempt = SubmissionAttempt(
        submission_id=submission.id,
        assignment_revision_id=revision.id,
        attempt_number=number,
        state="READY_TO_GRADE",
        page_count=len(pages),
        current_revision=1,
    )
    db.add(attempt)
    await db.flush()
    tx = TranscriptionRevision(
        attempt_id=attempt.id,
        revision=1,
        status="CONFIRMED",
        pages=[
            {
                "pageId": str(uuid.uuid4()),
                "pageIndex": index,
                "segments": [{"segmentId": f"p{index}:s1", "order": 1, "text": text}],
            }
            for index, text in enumerate(pages, start=1)
        ],
        confirmed_at=utcnow(),
    )
    db.add(tx)
    await db.flush()
    attempt.confirmed_revision_id = tx.id
    return attempt, tx


async def _result(
    db: AsyncSession,
    submission: Submission,
    attempt: SubmissionAttempt,
    tx: TranscriptionRevision,
    *,
    comment: str,
    published: bool,
    published_at_offset_minutes: int = 0,
) -> AssessmentResult:
    job = AssessmentJob(
        submission_id=submission.id,
        attempt_id=attempt.id,
        transcription_revision_id=tx.id,
        assignment_revision_id=attempt.assignment_revision_id,
        student_id=submission.student_id,
        status="READY",
    )
    db.add(job)
    await db.flush()
    payload = {
        "totalScore": 7.5,
        "maxScore": 10,
        "overallComment": comment,
        "improvementGuidance": ["Bổ sung dẫn chứng đời sống."],
        "evaluations": [],
    }
    now = utcnow() + timedelta(minutes=published_at_offset_minutes)
    result = AssessmentResult(
        job_id=job.id,
        submission_id=submission.id,
        attempt_id=attempt.id,
        transcription_revision_id=tx.id,
        assignment_revision_id=attempt.assignment_revision_id,
        student_id=submission.student_id,
        ai_payload=payload,
        ai_raw={},
        ai_total_score=Decimal("7.5"),
        total_score=Decimal("7.5"),
        max_score=Decimal("10"),
        score_step=Decimal("0.25"),
        score_scale10=Decimal("7.5"),
        is_published=published,
        published_payload=payload if published else None,
        published_at=now if published else None,
    )
    db.add(result)
    await db.flush()
    return result


async def make_student(db: AsyncSession, settings: Settings, client: AsyncClient) -> User:
    return await create_user(db, settings, client, role=UserRole.STUDENT, prefix="hs")


def profile_json(observations: list[dict[str, Any]], **extra: Any) -> str:
    traits = extra.pop(
        "traits",
        [
            {"trait_id": "ARGUMENT_ORGANIZATION", "level": "CONSISTENT", "note": "Luận điểm rõ."},
            {"trait_id": "WORD_CHOICE", "level": "STRONG", "note": "Không có minh chứng."},
        ],
    )
    return json.dumps(
        {
            "summary": extra.pop("summary", "Em viết câu mở bài trực tiếp, lập luận rõ ràng."),
            "traits": traits,
            "observations": observations,
        },
        ensure_ascii=False,
    )


def observation(quote: str, *, source: str = "S1", page: int = 1, **extra: Any) -> dict[str, Any]:
    return {
        "trait_id": extra.get("trait_id", "ARGUMENT_ORGANIZATION"),
        "kind": extra.get("kind", "STRENGTH"),
        "description": extra.get("description", "Mở bài nêu thẳng vấn đề."),
        "source_id": source,
        "page_index": page,
        "evidence_quote": quote,
        "practice_tip": extra.get("practice_tip", "Thử viết lại mở bài bằng một câu hỏi tu từ."),
    }


def service(db: AsyncSession, fake: FakeAiAdapter) -> WritingProfileService:
    return WritingProfileService(db, get_settings(), ai_port=fake)


# ── 1. Empty and single-paper profiles ───────────────────────────────────────


@pytest.mark.asyncio
async def test_no_published_paper_is_empty_and_never_calls_ai(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    student = await make_student(db_session, settings, client)
    await make_paper(db_session, student, published=False)
    fake = FakeAiAdapter()

    read = await service(db_session, fake).get_profile(student)
    refreshed = await service(db_session, fake).refresh(student)

    assert read["status"] == "empty"
    assert refreshed["status"] == "empty"
    assert refreshed["profile"] is None
    assert fake.call_count == 0
    assert await db_session.get(WritingProfile, student.id) is None


@pytest.mark.asyncio
async def test_single_paper_profile_keeps_only_verified_quotes(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    student = await make_student(db_session, settings, client)
    paper = await make_paper(db_session, student)
    fake = FakeAiAdapter()
    fake.add_response(
        profile_json(
            [
                # Valid, with an OCR line break collapsed by the model.
                observation("Quê hương là chiếc nôi nuôi dưỡng tâm hồn,"),
                # Invented wording that is not in the paper.
                observation("Quê hương là nơi em sinh ra và lớn lên", kind="WEAKNESS"),
                # Real sentence cited on the wrong page: kept, page corrected.
                observation("Tóm lại, cội nguồn là điểm tựa", page=1, trait_id="COHESION"),
                # Unknown source id.
                observation("Quê hương là chiếc nôi", source="S9", trait_id="TRANSITIONS"),
            ]
        )
    )

    out = await service(db_session, fake).refresh(student)

    assert fake.call_count == 1
    assert PAGE_ONE in fake.last_prompt
    assert out["status"] == "ready"
    assert out["refreshed"] is True
    profile = out["profile"]
    assert profile["label"] == "AI nhận xét"
    assert profile["summary"]
    assert len(profile["observations"]) == 2
    item = profile["observations"][0]
    assert item["evidenceQuote"] == "Quê hương là chiếc nôi nuôi dưỡng tâm hồn,"
    assert PAGE_ONE[item["evidenceStart"] : item["evidenceEnd"]] == item["evidenceQuote"]
    assert item["assignmentTitle"] == paper["title"]
    assert item["genre"] == "NLXH"
    assert item["linkHref"] == f"/assignments/{paper['linkId']}/result"
    assert item["resultId"] == str(paper["resultId"])
    moved = profile["observations"][1]
    assert moved["pageIndex"] == 2
    assert PAGE_TWO[moved["evidenceStart"] : moved["evidenceEnd"]] == moved["evidenceQuote"]
    assert profile["stats"]["droppedCount"] == 2
    assert profile["stats"]["analyzedCount"] == 1
    assert profile["stats"]["multipleSources"] is False

    traits = {trait["traitId"]: trait for trait in profile["traits"]}
    assert len(traits) == 8
    # The model said "stable", but one paper alone can only show a beginning.
    assert traits["ARGUMENT_ORGANIZATION"]["level"] == "EMERGING"
    assert traits["ARGUMENT_ORGANIZATION"]["evidenceCount"] == 1
    # The model claimed STRONG word choice without any verified quote.
    assert traits["WORD_CHOICE"]["level"] == "INSUFFICIENT"
    assert traits["WORD_CHOICE"]["note"] == "Chưa đủ dữ liệu"

    sources = profile["sources"]
    assert [source["assignmentTitle"] for source in sources] == [paper["title"]]
    assert sources[0]["publishedLabel"] == "Nhận xét đã công bố"


@pytest.mark.asyncio
async def test_quote_marks_may_differ_but_stitched_quotes_are_rejected(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    student = await make_student(db_session, settings, client)
    page = 'Tác giả tin “tự do” là được sống với cội nguồn. Người nông dân neo đời mình vào cánh đồng.'
    await make_paper(db_session, student, pages=[page])
    fake = FakeAiAdapter()
    fake.add_response(
        profile_json(
            [
                # Wrapped in quotes, edge ellipsis, straight quotes inside.
                observation('"...Tác giả tin "tự do" là được sống với cội nguồn."'),
                # Two places stitched with an ellipsis: not a verbatim quote.
                observation(
                    "Tác giả tin “tự do”... neo đời mình vào cánh đồng",
                    trait_id="COHESION",
                ),
            ]
        )
    )

    out = await service(db_session, fake).refresh(student)

    observations = out["profile"]["observations"]
    assert [item["evidenceQuote"] for item in observations] == [
        "Tác giả tin “tự do” là được sống với cội nguồn."
    ]
    assert out["profile"]["stats"]["droppedCount"] == 1


@pytest.mark.asyncio
async def test_all_invalid_quotes_report_insufficient_and_hide_summary(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    student = await make_student(db_session, settings, client)
    await make_paper(db_session, student)
    fake = FakeAiAdapter()
    fake.add_response(profile_json([observation("Một câu không hề có trong bài viết")]))

    first = await service(db_session, fake).refresh(student)

    assert first["status"] == "ready"
    assert first["profile"]["insufficient"] is True
    assert first["profile"]["summary"] == ""
    assert first["profile"]["observations"] == []
    assert first["notice"]
    assert all(trait["level"] == "INSUFFICIENT" for trait in first["profile"]["traits"])

    # Same sources, but an insufficient result may be retried.
    await service(db_session, fake).refresh(student)
    assert fake.call_count == 2


# ── 2. Right student, snapshot and transcription ─────────────────────────────


@pytest.mark.asyncio
async def test_uses_published_copy_not_newer_unpublished_attempt(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    student = await make_student(db_session, settings, client)
    other = await make_student(db_session, settings, client)
    paper = await make_paper(db_session, student, comment="Nhận xét đã công bố bản đầu.")
    await make_paper(
        db_session,
        other,
        pages=["Bài của bạn khác tuyệt đối không được lọt vào hồ sơ."],
        comment="Nhận xét của học sinh khác.",
    )

    # The student resubmits; the new attempt is graded but not published.
    attempt2, tx2 = await _confirmed_attempt(
        db_session,
        paper["submission"],
        paper["revision"],
        ["Bản nộp mới chưa công bố có câu văn khác hẳn."],
        2,
    )
    new_result = await _result(
        db_session,
        paper["submission"],
        attempt2,
        tx2,
        comment="Nhận xét bản mới chưa công bố.",
        published=False,
    )
    paper["submission"].current_attempt_id = attempt2.id
    paper["submission"].current_assessment_result_id = new_result.id
    # The old copy was reopened before the new attempt: still the published copy.
    paper["tx"].status = "SUPERSEDED"
    await db_session.commit()

    fake = FakeAiAdapter()
    fake.add_response(profile_json([observation("mạch nguồn không bao giờ cạn")]))
    out = await service(db_session, fake).refresh(student)

    prompt = fake.last_prompt
    assert "Nhận xét đã công bố bản đầu." in prompt
    assert PAGE_ONE in prompt
    assert "Bản nộp mới chưa công bố" not in prompt
    assert "Nhận xét bản mới chưa công bố." not in prompt
    assert "Bài của bạn khác" not in prompt
    assert "Nhận xét của học sinh khác." not in prompt
    assert out["profile"]["observations"][0]["resultId"] == str(paper["resultId"])


@pytest.mark.asyncio
async def test_newest_published_papers_are_limited(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    student = await make_student(db_session, settings, client)
    titles = []
    for index in range(6):
        title = f"Bài số {index + 1}"
        titles.append(title)
        await make_paper(db_session, student, title=title, published_at_offset_minutes=index)

    fake = FakeAiAdapter()
    fake.add_response(profile_json([observation("mạch nguồn không bao giờ cạn")]))
    fake.add_response(profile_json([observation("mạch nguồn không bao giờ cạn")]))
    before = await service(db_session, fake).get_profile(student)
    first = await service(db_session, fake).refresh(student)

    assert before["status"] == "not_analyzed"
    assert before["sourceSummary"]["eligibleCount"] == 6
    # One refresh reads at most five papers, newest first.
    assert "Bài số 6" in fake.last_prompt
    assert "Bài số 1" not in fake.last_prompt
    assert first["sourceSummary"]["pendingCount"] == 1
    assert first["profile"]["stats"]["analyzedCount"] == 5

    # The next refresh reads only the paper left over.
    second = await service(db_session, fake).refresh(student)
    assert '"Bài số 1"' in fake.last_prompt
    assert '"Bài số 6"' not in fake.last_prompt
    assert second["sourceSummary"]["pendingCount"] == 0
    assert second["profile"]["stats"]["analyzedCount"] == 6


# ── 3. Cache reuse and invalidation ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_cache_is_reused_and_get_never_calls_ai(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    student = await make_student(db_session, settings, client)
    await make_paper(db_session, student)
    fake = FakeAiAdapter()
    fake.add_response(profile_json([observation("mạch nguồn không bao giờ cạn")]))

    before = await service(db_session, fake).get_profile(student)
    first = await service(db_session, fake).refresh(student)
    second = await service(db_session, fake).refresh(student)
    read = await service(db_session, fake).get_profile(student)

    assert before["status"] == "not_analyzed"
    assert before["profile"] is None
    assert first["refreshed"] is True
    assert second["refreshed"] is False
    assert second["status"] == "ready"
    assert read["status"] == "ready"
    assert read["profile"] == first["profile"]
    assert fake.call_count == 1


async def _republish_same_id(db: AsyncSession, paper: dict[str, Any]) -> None:
    result = await db.get(AssessmentResult, paper["resultId"], populate_existing=True)
    payload = dict(result.published_payload or {})
    payload["overallComment"] = "Giáo viên sửa nhận xét rồi công bố lại."
    await db.execute(
        update(AssessmentResult)
        .where(AssessmentResult.id == paper["resultId"])
        .values(
            published_payload=payload,
            published_at=utcnow() + timedelta(minutes=5),
            version=AssessmentResult.version + 2,
        )
    )
    await db.commit()


async def _unpublish(db: AsyncSession, paper: dict[str, Any]) -> None:
    await db.execute(
        update(AssessmentResult)
        .where(AssessmentResult.id == paper["resultId"])
        .values(is_published=False, unpublished_at=utcnow())
    )
    await db.execute(
        update(Submission)
        .where(Submission.id == paper["submissionId"])
        .values(current_published_result_id=None)
    )
    await db.commit()


async def _revoke(db: AsyncSession, paper: dict[str, Any]) -> None:
    await db.execute(
        update(AssignmentAccess)
        .where(AssignmentAccess.assignment_revision_id == paper["revisionId"])
        .values(revoked_at=utcnow())
    )
    await db.commit()


async def _delete_assignment(db: AsyncSession, paper: dict[str, Any]) -> None:
    await db.execute(
        update(Assignment).where(Assignment.id == paper["assignmentId"]).values(status="DELETED")
    )
    await db.execute(
        update(AssignmentRevision)
        .where(AssignmentRevision.id == paper["revisionId"])
        .values(status="DELETED")
    )
    await db.commit()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("change", "expected"),
    [
        (_unpublish, "empty"),
        (_delete_assignment, "empty"),
    ],
)
async def test_source_change_hides_old_profile(
    db_session: AsyncSession,
    settings: Settings,
    client: AsyncClient,
    change: Any,
    expected: str,
) -> None:
    student = await make_student(db_session, settings, client)
    paper = await make_paper(db_session, student)
    fake = FakeAiAdapter()
    fake.add_response(profile_json([observation("mạch nguồn không bao giờ cạn")]))
    assert (await service(db_session, fake).refresh(student))["status"] == "ready"

    await change(db_session, paper)
    db_session.expire_all()
    await db_session.refresh(student)
    read = await service(db_session, fake).get_profile(student)

    assert read["status"] == expected
    assert read["profile"] is None
    assert read["updatedAt"] is None
    assert "mạch nguồn" not in json.dumps(read, ensure_ascii=False)
    assert fake.call_count == 1


@pytest.mark.asyncio
async def test_republish_refresh_reanalyzes_with_new_snapshot(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    student = await make_student(db_session, settings, client)
    paper = await make_paper(db_session, student)
    fake = FakeAiAdapter()
    fake.add_response(profile_json([observation("mạch nguồn không bao giờ cạn")]))
    await service(db_session, fake).refresh(student)

    await _republish_same_id(db_session, paper)
    db_session.expire_all()
    await db_session.refresh(student)
    out = await service(db_session, fake).refresh(student)

    assert out["status"] == "ready"
    assert out["refreshed"] is True
    assert fake.call_count == 2
    assert "Giáo viên sửa nhận xét rồi công bố lại." in fake.last_prompt


@pytest.mark.asyncio
async def test_republished_paper_keeps_profile_visible_until_refresh(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    student = await make_student(db_session, settings, client)
    paper = await make_paper(db_session, student)
    fake = FakeAiAdapter()
    fake.add_response(profile_json([observation("mạch nguồn không bao giờ cạn")]))
    await service(db_session, fake).refresh(student)

    await _republish_same_id(db_session, paper)
    db_session.expire_all()
    await db_session.refresh(student)
    read = await service(db_session, fake).get_profile(student)

    assert read["status"] == "stale"
    assert read["sourceSummary"]["pendingCount"] == 1
    assert "1 bài mới" in read["notice"]
    assert read["profile"]["observations"][0]["evidenceQuote"] == "mạch nguồn không bao giờ cạn"
    assert fake.call_count == 1


@pytest.mark.asyncio
async def test_revoked_access_keeps_paper_in_history_without_link(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    student = await make_student(db_session, settings, client)
    paper = await make_paper(db_session, student)
    fake = FakeAiAdapter()
    fake.add_response(profile_json([observation("mạch nguồn không bao giờ cạn")]))
    await service(db_session, fake).refresh(student)

    # Removed from the class: the grant is revoked, the paper is still theirs.
    await _revoke(db_session, paper)
    db_session.expire_all()
    await db_session.refresh(student)
    read = await service(db_session, fake).get_profile(student)

    assert read["status"] == "ready"
    item = read["profile"]["observations"][0]
    assert item["evidenceQuote"] == "mạch nguồn không bao giờ cạn"
    assert item["linkHref"] == ""
    assert read["profile"]["sources"][0]["linkable"] is False


# ── 4. Cumulative profile and history ────────────────────────────────────────


@pytest.mark.asyncio
async def test_new_paper_is_added_to_the_previous_profile(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    student = await make_student(db_session, settings, client)
    first_paper = await make_paper(db_session, student, title="Bài thứ nhất")
    fake = FakeAiAdapter()
    fake.add_response(profile_json([observation("mạch nguồn không bao giờ cạn")]))
    first = await service(db_session, fake).refresh(student)
    assert first["profile"]["traits"][3]["level"] == "EMERGING"

    second_text = "Lập luận của em đi từ hiện tượng đến bản chất. Em nêu rõ ý chính ở đầu đoạn."
    await make_paper(
        db_session,
        student,
        title="Bài thứ hai",
        pages=[second_text],
        published_at_offset_minutes=10,
    )
    read = await service(db_session, fake).get_profile(student)
    assert read["status"] == "stale"
    assert read["profile"]["stats"]["analyzedCount"] == 1

    fake.add_response(
        profile_json(
            [observation("Lập luận của em đi từ hiện tượng đến bản chất.")],
            traits=[{"trait_id": "ARGUMENT_ORGANIZATION", "level": "CONSISTENT", "note": "Ổn định qua hai bài."}],
        )
    )
    out = await service(db_session, fake).refresh(student)

    # Only the new paper is sent, with the previous profile as context.
    assert second_text in fake.last_prompt
    assert PAGE_ONE not in fake.last_prompt
    assert '"previousProfile": {' in fake.last_prompt
    assert "mạch nguồn không bao giờ cạn" not in fake.last_prompt

    profile = out["profile"]
    assert profile["stats"]["analyzedCount"] == 2
    assert profile["stats"]["newCount"] == 1
    quotes = [item["evidenceQuote"] for item in profile["observations"]]
    assert quotes == ["Lập luận của em đi từ hiện tượng đến bản chất.", "mạch nguồn không bao giờ cạn"]
    assert {item["resultId"] for item in profile["observations"]} == {
        str(first_paper["resultId"]),
        str(profile["sources"][0]["resultId"]),
    }
    trait = next(t for t in profile["traits"] if t["traitId"] == "ARGUMENT_ORGANIZATION")
    # Two papers now back the trait, so "stable" is allowed.
    assert trait["level"] == "CONSISTENT"
    assert trait["sourceCount"] == 2

    history = out["history"]
    assert [item["version"] for item in history] == [1, 2]
    assert [item["newSourceCount"] for item in history] == [1, 1]
    levels = [
        next(t["level"] for t in item["traits"] if t["traitId"] == "ARGUMENT_ORGANIZATION")
        for item in history
    ]
    assert levels == ["EMERGING", "CONSISTENT"]
    assert (await service(db_session, fake).get_profile(student))["history"] == history


@pytest.mark.asyncio
async def test_refresh_is_rate_limited_when_it_would_call_ai(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    student = await make_student(db_session, settings, client)
    await make_paper(db_session, student)
    limited = get_settings().model_copy(update={"RATE_LIMIT_WRITING_PROFILE_MAX": 1})
    fake = FakeAiAdapter()
    fake.add_response(profile_json([observation("Một câu không hề có trong bài viết")]))

    first = await WritingProfileService(db_session, limited, ai_port=fake).refresh(student)
    assert first["profile"]["insufficient"] is True
    with pytest.raises(ApiHttpException) as caught:
        await WritingProfileService(db_session, limited, ai_port=fake).refresh(student)

    assert caught.value.status_code == 429
    assert fake.call_count == 1


@pytest.mark.asyncio
async def test_teacher_reads_profile_of_a_student_in_own_class_only(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    from tests.catalog.conftest import seed_classroom_with_student

    student = await make_student(db_session, settings, client)
    await make_paper(db_session, student)
    fake = FakeAiAdapter()
    fake.add_response(profile_json([observation("mạch nguồn không bao giờ cạn")]))
    await service(db_session, fake).refresh(student)

    teacher = await create_user(db_session, settings, client, role=UserRole.TEACHER, prefix="gv")
    other_teacher = await create_user(db_session, settings, client, role=UserRole.TEACHER, prefix="gv")
    classroom = await seed_classroom_with_student(db_session, teacher, student)
    path = f"/api/teacher/classrooms/{classroom.id}/students/{student.id}/writing-profile"

    await login_as(client, settings, db_session, other_teacher)
    assert (await client.get(path)).status_code == 404

    await login_as(client, settings, db_session, teacher)
    read = await client.get(path)
    assert read.status_code == 200
    body = read.json()
    assert body["status"] == "ready"
    assert body["student"]["id"] == str(student.id)
    assert body["profile"]["observations"][0]["evidenceQuote"] == "mạch nguồn không bao giờ cạn"
    assert len(body["history"]) == 1
    assert fake.call_count == 1

    await login_as(client, settings, db_session, student)
    assert (await client.get(path)).status_code == 403


# ── 5. Invalid JSON and timeout ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_invalid_json_does_not_overwrite_cache(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    student = await make_student(db_session, settings, client)
    paper = await make_paper(db_session, student)
    fake = FakeAiAdapter()
    fake.add_response(profile_json([observation("mạch nguồn không bao giờ cạn")]))
    await service(db_session, fake).refresh(student)
    cached = await db_session.get(WritingProfile, student.id)
    old_hash = cached.source_hash

    await _republish_same_id(db_session, paper)
    db_session.expire_all()
    await db_session.refresh(student)
    broken = FakeAiAdapter()
    broken.add_response("{not json")
    with pytest.raises(ApiHttpException) as caught:
        await service(db_session, broken).refresh(student)

    assert caught.value.status_code == 503
    assert caught.value.code == "WRITING_PROFILE_INVALID"
    db_session.expire_all()
    await db_session.refresh(student)
    assert (await db_session.get(WritingProfile, student.id)).source_hash == old_hash
    after = await service(db_session, broken).get_profile(student)
    assert after["status"] == "stale"
    assert after["profile"] is not None


@pytest.mark.asyncio
async def test_ai_timeout_returns_retryable_error(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    student = await make_student(db_session, settings, client)
    await make_paper(db_session, student)
    fake = FakeAiAdapter()
    fake.set_fail_next(AiTimeoutError)

    with pytest.raises(ApiHttpException) as caught:
        await service(db_session, fake).refresh(student)

    assert caught.value.status_code == 503
    assert caught.value.code == "AI_UNAVAILABLE"
    assert await db_session.get(WritingProfile, student.id) is None


# ── API: session identity, role and CSRF ─────────────────────────────────────


@pytest.mark.asyncio
async def test_api_requires_signed_in_student(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    assert (await client.get("/api/student/writing-profile")).status_code == 401

    teacher = await create_user(db_session, settings, client, role=UserRole.TEACHER, prefix="gv")
    await login_as(client, settings, db_session, teacher)
    denied = await client.get("/api/student/writing-profile")
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "STUDENT_REQUIRED"


@pytest.mark.asyncio
async def test_api_reads_session_student_and_guards_refresh(
    app,
    db_session: AsyncSession,
    settings: Settings,
    client: AsyncClient,
) -> None:
    student = await make_student(db_session, settings, client)
    other = await make_student(db_session, settings, client)
    await make_paper(db_session, other)
    await make_paper(db_session, student)
    await login_as(client, settings, db_session, student)

    from app.api.routers.writing_profile import get_writing_profile_service

    fake = FakeAiAdapter()
    fake.add_response(profile_json([observation("mạch nguồn không bao giờ cạn")]))

    async def _service(
        ctx: Annotated[SessionContext, Depends(get_session_context)],
    ) -> WritingProfileService:
        return WritingProfileService(ctx.db, settings, ai_port=fake)

    app.dependency_overrides[get_writing_profile_service] = _service

    read = await client.get(f"/api/student/writing-profile?studentId={other.id}")
    assert read.status_code == 200
    body = read.json()
    assert body["status"] == "not_analyzed"
    assert body["student"]["id"] == str(student.id)

    no_csrf = await client.post("/api/student/writing-profile/refresh", json={})
    assert no_csrf.status_code == 403
    assert fake.call_count == 0

    refreshed = await client.post(
        "/api/student/writing-profile/refresh", json={}, headers=auth_headers()
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["status"] == "ready"
    assert fake.call_count == 1
