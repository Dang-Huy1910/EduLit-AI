"""Outline personalised by the writing profile: threshold, tips and guards."""

from __future__ import annotations

import json
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.adapters import FakeAiAdapter
from app.ai.prompt_assets import load_socratic_prompt
from app.config import Settings, get_settings
from app.db.models import UserRole, WritingProfile
from app.services.writing_profile_service import outline_style_context
from app.workflows.outline_init import STYLE_PROFILE_BANNER, STYLE_TIP_LABEL, run_outline_init
from tests.catalog.conftest import create_user

CHUNKS = [{"chunk_id": "chunk_1", "text": "ý chí vượt khó"}]

STYLE_PROFILE = {
    "analyzedCount": 3,
    "profileVersion": 2,
    "weakTraits": [
        {
            "traitId": "EVIDENCE_LINKING",
            "traitName": "Nối & Phân tích dẫn chứng",
            "level": "EMERGING",
            "note": "Dẫn chứng còn đứng riêng.",
            "issues": ["Trích dẫn chứng nhưng chưa phân tích."],
            "practiceTips": ["Viết thêm câu phân tích sau dẫn chứng."],
        }
    ],
}


async def _init(ai: FakeAiAdapter, style_profile: dict[str, Any] | None):
    return await run_outline_init(
        title="Đề nghị luận về ý chí",
        instructions={"task": "Viết bài"},
        rubric={"c": 1},
        context_chunks=CHUNKS,
        ai_port=ai,
        prompt_asset=load_socratic_prompt("v2", kind="outline-init"),
        style_profile=style_profile,
    )


@pytest.mark.asyncio
async def test_profile_adds_a_labelled_tip_on_a_weak_group() -> None:
    ai = FakeAiAdapter()

    result = await _init(ai, STYLE_PROFILE)

    assert result.status == "COMPLETED"
    assert STYLE_PROFILE_BANNER in ai.last_system_prompt
    assert "Trích dẫn chứng nhưng chưa phân tích." in ai.last_system_prompt
    tips = result.content["styleTips"]
    assert len(tips) == 1
    assert tips[0]["traitId"] == "EVIDENCE_LINKING"
    assert tips[0]["traitName"] == "Nối & Phân tích dẫn chứng"
    assert tips[0]["pointId"] == "body-1e"
    assert tips[0]["sectionId"] == "body"
    assert tips[0]["label"] == STYLE_TIP_LABEL


@pytest.mark.asyncio
async def test_without_profile_the_outline_is_generic() -> None:
    ai = FakeAiAdapter()

    result = await _init(ai, None)

    assert STYLE_PROFILE_BANNER not in ai.last_system_prompt
    assert result.content["styleTips"] == []
    assert "khung dàn ý gọn" in ai.last_prompt


@pytest.mark.asyncio
async def test_tips_outside_the_weak_groups_or_outline_are_dropped() -> None:
    outline = {
        "message": "Đây là khung dàn ý gợi ý.",
        "thesis": "Ý chí giúp vượt khó",
        "sections": [
            {"id": "intro", "title": "I. Mở bài", "points": [{"id": "intro-1", "text": "Dẫn vào", "kind": "claim"}]},
            {"id": "body", "title": "II. Thân bài", "points": [{"id": "body-1", "text": "Luận điểm 1", "kind": "claim"}]},
            {"id": "conclusion", "title": "III. Kết bài", "points": [{"id": "conc-1", "text": "Thông điệp", "kind": "note"}]},
        ],
        "needs_clarification": False,
        "sources": [],
        "style_tips": [
            # A group the profile never called weak.
            {"section_id": "body", "point_id": "body-1", "trait_id": "WORD_CHOICE", "text": "Dùng từ hay hơn."},
            # Right group, unknown point: kept on the section.
            {"section_id": "body", "point_id": "body-9", "trait_id": "evidence_linking", "text": "  Phân tích  thêm. "},
            {"section_id": "conclusion", "trait_id": "EVIDENCE_LINKING", "text": "Ghi chú thứ hai."},
            {"section_id": "intro", "trait_id": "EVIDENCE_LINKING", "text": "Ghi chú thứ ba bị cắt."},
        ],
    }
    ai = FakeAiAdapter()
    ai.add_outline_response(json.dumps(outline, ensure_ascii=False))

    result = await _init(ai, STYLE_PROFILE)

    tips = result.content["styleTips"]
    assert [(tip["sectionId"], tip["pointId"], tip["text"]) for tip in tips] == [
        ("body", None, "Phân tích thêm."),
        ("conclusion", None, "Ghi chú thứ hai."),
    ]


