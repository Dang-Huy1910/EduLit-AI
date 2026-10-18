"""Finite retry and context-passing tests for the Socratic workflow."""

from __future__ import annotations

import pytest

from app.ai.adapters import AiUnavailableError, FakeAiAdapter
from app.ai.prompt_assets import load_socratic_prompt
from app.workflows.socratic_graph import run_turn

VALID = (
    '{"message": "Em muốn bám vào luận điểm nào trước?",'
    ' "suggested_state": "THESIS", "sources": []}'
)
INVALID_NO_QUESTION = (
    '{"message": "Đây là đoạn trả lời không có câu hỏi.",'
    ' "suggested_state": "THESIS", "sources": []}'
)
SAMPLE_PARAGRAPH = (
    '{"message": "Trong thời đại số, bản lĩnh giúp người trẻ giữ vững giá trị sống. '
    "Họ cần biết chọn lọc thông tin thay vì bị thuật toán dẫn dắt. "
    'Từ đó mỗi người hình thành thái độ trách nhiệm. Em nghĩ sao?",'
    ' "suggested_state": "THESIS", "sources": []}'
)


async def _run(ai: FakeAiAdapter, student_input: str = "Tôi muốn bàn về bản lĩnh", **kwargs):
    asset = load_socratic_prompt("v1")
    return await run_turn(
        session_id="s1",
        student_id="u1",
        assignment_revision_id="a1",
        current_state="INIT",
        student_input=student_input,
        rubric={"sentinel": kwargs.get("rubric_sentinel", "RUBRIC_SENTINEL")},
        context_chunks=kwargs.get(
            "chunks",
            [{"chunk_id": "chunk_1", "text": "Ngữ liệu về bản lĩnh trong kỷ nguyên số."}],
        ),
        ai_port=ai,
        instructions={"sentinel": kwargs.get("instr_sentinel", "INSTR_SENTINEL")},
        current_outline={"thesis": kwargs.get("outline_sentinel", "OUTLINE_SENTINEL")},
        chat_history=kwargs.get(
            "history",
            [{"role": "STUDENT", "content": kwargs.get("hist_sentinel", "HIST_SENTINEL")}],
        ),
        prompt_asset=asset,
        max_output_tokens=kwargs.get("max_output_tokens", 77),
    )


@pytest.mark.asyncio
async def test_first_valid_output_calls_model_once() -> None:
    ai = FakeAiAdapter()
    ai.add_response(VALID)
    result = await _run(ai)
    assert ai.call_count == 1
    assert result.status == "VALIDATED"
    assert result.message.endswith("?")


@pytest.mark.asyncio
async def test_first_invalid_second_valid_calls_twice() -> None:
    ai = FakeAiAdapter()
    ai.add_response(INVALID_NO_QUESTION)
    ai.add_response(VALID)
    result = await _run(ai)
    assert ai.call_count == 2
    assert result.status == "VALIDATED"
    assert "LẦN SỬA" in ai.last_prompt


@pytest.mark.asyncio
async def test_both_invalid_fallback_after_two_calls() -> None:
    ai = FakeAiAdapter()
    ai.add_response(INVALID_NO_QUESTION)
    ai.add_response(SAMPLE_PARAGRAPH)
    result = await _run(ai)
    assert ai.call_count == 2
    assert result.status == "FALLBACK"
    assert result.sources == []
    assert result.message.endswith("?")


@pytest.mark.asyncio
async def test_sample_paragraph_is_not_validated() -> None:
    ai = FakeAiAdapter()
    ai.add_response(SAMPLE_PARAGRAPH)
    ai.add_response(SAMPLE_PARAGRAPH)
    result = await _run(ai)
    assert result.status == "FALLBACK"
    assert ai.call_count == 2


@pytest.mark.asyncio
async def test_invented_quote_retries_then_fallback() -> None:
    ai = FakeAiAdapter()
    bad_source = (
        '{"message": "Em thấy chi tiết nào thuyết phục?", "suggested_state": "THESIS",'
        ' "sources": [{"chunk_id": "chunk_1", "quote": "câu bịa đặt không tồn tại"}]}'
    )
    ai.add_response(bad_source)
    ai.add_response(bad_source)
    result = await _run(ai)
    assert ai.call_count == 2
    assert result.status == "FALLBACK"
    assert result.sources == []


@pytest.mark.asyncio
async def test_provider_error_is_not_converted_to_fallback() -> None:
    ai = FakeAiAdapter()
    ai.set_fail_next(AiUnavailableError)
    with pytest.raises(AiUnavailableError):
        await _run(ai)
    assert ai.call_count == 1


@pytest.mark.asyncio
async def test_sentinels_reach_adapter_and_history_not_duplicated() -> None:
    ai = FakeAiAdapter()
    ai.add_response(VALID)
    current = "CURRENT_STUDENT_INPUT_UNIQUE"
    await _run(
        ai,
        student_input=current,
        rubric_sentinel="RUBRIC_ZZZ",
        instr_sentinel="INSTR_ZZZ",
        outline_sentinel="OUTLINE_ZZZ",
        hist_sentinel="HIST_ZZZ",
        max_output_tokens=64,
    )
    system = ai.last_system_prompt or ""
    prompt = ai.last_prompt or ""
    assert "INSTR_ZZZ" in system
    assert "RUBRIC_ZZZ" in system
    assert "OUTLINE_ZZZ" in system
    assert "HIST_ZZZ" in system
    assert "UNTRUSTED_COURSE_MATERIAL" in system
    assert "UNTRUSTED_STUDENT_DATA" in system
    assert "Bạn là Trợ lý Sư phạm" in system
    assert current in system
    assert system.count(current) == 1
    assert ai.last_max_tokens == 64
    assert current in prompt


@pytest.mark.asyncio
async def test_pre_guardrail_write_for_me_does_not_call_model() -> None:
    ai = FakeAiAdapter()
    result = await _run(ai, student_input="viết hộ tôi đoạn mở bài")
    assert ai.call_count == 0
    assert result.status == "FALLBACK"
