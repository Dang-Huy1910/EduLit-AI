"""Tests for Socratic guardrails."""

import pytest

from app.ai.schemas import SourceReference
from app.workflows.guardrails import (
    detect_out_of_scope,
    detect_sample_writing,
    detect_write_for_me,
    get_fallback_response,
    normalize_quote,
    validate_response,
    validate_sources,
    validate_structured_outline,
    validate_structured_turn,
)


class TestWriteForMeDetection:
    @pytest.mark.parametrize(
        "text",
        [
            "viết hộ tôi một bài văn",
            "làm bài giùm tôi",
            "viết giúp tôi một đoạn mở bài",
            "làm hộ bài tập này",
            "để tôi copy",
            "bài mẫu về chủ đề này",
            "đoạn văn mẫu cho bài nghị luận",
        ],
    )
    def test_detects_write_for_me(self, text: str):
        assert detect_write_for_me(text) is True

    @pytest.mark.parametrize(
        "text",
        [
            "Tôi muốn hỏi về dàn ý",
            "Cách viết đoạn thân bài?",
            "Hãy giúp tôi hiểu đề bài",
            "Tôi không biết bắt đầu từ đâu",
        ],
    )
    def test_allows_legitimate_questions(self, text: str):
        assert detect_write_for_me(text) is False


class TestOutOfScopeDetection:
    @pytest.mark.parametrize(
        "text",
        [
            "giải bài toán này",
            "làm bài vật lý",
            "làm bài hóa",
            "dịch sang tiếng anh",
            "viết code python",
        ],
    )
    def test_detects_out_of_scope(self, text: str):
        assert detect_out_of_scope(text) is True

    @pytest.mark.parametrize(
        "text",
        [
            "Cách viết bài nghị luận xã hội?",
            "Đề bài yêu cầu gì?",
            "Giúp tôi hiểu về lòng kiên định",
        ],
    )
    def test_allows_legitimate_requests(self, text: str):
        assert detect_out_of_scope(text) is False


class TestResponseValidation:
    def test_valid_open_questions(self):
        is_valid, error = validate_response(
            "Em thấy ý nào trong đề bài đáng băn khoăn nhất?"
        )
        assert is_valid is True
        assert error == ""

    def test_valid_two_guiding_questions(self):
        is_valid, error = validate_response(
            "Điều gì khiến em chọn hướng này? Em sẽ bắt đầu từ luận điểm nào?"
        )
        assert is_valid is True

    def test_valid_response_exactly_4_sentences_all_questions(self):
        text = "Câu 1? Câu 2? Câu 3? Câu 4?"
        is_valid, error = validate_response(text)
        assert is_valid is True

    def test_invalid_response_over_4_sentences(self):
        text = "Câu 1? Câu 2? Câu 3? Câu 4? Câu 5?"
        is_valid, error = validate_response(text)
        assert is_valid is False
        assert "4 câu" in error

    def test_invalid_response_no_question_mark(self):
        text = "Đây là một câu trả lời"
        is_valid, error = validate_response(text)
        assert is_valid is False
        assert "câu hỏi" in error

    def test_sample_paragraph_three_sentences_plus_question_rejected(self):
        text = (
            "Trong thời đại số, bản lĩnh giúp người trẻ giữ vững giá trị sống. "
            "Họ cần biết chọn lọc thông tin thay vì bị thuật toán dẫn dắt. "
            "Từ đó, mỗi người sẽ hình thành thái độ trách nhiệm với cộng đồng. "
            "Em nghĩ sao về điều này?"
        )
        is_valid, error = validate_response(text)
        assert is_valid is False
        assert "viết hộ" in error or "mẫu" in error
        assert detect_sample_writing(text) is True

    def test_explain_intent_allows_statement_without_question(self):
        is_valid, error = validate_response(
            "Luận điểm này bám vào hình ảnh khói rơm rạ trong ngữ liệu.",
            intent="EXPLAIN",
        )
        assert is_valid is True
        assert error == ""

    def test_outline_init_allows_short_welcome_without_question(self):
        is_valid, error = validate_response(
            "Đây là dàn ý gợi ý theo đề và ngữ liệu.",
            task="outline_init",
        )
        assert is_valid is True

    def test_clarify_still_requires_question(self):
        is_valid, error = validate_response(
            "Em muốn chỉnh ý nào trong thân bài.",
            intent="CLARIFY",
        )
        assert is_valid is False
        assert "câu hỏi" in error

    def test_open_question_not_false_positive(self):
        text = (
            "Em đang nghiêng về luận điểm nào? "
            "Dẫn chứng nào trong ngữ liệu khiến em tin như vậy?"
        )
        is_valid, error = validate_response(text)
        assert is_valid is True