@pytest.mark.asyncio
async def test_profile_tips_are_dropped_when_no_profile_was_sent() -> None:
    outline = {
        "message": "Đây là khung dàn ý gợi ý.",
        "thesis": "Ý chí giúp vượt khó",
        "sections": [
            {"id": "intro", "title": "I", "points": [{"id": "intro-1", "text": "Dẫn vào", "kind": "claim"}]},
            {"id": "body", "title": "II", "points": [{"id": "body-1", "text": "Luận điểm", "kind": "claim"}]},
            {"id": "conclusion", "title": "III", "points": [{"id": "conc-1", "text": "Kết", "kind": "note"}]},
        ],
        "sources": [],
        "style_tips": [{"section_id": "body", "trait_id": "EVIDENCE_LINKING", "text": "Không được hiện."}],
    }
    ai = FakeAiAdapter()
    ai.add_outline_response(json.dumps(outline, ensure_ascii=False))

    result = await _init(ai, None)

    assert result.content["styleTips"] == []


def _payload(analyzed: int, *, weakness: bool = True) -> dict[str, Any]:
    traits = [
        {"traitId": "EVIDENCE_LINKING", "level": "EMERGING", "note": "Còn mỏng.", "evidenceCount": 1},
        {"traitId": "WORD_CHOICE", "level": "CONSISTENT", "note": "Ổn.", "evidenceCount": 2},
    ]
    observations = [
        {
            "traitId": "EVIDENCE_LINKING" if weakness else "WORD_CHOICE",
            "kind": "WEAKNESS" if weakness else "STRENGTH",
            "description": "Trích dẫn chứng nhưng chưa phân tích.",
            "practiceTip": "Viết thêm câu phân tích.",
            "evidenceQuote": "Câu trích nguyên văn từ bài cũ",
            "resultId": "r1",
        }
    ]
    return {
        "insufficient": False,
        "summary": "Tóm tắt.",
        "traits": traits if weakness else traits[1:],
        "observations": observations,
        "stats": {"analyzedCount": analyzed},
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(("analyzed", "expected"), [(2, False), (3, True)])
async def test_style_context_needs_three_papers(
    db_session: AsyncSession,
    settings: Settings,
    client: AsyncClient,
    analyzed: int,
    expected: bool,
) -> None:
    student = await create_user(db_session, settings, client, role=UserRole.STUDENT, prefix="hs")
    db_session.add(WritingProfile(student_id=student.id, payload=_payload(analyzed), version=4))
    await db_session.commit()

    context = await outline_style_context(db_session, student.id, get_settings())

    assert (context is not None) is expected
    if context:
        assert context["profileVersion"] == 4
        assert context["weakTraits"][0]["traitId"] == "EVIDENCE_LINKING"
        assert context["weakTraits"][0]["issues"] == ["Trích dẫn chứng nhưng chưa phân tích."]
        # Earlier papers are summarised, never quoted.
        assert "Câu trích nguyên văn" not in json.dumps(context, ensure_ascii=False)


@pytest.mark.asyncio
async def test_style_context_is_none_without_a_weak_group(
    db_session: AsyncSession, settings: Settings, client: AsyncClient
) -> None:
    student = await create_user(db_session, settings, client, role=UserRole.STUDENT, prefix="hs")
    db_session.add(WritingProfile(student_id=student.id, payload=_payload(5, weakness=False)))
    await db_session.commit()

    assert await outline_style_context(db_session, student.id, get_settings()) is None
