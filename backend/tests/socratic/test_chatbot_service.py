from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.adapters import FakeAiAdapter
from app.db.models import (
    AssignmentAccess,
    AssignmentRevision,
    Material,
    MaterialChunk,
    MaterialVersion,
    User,
    UserRole,
    UserStatus,
)
from app.services.chatbot_service import (
    ChatbotService,
    RetrievedChunk,
    _get_user_guide_content,
    _keyword_search,
    set_user_guide_content,
)


def _user(role: UserRole, suffix: str) -> User:
    return User(
        login_id=f"chatbot_{suffix}_{uuid.uuid4().hex[:8]}",
        email=f"chatbot_{uuid.uuid4().hex[:8]}@test.local",
        display_name="Chatbot test",
        password_hash="not-used-in-this-test",
        role=role,
        status=UserStatus.ACTIVE,
    )


@pytest.mark.asyncio
async def test_access_uses_material_owner_and_student_revision_snapshot(
    db_session: AsyncSession,
) -> None:
    teacher = _user(UserRole.TEACHER, "owner")
    other_teacher = _user(UserRole.TEACHER, "other")
    recipient = _user(UserRole.STUDENT, "recipient")
    non_recipient = _user(UserRole.STUDENT, "other_student")
    db_session.add_all([teacher, other_teacher, recipient, non_recipient])
    await db_session.flush()

    own_material = Material(owner_teacher_id=teacher.id, title="Tài liệu của tôi", status="READY")
    other_material = Material(owner_teacher_id=other_teacher.id, title="Tài liệu riêng", status="READY")
    db_session.add_all([own_material, other_material])
    await db_session.flush()

    old_version = MaterialVersion(
        material_id=own_material.id, version=1, content="nội dung cũ", status="READY"
    )
    current_version = MaterialVersion(
        material_id=own_material.id, version=2, content="nội dung hiện hành", status="READY"
    )
    private_version = MaterialVersion(
        material_id=other_material.id, version=1, content="bí mật giáo viên khác", status="READY"
    )
    db_session.add_all([old_version, current_version, private_version])
    await db_session.flush()
    db_session.add_all(
        [
            MaterialChunk(
                material_version_id=old_version.id,
                chunk_id="old-version",
                title="Cũ",
                text="nội dung cũ",
            ),
            MaterialChunk(
                material_version_id=current_version.id,
                chunk_id="current-version",
                title="Hiện hành",
                text="nội dung hiện hành",
            ),
            MaterialChunk(
                material_version_id=private_version.id,
                chunk_id="other-teacher-private",
                title="Riêng",
                text="bí mật giáo viên khác",
            ),
        ]
    )

    revision = AssignmentRevision(
        code=f"CHATBOT-{uuid.uuid4().hex[:8]}",
        title="Bài đã giao",
        genre="NLVH",
        status="PUBLISHED",
        snapshot={
            "materials": [
                {
                    "title": "Ngữ liệu tại thời điểm phát hành",
                    "chunks": [
                        {
                            "chunkId": "published-snapshot",
                            "title": "Bản đã giao",
                            "text": "nội dung đóng băng cho học sinh",
                        }
                    ],
                }
            ]
        },
    )
    db_session.add(revision)
    await db_session.flush()
    db_session.add(AssignmentAccess(assignment_revision_id=revision.id, student_id=recipient.id))
    await db_session.flush()

    service = ChatbotService(db_session, FakeAiAdapter(responses=["ok"]))
    teacher_chunks = await service._get_user_accessible_chunks(teacher)
    recipient_chunks = await service._get_user_accessible_chunks(recipient)
    non_recipient_chunks = await service._get_user_accessible_chunks(non_recipient)

    assert [chunk.chunk_id for chunk in teacher_chunks] == ["current-version"]
    assert [chunk.chunk_id for chunk in recipient_chunks] == ["published-snapshot"]
    assert non_recipient_chunks == []


@pytest.mark.asyncio
async def test_search_normalizes_vietnamese_and_does_not_call_llm_without_match(
    db_session: AsyncSession,
) -> None:
    chunk = RetrievedChunk(
        chunk_id="duong",
        title="Đường làng",
        text="Con đường quê",
        material_title="Ngữ liệu",
        source_name="Ngữ liệu",
    )
    assert _keyword_search("duong", [chunk]) == [chunk]
    assert _keyword_search("đường?", [chunk]) == [chunk]
    assert _keyword_search("Cách nộp bài?", [chunk]) == []

    original_guide = _get_user_guide_content()
    set_user_guide_content(
        "# Hướng dẫn\n\n## Dành cho học sinh\n\n### Nộp bài\nHọc sinh vào bài tập để nộp bài."
    )
    adapter = FakeAiAdapter(responses=["không được gọi"])

    class EmptyKnowledgeService(ChatbotService):
        async def _get_user_accessible_chunks(self, _user: User) -> list[RetrievedChunk]:
            return []

    try:
        guide_matches = _keyword_search(
            "Cách nộp bài?", await EmptyKnowledgeService(db_session, adapter)._get_global_guide_chunks()
        )
        result = await EmptyKnowledgeService(db_session, adapter).answer(
            _user(UserRole.STUDENT, "empty"), "zzzxqv987654321"
        )
    finally:
        set_user_guide_content(original_guide)

    assert [chunk.title for chunk in guide_matches] == ["Nộp bài"]
    assert result.answer == "Mình chưa tìm thấy thông tin này trong tài liệu hiện có."
    assert result.sources == []
    assert adapter.call_count == 0
