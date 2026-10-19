"""Socratic outline init, intent, structured edits, and replay tests."""

from __future__ import annotations

import asyncio
import json
import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.adapters import AiUnavailableError, FakeAiAdapter
from app.core.passwords import hash_password_sync
from app.db.models import (
    ChatMessage,
    OutlineRevision,
    SocraticSession,
    User,
    UserRole,
)
from app.db.models.socratic import AssignmentAccess, AssignmentRevision
from app.db.session import get_session_factory
from app.services.socratic_service import (
    AiUnavailableServiceError,
    ConflictError,
    SocraticService,
)
from app.workflows.outline_ops import apply_outline_ops, normalize_outline_content
from app.ai.schemas import OutlineOp
from tests.conftest import grant_assignment_access
from tests.socratic.test_service import VALID_AI, _service


SEED_OUTLINE = {
    "thesis": "Ý chí vượt khó giúp con người thành công",
    "sections": [
        {
            "id": "intro",
            "title": "I. Mở bài — Đặt vấn đề",
            "points": [{"id": "intro-1", "text": "Dẫn vào vấn đề ý chí", "kind": "claim"}],
        },
        {
            "id": "body",
            "title": "II. Thân bài — Triển khai luận điểm",
            "points": [
                {"id": "body-1", "text": "Luận điểm cũ cần giữ", "kind": "claim"},
                {"id": "body-2", "text": "Ý sẽ được sửa", "kind": "claim"},
            ],
        },
        {
            "id": "conclusion",
            "title": "III. Kết bài — Đánh giá & Thông điệp",
            "points": [{"id": "conc-1", "text": "Khẳng định thông điệp", "kind": "note"}],
        },
    ],
    "arguments": [{"id": "arg-1", "content": "Luận điểm cũ cần giữ", "position": 0}],
}


def _explain_ai(message: str = "Luận điểm này bám vào ngữ liệu về ý chí vượt khó.") -> str:
    return json.dumps(
        {
            "message": message,
            "suggested_state": "OUTLINE",
            "intent": "EXPLAIN",
            "sources": [{"chunk_id": "chunk_1", "quote": "ý chí vượt khó"}],
            "outline_ops": [
                {"op": "delete", "target_id": "body-1", "section_id": "body"}
            ],
            "proposals": [],
        },
        ensure_ascii=False,
    )


def _edit_ai() -> str:
    return json.dumps(
        {
            "message": "Đã sửa đúng ý em yêu cầu trong thân bài.",
            "suggested_state": "OUTLINE",
            "intent": "EDIT",
            "sources": [],
            "outline_ops": [
                {
                    "op": "update",
                    "target_id": "body-2",
                    "section_id": "body",
                    "text": "Ý đã được chỉnh theo yêu cầu",
                    "kind": "claim",
                }
            ],
            "proposals": [],
        },
        ensure_ascii=False,
    )


def _propose_ai() -> str:
    return json.dumps(
        {
            "message": "Em có thể bổ sung ý về bản lĩnh trong kỷ nguyên số.",
            "suggested_state": "OUTLINE",
            "intent": "PROPOSE",
            "sources": [],
            "outline_ops": [
                {"op": "add", "section_id": "body", "text": "Không được tự thêm", "kind": "claim"}
            ],
            "proposals": [
                {
                    "section_id": "body",
                    "text": "Bản lĩnh giúp chọn lọc thông tin",
                    "kind": "claim",
                }
            ],
        },
        ensure_ascii=False,
    )


def _mixed_ai() -> str:
    return json.dumps(
        {
            "message": "Ý dẫn chứng bám ngữ liệu ý chí vượt khó. Đã thêm ý em yêu cầu vào thân bài.",
            "suggested_state": "OUTLINE",
            "intent": "MIXED",
            "sources": [{"chunk_id": "chunk_1", "quote": "ý chí vượt khó"}],
            "outline_ops": [
                {"op": "add", "section_id": "body", "text": "Ý mới từ yêu cầu của em", "kind": "claim"}
            ],
            "proposals": [],
        },
        ensure_ascii=False,
    )


