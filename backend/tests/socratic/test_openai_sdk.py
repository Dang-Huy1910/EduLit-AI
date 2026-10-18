"""OpenAI SDK integration tests using httpx.MockTransport.

These tests exercise the installed openai SDK. They never call the real network.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.ai.adapters import (
    AiInvalidOutputError,
    AiRefusalError,
    AiTimeoutError,
    AiUnavailableError,
    OpenAiAdapter,
)
from app.ai.schemas import SocraticOutput


class DummyOutput(BaseModel):
    message: str
    score: int = Field(..., ge=0, le=10)


def _response_payload(
    *,
    text: str,
    model: str = "gpt-4o-mini",
    status: str = "completed",
    refusal: str | None = None,
    incomplete_reason: str | None = None,
) -> dict[str, Any]:
    if refusal is not None:
        content: list[dict[str, Any]] = [{"type": "refusal", "refusal": refusal}]
    else:
        content = [{"type": "output_text", "text": text, "annotations": []}]
    payload: dict[str, Any] = {
        "id": "resp_test",
        "object": "response",
        "created_at": 1_700_000_000,
        "status": status,
        "error": None,
        "incomplete_details": {"reason": incomplete_reason} if incomplete_reason else None,
        "model": model,
        "output": [
            {
                "id": "msg_test",
                "type": "message",
                "role": "assistant",
                "status": "completed",
                "content": content,
            }
        ],
        "parallel_tool_calls": True,
        "tool_choice": "auto",
        "tools": [],
        "usage": {
            "input_tokens": 11,
            "output_tokens": 7,
            "total_tokens": 18,
            "input_tokens_details": {"cached_tokens": 0},
            "output_tokens_details": {"reasoning_tokens": 0},
        },
    }
    return payload


def _adapter(handler, model: str = "gpt-4o-mini") -> OpenAiAdapter:
    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport)
    client = AsyncOpenAI(
        api_key="sk-test-not-real",
        http_client=http_client,
        max_retries=0,
        base_url="https://api.openai.com/v1",
    )
    return OpenAiAdapter(client=client, model=model, timeout_seconds=5.0, max_retries=0)


@pytest.mark.asyncio
async def test_sdk_create_succeeds_and_uses_configured_model() -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["body"] = json.loads(request.content)
        body_text = json.dumps(
            {"message": "Em đang nghĩ gì về luận điểm trung tâm?", "suggested_state": "THESIS", "sources": []},
            ensure_ascii=False,
        )
        return httpx.Response(200, json=_response_payload(text=body_text, model="gpt-4o-mini"))

    adapter = _adapter(handler, model="gpt-4o-mini")
    try:
        result = await adapter.generate(
            prompt="user",
            system_prompt="sys",
            structured_output=SocraticOutput,
            max_tokens=256,
        )
        assert isinstance(result.content, SocraticOutput)
        assert "luận điểm" in result.content.message
        assert captured["body"]["model"] == "gpt-4o-mini"
        assert "response_format" not in captured["body"]
        assert captured["body"]["max_output_tokens"] == 256
        assert "temperature" not in captured["body"]
        fmt = captured["body"]["text"]["format"]
        assert fmt["type"] == "json_schema"
        assert "enum" in json.dumps(fmt["schema"])
        assert "/responses" in captured["url"]
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_sdk_rejects_legacy_response_format_kwarg() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_response_payload(text="{}"))

    adapter = _adapter(handler)
    try:
        with pytest.raises(TypeError):
            await adapter.client.responses.create(
                model="gpt-4o-mini",
                input="hi",
                response_format={"type": "json_schema"},
            )
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_sdk_timeout_maps_to_ai_timeout() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("simulated timeout")

    adapter = _adapter(handler)
    try:
        with pytest.raises(AiTimeoutError):
            await adapter.generate("hello")
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_sdk_rate_limit_maps_to_unavailable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            429,
            json={"error": {"message": "rate limit", "type": "rate_limit_error"}},
            headers={"x-request-id": "req_1"},
        )

    adapter = _adapter(handler)
    try:
        with pytest.raises(AiUnavailableError) as exc:
            await adapter.generate("hello")
        assert exc.value.code == "AI_UNAVAILABLE"
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_sdk_refusal_maps_to_ai_refusal() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_response_payload(text="", refusal="I cannot help with that"))

    adapter = _adapter(handler)
    try:
        with pytest.raises(AiRefusalError):
            await adapter.generate("hello")
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_sdk_incomplete_maps_to_invalid_output() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json=_response_payload(
                text="partial",
                status="incomplete",
                incomplete_reason="max_output_tokens",
            ),
        )

    adapter = _adapter(handler)
    try:
        with pytest.raises(AiInvalidOutputError):
            await adapter.generate("hello")
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_sdk_provider_500_maps_to_unavailable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": {"message": "internal"}})

    adapter = _adapter(handler)
    try:
        with pytest.raises(AiUnavailableError):
            await adapter.generate("hello")
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_structured_output_invalid_json_is_invalid_output() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_response_payload(text="not-json"))

    adapter = _adapter(handler)
    try:
        with pytest.raises(AiInvalidOutputError):
            await adapter.generate("hello", structured_output=DummyOutput)
    finally:
        await adapter.close()
