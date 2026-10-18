"""Tests for AI adapters (fake + validation). OpenAI SDK tests live in test_openai_sdk.py."""

import pytest
from pydantic import BaseModel, Field

from app.ai.adapters import (
    AiConfigurationError,
    AiError,
    AiInvalidOutputError,
    AiTimeoutError,
    AiUnavailableError,
    FakeAiAdapter,
    create_ai_adapter,
    validate_structured_output,
)
from app.config import Settings


class DummyOutput(BaseModel):
    message: str = Field(..., description="Test message")
    score: int = Field(..., ge=0, le=10)


class TestFakeAdapter:
    def setup_method(self):
        self.adapter = FakeAiAdapter()

    @pytest.mark.asyncio
    async def test_returns_fake_response(self):
        self.adapter.add_response("Test response")
        result = await self.adapter.generate("test prompt")
        assert result.content == "Test response"
        assert result.raw.get("fake") is True
        assert result.raw.get("provider") == "fake"
        assert result.raw.get("model") == "fake-model"

    @pytest.mark.asyncio
    async def test_fails_when_configured(self):
        self.adapter.set_fail_next(AiUnavailableError)
        with pytest.raises(AiUnavailableError):
            await self.adapter.generate("test prompt")

    @pytest.mark.asyncio
    async def test_cycles_through_responses(self):
        self.adapter.add_response("Response 1")
        self.adapter.add_response("Response 2")
        r1 = await self.adapter.generate("prompt")
        r2 = await self.adapter.generate("prompt")
        r3 = await self.adapter.generate("prompt")
        assert r1.content == "Response 1"
        assert r2.content == "Response 2"
        assert r3.content == "Response 1"

    @pytest.mark.asyncio
    async def test_structured_output_with_json(self):
        self.adapter.add_response('{"message": "Hello", "score": 5}')
        result = await self.adapter.generate("test", structured_output=DummyOutput)
        assert isinstance(result.content, DummyOutput)
        assert result.content.message == "Hello"
        assert result.content.score == 5

    @pytest.mark.asyncio
    async def test_structured_output_with_invalid_json_raises(self):
        self.adapter.add_response("Not JSON")
        with pytest.raises(AiInvalidOutputError):
            await self.adapter.generate("test", structured_output=DummyOutput)

    @pytest.mark.asyncio
    async def test_records_max_tokens_and_omits_default_temperature(self):
        self.adapter.add_response("ok")
        await self.adapter.generate("p", max_tokens=128, temperature=None)
        assert self.adapter.last_max_tokens == 128
        assert self.adapter.last_temperature is None
        assert self.adapter.call_count == 1


class TestValidateStructuredOutput:
    def test_valid_json(self):
        data = '{"message": "Test", "score": 8}'
        result = validate_structured_output(data, DummyOutput)
        assert result.message == "Test"
        assert result.score == 8

    def test_invalid_json(self):
        with pytest.raises(AiInvalidOutputError):
            validate_structured_output("not json", DummyOutput)

    def test_invalid_schema(self):
        data = '{"message": "Test"}'
        with pytest.raises(AiInvalidOutputError):
            validate_structured_output(data, DummyOutput)


class TestAiExceptions:
    def test_base_exception(self):
        exc = AiError("test", "TEST_CODE")
        assert exc.message == "test"
        assert exc.code == "TEST_CODE"

    def test_timeout_exception(self):
        exc = AiTimeoutError()
        assert exc.code == "AI_TIMEOUT"
        assert "timed out" in str(exc)

    def test_unavailable_exception(self):
        exc = AiUnavailableError()
        assert exc.code == "AI_UNAVAILABLE"

    def test_invalid_output_exception(self):
        exc = AiInvalidOutputError()
        assert exc.code == "AI_INVALID_OUTPUT"


def test_factory_uses_settings_model_and_fake_provider() -> None:
    settings = Settings(
        AI_PROVIDER="fake",
        AI_MODEL="custom-model-xyz",
        SOCRATIC_PROMPT_VERSION="v1",
        AI_MAX_OUTPUT_TOKENS=128,
    )
    adapter = create_ai_adapter(settings)
    assert adapter.model_name == "custom-model-xyz"
    assert adapter.provider_name == "fake"


def test_factory_openai_requires_model() -> None:
    settings = Settings(AI_PROVIDER="openai", AI_MODEL="", OPENAI_API_KEY="sk-test")
    with pytest.raises(AiConfigurationError):
        create_ai_adapter(settings)