class TestSourceValidation:
    chunks = [
        {"chunk_id": "chunk_1", "text": "Nội dung mẫu về ý chí vượt khó và bản lĩnh."},
        {"chunk_id": "chunk_2", "text": "Giá trị nhân văn trong kỷ nguyên số."},
    ]

    def test_valid_sources_quote_in_chunk(self):
        sources = [{"chunk_id": "chunk_1", "quote": "ý chí vượt khó"}]
        ok, err = validate_sources(sources, self.chunks)
        assert ok is True
        assert err == ""

    def test_invalid_chunk_id(self):
        sources = [{"chunk_id": "chunk_999", "quote": "ý chí vượt khó"}]
        ok, err = validate_sources(sources, self.chunks)
        assert ok is False
        assert "chunk_id" in err

    def test_invented_quote_on_real_chunk_rejected(self):
        sources = [{"chunk_id": "chunk_1", "quote": "câu nói bịa đặt hoàn toàn không có"}]
        ok, err = validate_sources(sources, self.chunks)
        assert ok is False
        assert "Trích dẫn" in err

    def test_empty_sources(self):
        ok, err = validate_sources(None, self.chunks)
        assert ok is True
        ok, err = validate_sources([], self.chunks)
        assert ok is True

    def test_source_without_chunk_id_rejected(self):
        sources = [{"quote": "ý chí vượt khó"}]
        ok, err = validate_sources(sources, self.chunks)
        assert ok is False

    def test_malformed_source_rejected(self):
        ok, err = validate_sources(["chunk_1"], self.chunks)
        assert ok is False

    def test_source_reference_model(self):
        sources = [SourceReference(chunk_id="chunk_2", quote="Giá trị nhân văn")]
        ok, err = validate_sources(sources, self.chunks)
        assert ok is True

    def test_quote_normalization_allows_wrapping_quotes_and_whitespace(self):
        assert normalize_quote('  “ý chí   vượt khó”  ') == "ý chí vượt khó"
        sources = [{"chunk_id": "chunk_1", "quote": "  “ý chí   vượt khó” "}]
        ok, err = validate_sources(sources, self.chunks)
        assert ok is True


class TestStructuredPayloadValidation:
    chunks = [
        {"chunk_id": "chunk_1", "text": "Nội dung mẫu về ý chí vượt khó và bản lĩnh."},
    ]

    def test_unknown_source_chunk_on_point_rejected(self):
        content = {
            "thesis": "Luận đề ngắn",
            "sections": [
                {
                    "id": "intro",
                    "title": "I",
                    "points": [
                        {
                            "id": "intro-1",
                            "text": "Ý mở ngắn",
                            "kind": "claim",
                            "source_chunk_id": "chunk_missing",
                        }
                    ],
                }
            ],
        }
        ok, err = validate_structured_outline(content, self.chunks)
        assert ok is False
        assert "source_chunk_id" in err

    def test_sample_essay_in_section_content_rejected(self):
        content = {
            "thesis": "Luận đề ngắn",
            "sections": [
                {
                    "id": "body",
                    "title": "II",
                    "content": (
                        "Mở bài: Trong thời đại số, bản lĩnh giúp người trẻ giữ vững giá trị sống. "
                        "Họ cần biết chọn lọc thông tin thay vì bị thuật toán dẫn dắt. "
                        "Từ đó mỗi người sẽ hình thành thái độ trách nhiệm với cộng đồng."
                    ),
                    "points": [{"id": "body-1", "text": "Luận điểm ngắn", "kind": "claim"}],
                }
            ],
        }
        ok, err = validate_structured_outline(content, self.chunks)
        assert ok is False
        assert "mẫu" in err or "viết hộ" in err

    def test_short_bullets_allowed(self):
        content = {
            "thesis": "Ý chí giúp con người vượt khó",
            "sections": [
                {
                    "id": "intro",
                    "title": "I. Mở bài",
                    "points": [
                        {
                            "id": "intro-1",
                            "text": "Dẫn vào vấn đề ý chí",
                            "kind": "claim",
                            "source_chunk_id": "chunk_1",
                        }
                    ],
                }
            ],
        }
        ok, err = validate_structured_outline(content, self.chunks)
        assert ok is True
        assert err == ""

    def test_proposal_unknown_source_rejected(self):
        ok, err = validate_structured_turn(
            outline_ops=[],
            proposals=[
                {
                    "section_id": "body",
                    "text": "Ý mới ngắn",
                    "source_chunk_id": "chunk_999",
                }
            ],
            available_chunks=self.chunks,
        )
        assert ok is False
        assert "source_chunk_id" in err

    def test_op_sample_paragraph_rejected(self):
        ok, err = validate_structured_turn(
            outline_ops=[
                {
                    "op": "add",
                    "section_id": "body",
                    "text": (
                        "Mở bài: Trong thời đại số bản lĩnh giúp người trẻ giữ vững giá trị sống. "
                        "Họ cần biết chọn lọc thông tin thay vì bị thuật toán dẫn dắt. "
                        "Từ đó mỗi người sẽ hình thành thái độ trách nhiệm với cộng đồng."
                    ),
                }
            ],
            proposals=[],
            available_chunks=self.chunks,
        )
        assert ok is False


class TestFallbackResponses:
    @pytest.mark.parametrize(
        "state,expected",
        [
            ("INIT", "Bạn có thể chia sẻ suy nghĩ đầu tiên"),
            ("THESIS", "Em có thể nói rõ hơn"),
            ("OUTLINE", "Trước khi phát triển chi tiết"),
            ("REVIEW", "Em cảm thấy dàn ý hiện tại"),
        ],
    )
    def test_fallback_by_state(self, state: str, expected: str):
        response = get_fallback_response(state)
        assert expected in response
        assert response.endswith("?")

    def test_fallback_unknown_state(self):
        response = get_fallback_response("UNKNOWN")
        assert "suy nghĩ" in response
