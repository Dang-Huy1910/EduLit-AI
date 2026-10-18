"""Tests for Socratic service: sessions, turns, idempotency, outline, access."""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.adapters import AiUnavailableError, FakeAiAdapter
from app.core.http import utcnow
from app.db.models import (
    ChatMessage,
    ChatRole,
    IdempotencyRecord,
    IdempotencyState,
    MessageStatus,
    OutlineRevision,
    OutlineRevisionStatus,
    SocraticSession,
    SocraticState,
)
from app.db.models.socratic import AssignmentAccess
from app.services.socratic_service import (
    AiUnavailableServiceError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    SocraticService,
    _hash_payload,
    _legacy_hash_key,
)
from tests.conftest import grant_assignment_access

VALID_AI = (
    '{"message": "Em muốn bám vào luận điểm nào trước?",'
    ' "suggested_state": "THESIS", "sources": []}'
)


def _service(db: AsyncSession, ai: FakeAiAdapter | None = None) -> SocraticService:
    adapter = ai or FakeAiAdapter()
    if not adapter.responses:
        adapter.add_response(VALID_AI)
    return SocraticService(db, ai_port=adapter)


class TestSessionCreation:
    @pytest.mark.asyncio
    async def test_creates_session_for_student(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        session = await _service(db_session).create_session(
            student_user["user"], published_assignment["code"]
        )
        assert session.student_id == student_user["id"]
        assert session.assignment_revision_id == published_assignment["id"]
        assert session.state.value == "INIT"

    @pytest.mark.asyncio
    async def test_draft_assignment_rejected(
        self, db_session: AsyncSession, student_user: dict, draft_assignment: dict
    ):
        with pytest.raises(NotFoundError):
            await _service(db_session).create_session(
                student_user["user"], draft_assignment["code"]
            )

    @pytest.mark.asyncio
    async def test_closed_assignment_rejected(
        self, db_session: AsyncSession, student_user: dict, closed_assignment: dict
    ):
        with pytest.raises(NotFoundError):
            await _service(db_session).create_session(
                student_user["user"], closed_assignment["code"]
            )

    @pytest.mark.asyncio
    async def test_unassigned_student_cannot_create_session(
        self, db_session: AsyncSession, published_assignment: dict
    ):
        from app.core.passwords import hash_password_sync
        from app.db.models import User, UserRole

        other = User(
            login_id=f"hsx_{uuid.uuid4().hex[:8]}",
            email=f"hsx_{uuid.uuid4().hex[:8]}@test.local",
            display_name="Unassigned",
            password_hash=hash_password_sync("testpassword123"),
            role=UserRole.STUDENT,
        )
        db_session.add(other)
        await db_session.commit()
        with pytest.raises(ForbiddenError):
            await _service(db_session).create_session(other, published_assignment["code"])

    @pytest.mark.asyncio
    async def test_teacher_cannot_create_session(self, db_session: AsyncSession):
        from app.core.passwords import hash_password_sync
        from app.db.models import User, UserRole

        teacher = User(
            login_id=f"gv_{uuid.uuid4().hex[:8]}",
            email=f"gv_{uuid.uuid4().hex[:8]}@test.local",
            display_name="Test Teacher",
            password_hash=hash_password_sync("testpassword123"),
            role=UserRole.TEACHER,
        )
        db_session.add(teacher)
        await db_session.commit()
        with pytest.raises(ForbiddenError):
            await _service(db_session).create_session(teacher, "ANY_CODE")

    @pytest.mark.asyncio
    async def test_duplicate_session_raises_conflict(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        service = _service(db_session)
        await service.create_session(student_user["user"], published_assignment["code"])
        with pytest.raises(ConflictError):
            await service.create_session(student_user["user"], published_assignment["code"])


class TestSessionAccess:
    @pytest.mark.asyncio
    async def test_cannot_access_other_student_session(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        from app.core.passwords import hash_password_sync
        from app.db.models import User, UserRole

        other = User(
            login_id=f"hs2_{uuid.uuid4().hex[:8]}",
            email=f"hs2_{uuid.uuid4().hex[:8]}@test.local",
            display_name="Other Student",
            password_hash=hash_password_sync("testpassword123"),
            role=UserRole.STUDENT,
        )
        db_session.add(other)
        await db_session.commit()
        service = _service(db_session)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        with pytest.raises(ForbiddenError):
            await service.get_session(session.id, other)

    @pytest.mark.asyncio
    async def test_revoked_access_blocks_existing_session(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        service = _service(db_session)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        access = (
            await db_session.execute(
                select(AssignmentAccess).where(
                    AssignmentAccess.student_id == student_user["id"],
                    AssignmentAccess.assignment_revision_id == published_assignment["id"],
                )
            )
        ).scalar_one()
        from app.core.http import utcnow

        access.revoked_at = utcnow()
        await db_session.commit()
        with pytest.raises(ForbiddenError):
            await service.get_session(session.id, student_user["user"])

    @pytest.mark.asyncio
    async def test_unknown_assignment_not_found(
        self, db_session: AsyncSession, student_user: dict
    ):
        with pytest.raises(NotFoundError):
            await _service(db_session).create_session(student_user["user"], "UNKNOWN_CODE")


class TestTurnProcessing:
    @pytest.mark.asyncio
    async def test_process_turn_returns_ai_message(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        service = _service(db_session)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        message, result = await service.process_turn(
            session_id=session.id,
            user=student_user["user"],
            student_input="Tôi muốn viết về ý chí vượt khó",
        )
        assert message.role.value == "ASSISTANT"
        assert message.content
        assert result.status in {"VALIDATED", "FALLBACK"}

    @pytest.mark.asyncio
    async def test_process_turn_saves_student_message(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        service = _service(db_session)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        await service.process_turn(
            session_id=session.id,
            user=student_user["user"],
            student_input="Tôi muốn viết về ý chí vượt khó",
        )
        student_msg = (
            await db_session.execute(
                select(ChatMessage).where(
                    ChatMessage.session_id == session.id,
                    ChatMessage.role == ChatRole.STUDENT,
                )
            )
        ).scalar_one_or_none()
        assert student_msg is not None
        assert "vượt khó" in student_msg.content

    @pytest.mark.asyncio
    async def test_fallback_is_visible_in_history(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        ai = FakeAiAdapter()
        ai.add_response(
            '{"message": "Đây không phải câu hỏi.", "suggested_state": "THESIS", "sources": []}'
        )
        service = _service(db_session, ai)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        message, result = await service.process_turn(
            session_id=session.id,
            user=student_user["user"],
            student_input="Tôi muốn hỏi về đề",
        )
        assert result.status == "FALLBACK"
        assert message.status == MessageStatus.FALLBACK
        messages, _, _ = await service.get_messages(session.id, student_user["user"])
        statuses = {m.status for m in messages}
        assert MessageStatus.FALLBACK in statuses
        assert MessageStatus.REJECTED not in statuses


class TestIdempotency:
    @pytest.mark.asyncio
    async def test_idempotent_replay_returns_same_result(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        service = _service(db_session)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        key = "test-key-123"
        msg1, _ = await service.process_turn(
            session_id=session.id,
            user=student_user["user"],
            student_input="Test message",
            idempotency_key=key,
        )
        msg2, _ = await service.process_turn(
            session_id=session.id,
            user=student_user["user"],
            student_input="Test message",
            idempotency_key=key,
        )
        assert msg1.id == msg2.id

    @pytest.mark.asyncio
    async def test_different_payload_raises_conflict(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        service = _service(db_session)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        key = "test-key-456"
        await service.process_turn(
            session_id=session.id,
            user=student_user["user"],
            student_input="Message 1",
            idempotency_key=key,
        )
        with pytest.raises(ConflictError):
            await service.process_turn(
                session_id=session.id,
                user=student_user["user"],
                student_input="Message 2",
                idempotency_key=key,
            )

    @pytest.mark.asyncio
    async def test_failed_then_replay_does_not_duplicate_student_message(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        from app.db.session import get_session_factory

        factory = get_session_factory()
        session = await _service(db_session).create_session(
            student_user["user"], published_assignment["code"]
        )
        await db_session.commit()

        failing = FakeAiAdapter()
        failing.set_fail_next(AiUnavailableError)
        async with factory() as s1:
            svc_fail = SocraticService(s1, ai_port=failing)
            with pytest.raises(AiUnavailableServiceError):
                await svc_fail.process_turn(
                    session_id=session.id,
                    user=student_user["user"],
                    student_input="Cùng một lượt",
                    idempotency_key="recover-key",
                )

        ok = FakeAiAdapter()
        ok.add_response(VALID_AI)
        async with factory() as s2:
            svc_ok = SocraticService(s2, ai_port=ok)
            msg, result = await svc_ok.process_turn(
                session_id=session.id,
                user=student_user["user"],
                student_input="Cùng một lượt",
                idempotency_key="recover-key",
            )
            assert result.status in {"VALIDATED", "FALLBACK"}
            assert msg.content

        students = (
            await db_session.execute(
                select(ChatMessage).where(
                    ChatMessage.session_id == session.id,
                    ChatMessage.role == ChatRole.STUDENT,
                )
            )
        ).scalars().all()
        assert len(students) == 1

    @pytest.mark.asyncio
    async def test_legacy_16_char_key_hash_replays_without_new_turn(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        service = _service(db_session)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        msg, _ = await service.process_turn(
            session.id, student_user["user"], "Cùng nội dung cũ"
        )
        key = "legacy-upgrade-key"
        payload = "Cùng nội dung cũ"
        db_session.add(
            IdempotencyRecord(
                user_id=student_user["id"],
                route=f"/socratic-sessions/{session.id}/messages",
                key_hash=_legacy_hash_key(key),
                request_hash=_hash_payload(payload),
                state=IdempotencyState.COMPLETED,
                resource_id=msg.id,
                cached_response={},
                expires_at=utcnow() + timedelta(hours=24),
            )
        )
        await db_session.commit()
        ai = FakeAiAdapter()
        ai.add_response(VALID_AI)
        replay = SocraticService(db_session, ai_port=ai)
        msg2, _ = await replay.process_turn(
            session.id,
            student_user["user"],
            payload,
            idempotency_key=key,
        )
        assert msg2.id == msg.id
        assert ai.call_count == 0
        turns = (
            await db_session.execute(
                select(ChatMessage).where(ChatMessage.session_id == session.id)
            )
        ).scalars().all()
        assert {m.turn_id for m in turns} == {1}


class TestOutlineManagement:
    @pytest.mark.asyncio
    async def test_update_outline_creates_revision(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        service = _service(db_session)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        outline_content = {
            "thesis": "Ý chí vượt khó giúp con người thành công",
            "sections": [{"title": "Mở bài", "content": "Giới thiệu vấn đề"}],
        }
        revision = await service.update_outline(
            session_id=session.id,
            user=student_user["user"],
            content=outline_content,
            expected_version=0,
        )
        assert revision.revision == 1
        assert revision.content["thesis"] == outline_content["thesis"]

    @pytest.mark.asyncio
    async def test_update_outline_increments_revision(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        service = _service(db_session)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        await service.update_outline(
            session.id, student_user["user"], {"thesis": "V1", "sections": [{}]}, 0
        )
        revision2 = await service.update_outline(
            session.id, student_user["user"], {"thesis": "V2", "sections": [{}]}, 1
        )
        assert revision2.revision == 2
        accepted = (
            await db_session.execute(
                select(OutlineRevision).where(
                    OutlineRevision.session_id == session.id,
                    OutlineRevision.review_status == OutlineRevisionStatus.ACCEPTED,
                )
            )
        ).scalars().all()
        assert len(accepted) == 1
        assert accepted[0].revision == 2

    @pytest.mark.asyncio
    async def test_update_outline_with_wrong_version_raises_conflict(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        service = _service(db_session)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        await service.update_outline(
            session.id, student_user["user"], {"thesis": "V1", "sections": [{}]}, 0
        )
        with pytest.raises(ConflictError):
            await service.update_outline(
                session.id, student_user["user"], {"thesis": "V2", "sections": [{}]}, 0
            )

    @pytest.mark.asyncio
    async def test_update_outline_with_correct_version_succeeds(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        service = _service(db_session)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        await service.update_outline(
            session.id, student_user["user"], {"thesis": "V1", "sections": [{}]}, 0
        )
        rev2 = await service.update_outline(
            session.id, student_user["user"], {"thesis": "V2", "sections": [{}]}, 1
        )
        assert rev2.revision == 2

    @pytest.mark.asyncio
    async def test_cannot_restore_superseded_revision(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        service = _service(db_session)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        rev1 = await service.update_outline(
            session.id, student_user["user"], {"thesis": "V1", "sections": [{}]}, 0
        )
        await service.update_outline(
            session.id, student_user["user"], {"thesis": "V2", "sections": [{}]}, 1
        )
        with pytest.raises(ConflictError) as exc:
            await service.review_outline(session.id, student_user["user"], rev1.id)
        assert exc.value.code in {"OUTLINE_NOT_CURRENT", "OUTLINE_SUPERSEDED"}

    @pytest.mark.asyncio
    async def test_review_current_with_policy_transitions_when_ready(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        service = _service(db_session)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        session.state = SocraticState.OUTLINE
        await db_session.commit()
        rev = await service.update_outline(
            session.id,
            student_user["user"],
            {"thesis": "Luận đề rõ", "sections": [{"title": "Mở"}]},
            0,
        )
        reviewed, readiness = await service.review_outline(
            session.id, student_user["user"], rev.id
        )
        assert reviewed.id == rev.id
        assert readiness == "READY"
        await db_session.refresh(session)
        assert session.state.value == "REVIEW"

    @pytest.mark.asyncio
    async def test_missing_policy_is_inconclusive(self, db_session: AsyncSession, student_user: dict):
        from app.db.models.socratic import AssignmentRevision

        assignment = AssignmentRevision(
            code=f"NOPOL_{uuid.uuid4().hex[:8]}",
            title="No policy",
            genre="NLXH",
            instructions={},
            rubric={},
            context_chunks=[],
            status="PUBLISHED",
            readiness_policy={},
        )
        db_session.add(assignment)
        await db_session.commit()
        await grant_assignment_access(db_session, assignment.id, student_user["id"])
        service = _service(db_session)
        session = await service.create_session(student_user["user"], assignment.code)
        rev = await service.update_outline(
            session.id, student_user["user"], {"thesis": "x", "sections": [{}]}, 0
        )
        _reviewed, readiness = await service.review_outline(
            session.id, student_user["user"], rev.id
        )
        assert readiness == "INCONCLUSIVE"


class TestFsmReviewGate:
    @pytest.mark.asyncio
    async def test_ai_cannot_enter_review_when_outline_not_ready(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        ai = FakeAiAdapter()
        ai.add_response(
            '{"message": "Em muốn rà soát luận điểm nào trước?",'
            ' "suggested_state": "REVIEW", "sources": []}'
        )
        service = _service(db_session, ai)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        session.state = SocraticState.OUTLINE
        await db_session.commit()
        await service.process_turn(
            session.id, student_user["user"], "Cho em sang bước rà soát"
        )
        await db_session.refresh(session)
        assert session.state == SocraticState.OUTLINE

    @pytest.mark.asyncio
    async def test_ai_enters_review_only_when_current_outline_ready(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        ai = FakeAiAdapter()
        ai.add_response(
            '{"message": "Em muốn rà soát luận điểm nào trước?",'
            ' "suggested_state": "REVIEW", "sources": []}'
        )
        service = _service(db_session, ai)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        session.state = SocraticState.OUTLINE
        await db_session.commit()
        await service.update_outline(
            session.id,
            student_user["user"],
            {"thesis": "Luận đề đủ", "sections": [{"title": "Mở"}]},
            0,
        )
        await service.process_turn(
            session.id, student_user["user"], "Dàn ý đã xong, em muốn rà soát"
        )
        await db_session.refresh(session)
        assert session.state == SocraticState.REVIEW


class TestChatHistoryWindow:
    @pytest.mark.asyncio
    async def test_load_session_context_uses_latest_messages(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        service = _service(db_session)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        for i in range(1, 26):
            db_session.add(
                ChatMessage(
                    session_id=session.id,
                    turn_id=i,
                    role=ChatRole.STUDENT,
                    content=f"msg-{i}",
                    status=MessageStatus.VALIDATED,
                )
            )
        await db_session.commit()
        loaded = await db_session.get(SocraticSession, session.id)
        ctx = await service._load_session_context(loaded)
        contents = [row["content"] for row in ctx["chat_history"]]
        assert "msg-25" in contents
        assert "msg-24" in contents
        assert "msg-1" not in contents
        assert contents == sorted(contents, key=lambda c: int(c.split("-")[1]))


class TestPagination:
    @pytest.mark.asyncio
    async def test_pages_do_not_split_turns(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        service = _service(db_session)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        for i in range(3):
            await service.process_turn(
                session.id, student_user["user"], f"Lượt {i}"
            )
        page1, has_more, cursor = await service.get_messages(
            session.id, student_user["user"], limit=1
        )
        assert has_more is True
        turns = {m.turn_id for m in page1}
        assert len(turns) == 1
        roles = {m.role for m in page1}
        assert ChatRole.STUDENT in roles
        assert ChatRole.ASSISTANT in roles
        page2, has_more2, cursor2 = await service.get_messages(
            session.id, student_user["user"], limit=1, before_turn=cursor
        )
        ids1 = {m.id for m in page1}
        ids2 = {m.id for m in page2}
        assert ids1.isdisjoint(ids2)
        rest, has_more3, _ = await service.get_messages(
            session.id, student_user["user"], limit=1, before_turn=cursor2
        )
        all_ids = ids1 | ids2 | {m.id for m in rest}
        everything, _, _ = await service.get_messages(
            session.id, student_user["user"], limit=50
        )
        assert {m.id for m in everything} == all_ids
        assert has_more3 is False