def _clarify_ai() -> str:
    return json.dumps(
        {
            "message": "Em muốn điều chỉnh luận điểm nào trong thân bài?",
            "suggested_state": "OUTLINE",
            "intent": "CLARIFY",
            "sources": [],
            "outline_ops": [
                {"op": "delete", "target_id": "body-1", "section_id": "body"}
            ],
            "proposals": [],
        },
        ensure_ascii=False,
    )


async def _seed_student_outline(
    db: AsyncSession, student: dict, assignment: dict, content: dict | None = None
) -> tuple[SocraticService, SocraticSession]:
    service = _service(db)
    session = await service.create_session(student["user"], assignment["code"])
    await service.update_outline(
        session.id, student["user"], content or SEED_OUTLINE, expected_version=0
    )
    await db.refresh(session)
    return service, session


class TestOutlineInitOnce:
    @pytest.mark.asyncio
    async def test_init_persists_revision_before_return(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        ai = FakeAiAdapter()
        service = SocraticService(db_session, ai_port=ai)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        outline, status, message = await service.ensure_initial_outline(
            session.id, student_user["user"]
        )
        assert status == "COMPLETED"
        assert outline is not None
        assert outline.revision == 1
        assert outline.author == "ASSISTANT"
        assert message
        content = normalize_outline_content(outline.content)
        ids = {s["id"] for s in content["sections"]}
        assert {"intro", "body", "conclusion"} <= ids
        assert content["thesis"]
        await db_session.refresh(session)
        assert session.outline_version == 1
        assert session.state.value == "OUTLINE"
        rows = (
            await db_session.execute(
                select(OutlineRevision).where(OutlineRevision.session_id == session.id)
            )
        ).scalars().all()
        assert len(rows) == 1

    @pytest.mark.asyncio
    async def test_retry_does_not_create_second_outline(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        service = _service(db_session)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        first, _, _ = await service.ensure_initial_outline(session.id, student_user["user"])
        ai = FakeAiAdapter()
        ai.add_outline_response(
            json.dumps(
                {
                    "message": "Dàn ý khác",
                    "thesis": "Không được ghi đè",
                    "sections": [
                        {"id": "intro", "title": "I", "points": [{"id": "x", "text": "X", "kind": "claim"}]},
                        {"id": "body", "title": "II", "points": [{"id": "y", "text": "Y", "kind": "claim"}]},
                        {"id": "conclusion", "title": "III", "points": [{"id": "z", "text": "Z", "kind": "claim"}]},
                    ],
                    "needs_clarification": False,
                    "sources": [],
                },
                ensure_ascii=False,
            )
        )
        replay = SocraticService(db_session, ai_port=ai)
        second, status, _ = await replay.ensure_initial_outline(
            session.id, student_user["user"], retry=True
        )
        assert status == "COMPLETED"
        assert second is not None
        assert first is not None
        assert second.id == first.id
        assert second.content["thesis"] == first.content["thesis"]
        assert ai.call_count == 0
        count = (
            await db_session.execute(
                select(func.count()).select_from(OutlineRevision).where(
                    OutlineRevision.session_id == session.id
                )
            )
        ).scalar_one()
        assert count == 1

    @pytest.mark.asyncio
    async def test_concurrent_init_only_one_revision(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        factory = get_session_factory()
        setup = SocraticService(db_session, ai_port=FakeAiAdapter())
        session = await setup.create_session(
            student_user["user"], published_assignment["code"]
        )
        await db_session.commit()

        ai = FakeAiAdapter()
        ai.hold_before_generate = asyncio.Event()
        ai.release_generate = asyncio.Event()
        async with factory() as s1, factory() as s2:
            svc1 = SocraticService(s1, ai_port=ai)
            svc2 = SocraticService(s2, ai_port=ai)
            t1 = asyncio.create_task(
                svc1.ensure_initial_outline(session.id, student_user["user"])
            )
            await asyncio.wait_for(ai.hold_before_generate.wait(), timeout=5)
            t2 = asyncio.create_task(
                svc2.ensure_initial_outline(session.id, student_user["user"])
            )
            done, _pending = await asyncio.wait({t2}, timeout=5)
            assert t2 in done
            with pytest.raises(ConflictError) as exc:
                t2.result()
            assert exc.value.code == "OUTLINE_INIT_IN_PROGRESS"
            ai.release_generate.set()
            outline, status, _ = await t1
            assert status == "COMPLETED"
            assert outline is not None
        count = (
            await db_session.execute(
                select(func.count()).select_from(OutlineRevision).where(
                    OutlineRevision.session_id == session.id
                )
            )
        ).scalar_one()
        assert count == 1

    @pytest.mark.asyncio
    async def test_ai_failure_does_not_store_fake_outline(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        ai = FakeAiAdapter()
        ai.set_fail_next(AiUnavailableError)
        service = SocraticService(db_session, ai_port=ai)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        with pytest.raises(AiUnavailableServiceError):
            await service.ensure_initial_outline(session.id, student_user["user"])
        await db_session.refresh(session)
        assert session.outline_version == 0
        assert session.outline_init_status == "FAILED"
        rows = (
            await db_session.execute(
                select(OutlineRevision).where(OutlineRevision.session_id == session.id)
            )
        ).scalars().all()
        assert rows == []

    @pytest.mark.asyncio
    async def test_missing_context_asks_clarification(
        self, db_session: AsyncSession, student_user: dict
    ):
        assignment = AssignmentRevision(
            code=f"SPARSE_{uuid.uuid4().hex[:8]}",
            title="   ",
            genre="nghi_luan_xa_hoi",
            instructions={},
            rubric={},
            context_chunks=[],
            status="PUBLISHED",
            readiness_policy={"minSections": 1},
        )
        db_session.add(assignment)
        await db_session.commit()
        await db_session.refresh(assignment)
        student = User(
            login_id=f"hs_{uuid.uuid4().hex[:8]}",
            email=f"hs_{uuid.uuid4().hex[:8]}@test.local",
            display_name="Sparse",
            password_hash=hash_password_sync("testpassword123"),
            role=UserRole.STUDENT,
        )
        db_session.add(student)
        await db_session.commit()
        await grant_assignment_access(db_session, assignment.id, student.id)
        # title blank fails essential context — give a title but no material
        assignment.title = "Đề chưa có ngữ liệu"
        assignment.instructions = {}
        assignment.rubric = {}
        assignment.context_chunks = []
        await db_session.commit()

        ai = FakeAiAdapter()
        service = SocraticService(db_session, ai_port=ai)
        session = await service.create_session(student, assignment.code)
        outline, status, message = await service.ensure_initial_outline(session.id, student)
        assert outline is None
        assert status == "NEEDS_CLARIFICATION"
        assert message
        assert ai.call_count == 0
        await db_session.refresh(session)
        assert session.outline_version == 0


class TestIntentDoesNotCorruptOutline:
    @pytest.mark.asyncio
    async def test_explain_does_not_change_outline_or_version(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        ai = FakeAiAdapter()
        ai.add_response(_explain_ai())
        service = SocraticService(db_session, ai_port=ai)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        await service.update_outline(
            session.id, student_user["user"], SEED_OUTLINE, expected_version=0
        )
        version_before = 1
        msg, result = await service.process_turn(
            session.id, student_user["user"], "Ý luận điểm 1 nghĩa là gì?"
        )
        assert result.intent == "EXPLAIN"
        assert result.outline_changed is False
        assert result.applied_ops == []
        await db_session.refresh(session)
        assert session.outline_version == version_before
        current = await service.get_current_outline(session.id, student_user["user"])
        body = next(s for s in current.content["sections"] if s["id"] == "body")
        assert any(p["id"] == "body-1" for p in body["points"])
        assert msg.content

    @pytest.mark.asyncio
    async def test_edit_only_changes_requested_point(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        ai = FakeAiAdapter()
        ai.add_response(_edit_ai())
        service = SocraticService(db_session, ai_port=ai)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        await service.update_outline(
            session.id, student_user["user"], SEED_OUTLINE, expected_version=0
        )
        _msg, result = await service.process_turn(
            session.id,
            student_user["user"],
            "Sửa ý 'Ý sẽ được sửa' thành 'Ý đã được chỉnh theo yêu cầu'",
        )
        assert result.intent == "EDIT"
        assert result.outline_changed is True
        current = await service.get_current_outline(session.id, student_user["user"])
        by_id = {
            p["id"]: p["text"]
            for s in current.content["sections"]
            for p in s["points"]
        }
        assert by_id["body-1"] == "Luận điểm cũ cần giữ"
        assert by_id["body-2"] == "Ý đã được chỉnh theo yêu cầu"
        assert by_id["intro-1"] == "Dẫn vào vấn đề ý chí"
        await db_session.refresh(session)
        assert session.outline_version == 2

    @pytest.mark.asyncio
    async def test_propose_does_not_change_outline_until_student_adds(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        ai = FakeAiAdapter()
        ai.add_response(_propose_ai())
        service = SocraticService(db_session, ai_port=ai)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        await service.update_outline(
            session.id, student_user["user"], SEED_OUTLINE, expected_version=0
        )
        _msg, result = await service.process_turn(
            session.id, student_user["user"], "Em thấy nên thêm ý về bản lĩnh."
        )
        assert result.intent == "PROPOSE"
        assert result.outline_changed is False
        assert result.applied_ops == []
        assert result.proposals
        assert result.proposals[0]["text"] == "Bản lĩnh giúp chọn lọc thông tin"
        current = await service.get_current_outline(session.id, student_user["user"])
        texts = [p["text"] for s in current.content["sections"] for p in s["points"]]
        assert "Không được tự thêm" not in texts
        assert "Bản lĩnh giúp chọn lọc thông tin" not in texts
        await db_session.refresh(session)
        assert session.outline_version == 1

    @pytest.mark.asyncio
    async def test_mixed_explains_and_edits(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        ai = FakeAiAdapter()
        ai.add_response(_mixed_ai())
        service = SocraticService(db_session, ai_port=ai)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        await service.update_outline(
            session.id, student_user["user"], SEED_OUTLINE, expected_version=0
        )
        msg, result = await service.process_turn(
            session.id,
            student_user["user"],
            "Ý này nghĩa là gì, thêm giúp em ý mới vào thân bài: Ý mới từ yêu cầu của em",
        )
        assert result.intent == "MIXED"
        assert result.outline_changed is True
        assert "ý chí vượt khó" in msg.content.lower() or "ý chí" in msg.content.lower()
        current = await service.get_current_outline(session.id, student_user["user"])
        texts = [p["text"] for s in current.content["sections"] for p in s["points"]]
        assert "Ý mới từ yêu cầu của em" in texts
        assert "Luận điểm cũ cần giữ" in texts

    @pytest.mark.asyncio
    async def test_ambiguous_reference_clarifies_without_edit(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        ai = FakeAiAdapter()
        ai.add_response(_clarify_ai())
        service = SocraticService(db_session, ai_port=ai)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        await service.update_outline(
            session.id, student_user["user"], SEED_OUTLINE, expected_version=0
        )
        msg, result = await service.process_turn(
            session.id, student_user["user"], "Em thấy ý này chưa hợp lý"
        )
        assert result.intent == "CLARIFY"
        assert result.outline_changed is False
        assert msg.content.endswith("?")
        current = await service.get_current_outline(session.id, student_user["user"])
        body = next(s for s in current.content["sections"] if s["id"] == "body")
        assert any(p["id"] == "body-1" for p in body["points"])
        await db_session.refresh(session)
        assert session.outline_version == 1

    @pytest.mark.asyncio
    async def test_edit_without_target_becomes_clarify(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        ai = FakeAiAdapter()
        ai.add_response(
            json.dumps(
                {
                    "message": "Em muốn xóa ý nào?",
                    "suggested_state": "OUTLINE",
                    "intent": "EDIT",
                    "sources": [],
                    "outline_ops": [{"op": "delete", "section_id": "body"}],
                    "proposals": [],
                },
                ensure_ascii=False,
            )
        )
        service = SocraticService(db_session, ai_port=ai)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        await service.update_outline(
            session.id, student_user["user"], SEED_OUTLINE, expected_version=0
        )
        _msg, result = await service.process_turn(
            session.id, student_user["user"], "Xóa ý đi"
        )
        assert result.outline_changed is False
        await db_session.refresh(session)
        assert session.outline_version == 1
        assert result.intent in {"CLARIFY", "EDIT"}
        assert result.clarification_reason in {
            "OUTLINE_OP_AMBIGUOUS",
            "OUTLINE_OP_INVALID",
            None,
        }
        if result.intent == "EDIT":
            assert not result.applied_ops


class TestVersionManualAndReplay:
    @pytest.mark.asyncio
    async def test_manual_edit_preserved_and_replay_does_not_apply_twice(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        ai = FakeAiAdapter()
        ai.add_response(_edit_ai())
        service = SocraticService(db_session, ai_port=ai)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        await service.update_outline(
            session.id, student_user["user"], SEED_OUTLINE, expected_version=0
        )
        manual = json.loads(json.dumps(SEED_OUTLINE))
        manual["sections"][0]["points"][0]["text"] = "Ý học sinh tự sửa"
        await service.update_outline(
            session.id, student_user["user"], manual, expected_version=1
        )
        current = await service.get_current_outline(session.id, student_user["user"])
        intro = next(s for s in current.content["sections"] if s["id"] == "intro")
        assert intro["points"][0]["text"] == "Ý học sinh tự sửa"

        key = "edit-once"
        _msg1, result1 = await service.process_turn(
            session.id,
            student_user["user"],
            "Sửa ý thân bài thứ hai",
            idempotency_key=key,
        )
        assert result1.outline_changed is True
        version_after = (
            await db_session.execute(
                select(SocraticSession.outline_version).where(
                    SocraticSession.id == session.id
                )
            )
        ).scalar_one()

        ai2 = FakeAiAdapter()
        ai2.add_response(_edit_ai())
        replay = SocraticService(db_session, ai_port=ai2)
        _msg2, result2 = await replay.process_turn(
            session.id,
            student_user["user"],
            "Sửa ý thân bài thứ hai",
            idempotency_key=key,
        )
        assert _msg2.id == _msg1.id
        assert result2.outline_changed is False
        assert ai2.call_count == 0
        version_replay = (
            await db_session.execute(
                select(SocraticSession.outline_version).where(
                    SocraticSession.id == session.id
                )
            )
        ).scalar_one()
        assert version_replay == version_after
        current = await service.get_current_outline(session.id, student_user["user"])
        intro = next(s for s in current.content["sections"] if s["id"] == "intro")
        assert intro["points"][0]["text"] == "Ý học sinh tự sửa"

    @pytest.mark.asyncio
    async def test_stale_expected_version_does_not_apply(
        self, db_session: AsyncSession, student_user: dict, published_assignment: dict
    ):
        ai = FakeAiAdapter()
        ai.add_response(_edit_ai())
        service = SocraticService(db_session, ai_port=ai)
        session = await service.create_session(
            student_user["user"], published_assignment["code"]
        )
        await service.update_outline(
            session.id, student_user["user"], SEED_OUTLINE, expected_version=0
        )
        _msg, result = await service.process_turn(
            session.id,
            student_user["user"],
            "Sửa ý",
            expected_outline_version=0,
        )
        assert result.outline_changed is False
        await db_session.refresh(session)
        assert session.outline_version == 1


class TestOutlineOpsUnit:
    def test_apply_update_and_keep_others(self):
        content, applied = apply_outline_ops(
            SEED_OUTLINE,
            [OutlineOp(op="update", target_id="body-2", text="Mới", section_id="body")],
        )
        by_id = {p["id"]: p["text"] for s in content["sections"] for p in s["points"]}
        assert by_id["body-2"] == "Mới"
        assert by_id["body-1"] == "Luận điểm cũ cần giữ"
        assert applied[0]["op"] == "update"

    def test_ambiguous_delete_raises(self):
        from app.workflows.outline_ops import OutlineOpError

        with pytest.raises(OutlineOpError):
            apply_outline_ops(
                SEED_OUTLINE,
                [OutlineOp(op="delete", section_id="body")],
            )
