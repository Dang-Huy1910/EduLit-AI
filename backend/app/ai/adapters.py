"""AI Provider Adapters.

OpenAI uses the Responses API via the installed SDK (openai 1.x) with
`responses.parse` / `text_format` for Pydantic structured output.
Infrastructure retries are owned by the SDK (`max_retries` on the client).
The adapter maps errors and does not add a second retry loop.
"""

from __future__ import annotations

import base64
import json
import logging
import re
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Sequence, TypeVar

import httpx
from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AsyncOpenAI,
    ContentFilterFinishReasonError,
    LengthFinishReasonError,
    RateLimitError,
)
from pydantic import BaseModel, ValidationError

from app.ai.fake_document_extract import fake_document_analysis_json
from app.ai.schemas import DocumentAnalysisResult, OcrPageModel, SocraticOutlineInit
from app.config import Settings, get_settings

logger = logging.getLogger("edulit.ai")

OutputT = TypeVar("OutputT", bound=BaseModel)


@dataclass(frozen=True)
class ImagePart:
    """In-memory image for a vision request. Never logged."""

    data: bytes
    mime_type: str = "image/jpeg"


# ─────────────────────────────────────────────────────────────────────────────
# Output Types
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class AiUsage:
    """Token usage from an AI call."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


@dataclass
class AiResponse:
    """Generic AI response wrapper."""

    content: str | BaseModel
    raw: dict[str, Any] | None = None
    usage: AiUsage | None = None
    latency_ms: int = 0


class AiError(Exception):
    """Base exception for AI errors."""

    def __init__(self, message: str, code: str = "AI_ERROR"):
        self.message = message
        self.code = code
        super().__init__(message)


class AiTimeoutError(AiError):
    """AI provider timed out."""

    def __init__(self, message: str = "AI request timed out"):
        super().__init__(message, "AI_TIMEOUT")


class AiUnavailableError(AiError):
    """AI provider is unavailable or returned an infrastructure error."""

    def __init__(self, message: str = "AI provider unavailable"):
        super().__init__(message, "AI_UNAVAILABLE")


class AiRefusalError(AiError):
    """AI refused to generate output (safety/content policy)."""

    def __init__(self, message: str = "AI refused to generate output"):
        super().__init__(message, "AI_REFUSAL")


class AiInvalidOutputError(AiError):
    """AI output does not match expected schema or was incomplete."""

    def __init__(self, message: str = "AI output validation failed"):
        super().__init__(message, "AI_INVALID_OUTPUT")


class AiConfigurationError(Exception):
    """Raised when AI configuration is invalid."""

    def __init__(self, provider: str, reason: str):
        self.provider = provider
        self.reason = reason
        super().__init__(f"AI configuration error for provider '{provider}': {reason}")


# ─────────────────────────────────────────────────────────────────────────────
# Adapter Interface
# ─────────────────────────────────────────────────────────────────────────────


class AiPort(ABC):
    """Port interface for AI providers."""

    @property
    @abstractmethod
    def provider_name(self) -> str: ...

    @property
    @abstractmethod
    def model_name(self) -> str: ...

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        structured_output: type[BaseModel] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AiResponse:
        """Generate a response from the AI model.

        `temperature` is omitted at the wire level when None so reasoning
        models that reject the parameter are not sent a hardcoded 0.7.
        """
        ...

    async def close(self) -> None:
        return None

    async def generate_with_images(
        self,
        prompt: str,
        images: Sequence[ImagePart],
        system_prompt: str | None = None,
        structured_output: type[BaseModel] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AiResponse:
        raise AiUnavailableError("AI adapter does not accept images")


def validate_structured_output(
    raw_text: str,
    output_type: type[OutputT],
) -> OutputT:
    """Parse and validate AI output against a Pydantic schema."""
    try:
        data = json.loads(raw_text)
        return output_type.model_validate(data)
    except (json.JSONDecodeError, ValidationError) as e:
        raise AiInvalidOutputError("Output validation failed") from e


def _usage_from_openai(usage: Any) -> AiUsage:
    result = AiUsage()
    if usage is None:
        return result
    result.prompt_tokens = int(getattr(usage, "input_tokens", 0) or 0)
    result.completion_tokens = int(getattr(usage, "output_tokens", 0) or 0)
    result.total_tokens = int(
        getattr(usage, "total_tokens", None)
        or (result.prompt_tokens + result.completion_tokens)
    )
    return result


def _safe_response_meta(response: Any) -> dict[str, Any]:
    """Metadata only — never include raw prompt or model text."""
    return {
        "id": getattr(response, "id", None),
        "model": getattr(response, "model", None),
        "status": getattr(response, "status", None),
        "incomplete_details": (
            response.incomplete_details.model_dump()
            if getattr(response, "incomplete_details", None) is not None
            else None
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# OpenAI Adapter (Responses API + SDK structured parse)
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class OpenAiAdapter(AiPort):
    """OpenAI Responses API adapter.

    Structured output uses `client.responses.parse(..., text_format=Model)`.
    The SDK converts the Pydantic model with `to_strict_json_schema` so enums,
    nested models, $ref and constraints are preserved.

    Retry of transport/5xx/429 is configured on `AsyncOpenAI(max_retries=...)`.
    This adapter does not retry again.
    """

    client: AsyncOpenAI
    model: str
    timeout_seconds: float = 30.0
    max_retries: int = 0

    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def model_name(self) -> str:
        return self.model

    async def close(self) -> None:
        await self.client.close()

    def _request_kwargs(
        self,
        *,
        prompt: str,
        system_prompt: str | None,
        temperature: float | None,
        max_tokens: int | None,
        images: Sequence[ImagePart] | None = None,
    ) -> dict[str, Any]:
        if images:
            content: list[dict[str, Any]] = [{"type": "input_text", "text": prompt}]
            for image in images:
                mime = image.mime_type or "image/jpeg"
                encoded = base64.standard_b64encode(image.data).decode("ascii")
                content.append(
                    {
                        "type": "input_image",
                        "image_url": f"data:{mime};base64,{encoded}",
                    }
                )
            payload: str | list[dict[str, Any]] = [
                {"role": "user", "content": content}
            ]
        else:
            payload = prompt
        kwargs: dict[str, Any] = {
            "model": self.model,
            "input": payload,
        }
        if system_prompt:
            kwargs["instructions"] = system_prompt
        if max_tokens is not None:
            kwargs["max_output_tokens"] = max_tokens
        if temperature is not None:
            kwargs["temperature"] = temperature
        return kwargs

    def _inspect_status(self, response: Any) -> None:
        status = getattr(response, "status", None)
        if status == "incomplete":
            details = getattr(response, "incomplete_details", None)
            reason = getattr(details, "reason", None) if details is not None else None
            if reason == "content_filter":
                raise AiRefusalError("OpenAI incomplete: content filter")
            raise AiInvalidOutputError("OpenAI response incomplete")
        if status == "failed":
            raise AiUnavailableError("OpenAI response failed")
        if getattr(response, "error", None) is not None:
            raise AiUnavailableError("OpenAI response error")

        output = getattr(response, "output", None) or []
        for item in output:
            if getattr(item, "type", None) != "message":
                continue
            for content in getattr(item, "content", None) or []:
                if getattr(content, "type", None) == "refusal":
                    raise AiRefusalError("OpenAI refused to generate output")

    def _map_sdk_error(self, exc: Exception) -> AiError:
        if isinstance(exc, AiError):
            return exc
        if isinstance(exc, (ValidationError, json.JSONDecodeError)):
            return AiInvalidOutputError("OpenAI structured output invalid")
        if isinstance(exc, (APITimeoutError, httpx.TimeoutException)):
            return AiTimeoutError("OpenAI request timed out")
        if isinstance(exc, RateLimitError):
            return AiUnavailableError("OpenAI rate limit exceeded")
        if isinstance(exc, ContentFilterFinishReasonError):
            return AiRefusalError("OpenAI content filter")
        if isinstance(exc, LengthFinishReasonError):
            return AiInvalidOutputError("OpenAI output truncated")
        if isinstance(exc, APIConnectionError):
            return AiUnavailableError("OpenAI provider unavailable")
        if isinstance(exc, APIStatusError):
            code = getattr(exc, "status_code", None)
            if code in {401, 403}:
                return AiUnavailableError("OpenAI authentication failed")
            if code == 429:
                return AiUnavailableError("OpenAI rate limit exceeded")
            if code is not None and code >= 500:
                return AiUnavailableError("OpenAI provider unavailable")
            return AiUnavailableError("OpenAI request failed")
        return AiUnavailableError("OpenAI provider unavailable")

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        structured_output: type[BaseModel] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AiResponse:
        kwargs = self._request_kwargs(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        start = time.monotonic()
        try:
            if structured_output is not None:
                response = await self.client.responses.parse(
                    **kwargs,
                    text_format=structured_output,
                )
            else:
                response = await self.client.responses.create(**kwargs)
        except AiError:
            raise
        except Exception as exc:
            mapped = self._map_sdk_error(exc)
            logger.error(
                "openai_generate_failed code=%s type=%s model=%s",
                mapped.code,
                type(exc).__name__,
                self.model,
            )
            raise mapped from exc

        latency_ms = int((time.monotonic() - start) * 1000)
        try:
            self._inspect_status(response)
        except AiError:
            logger.error(
                "openai_generate_status_error model=%s latency_ms=%s",
                self.model,
                latency_ms,
            )
            raise

        usage = _usage_from_openai(getattr(response, "usage", None))
        meta = _safe_response_meta(response)

        if structured_output is not None:
            parsed = getattr(response, "output_parsed", None)
            if parsed is None:
                raise AiInvalidOutputError("OpenAI structured output missing")
            if not isinstance(parsed, structured_output):
                try:
                    parsed = structured_output.model_validate(parsed)
                except ValidationError as exc:
                    raise AiInvalidOutputError("OpenAI structured output invalid") from exc
            logger.info(
                "openai_generate_ok model=%s latency_ms=%s tokens=%s",
                self.model,
                latency_ms,
                usage.total_tokens,
            )
            return AiResponse(content=parsed, raw=meta, usage=usage, latency_ms=latency_ms)

        output_text = getattr(response, "output_text", None) or ""
        if not str(output_text).strip():
            raise AiInvalidOutputError("Empty response from OpenAI")
        logger.info(
            "openai_generate_ok model=%s latency_ms=%s tokens=%s",
            self.model,
            latency_ms,
            usage.total_tokens,
        )
        return AiResponse(content=str(output_text), raw=meta, usage=usage, latency_ms=latency_ms)

    async def generate_with_images(
        self,
        prompt: str,
        images: Sequence[ImagePart],
        system_prompt: str | None = None,
        structured_output: type[BaseModel] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AiResponse:
        if not images:
            raise AiInvalidOutputError("OCR request missing images")
        kwargs = self._request_kwargs(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            images=images,
        )
        start = time.monotonic()
        try:
            if structured_output is not None:
                response = await self.client.responses.parse(
                    **kwargs,
                    text_format=structured_output,
                )
            else:
                response = await self.client.responses.create(**kwargs)
        except AiError:
            raise
        except Exception as exc:
            mapped = self._map_sdk_error(exc)
            logger.error(
                "openai_vision_failed code=%s type=%s model=%s",
                mapped.code,
                type(exc).__name__,
                self.model,
            )
            raise mapped from exc

        latency_ms = int((time.monotonic() - start) * 1000)
        try:
            self._inspect_status(response)
        except AiError:
            logger.error(
                "openai_vision_status_error model=%s latency_ms=%s",
                self.model,
                latency_ms,
            )
            raise

        usage = _usage_from_openai(getattr(response, "usage", None))
        meta = _safe_response_meta(response)
        if structured_output is not None:
            parsed = getattr(response, "output_parsed", None)
            if parsed is None:
                raise AiInvalidOutputError("OpenAI structured output missing")
            if not isinstance(parsed, structured_output):
                try:
                    parsed = structured_output.model_validate(parsed)
                except ValidationError as exc:
                    raise AiInvalidOutputError("OpenAI structured output invalid") from exc
            logger.info(
                "openai_vision_ok model=%s latency_ms=%s tokens=%s images=%s",
                self.model,
                latency_ms,
                usage.total_tokens,
                len(images),
            )
            return AiResponse(content=parsed, raw=meta, usage=usage, latency_ms=latency_ms)

        output_text = getattr(response, "output_text", None) or ""
        if not str(output_text).strip():
            raise AiInvalidOutputError("Empty response from OpenAI")
        return AiResponse(content=str(output_text), raw=meta, usage=usage, latency_ms=latency_ms)


# ─────────────────────────────────────────────────────────────────────────────
# Gemini Adapter
# ─────────────────────────────────────────────────────────────────────────────

_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


@dataclass
class GeminiAdapter(AiPort):
    """Google Gemini adapter using the REST API."""

    api_key: str
    model: str
    timeout_seconds: float = 30.0
    max_retries: int = 2
    _http_client: httpx.AsyncClient | None = None

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return self.model

    @property
    def _client(self) -> httpx.AsyncClient:
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(timeout=self.timeout_seconds)
        return self._http_client

    async def close(self) -> None:
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        structured_output: type[BaseModel] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AiResponse:
        url = f"{_GEMINI_BASE_URL}/models/{self.model}:generateContent"
        params = {"key": self.api_key}
        contents = [{"parts": [{"text": prompt}]}]
        generation_config: dict[str, Any] = {"candidateCount": 1}
        if temperature is not None:
            generation_config["temperature"] = temperature
        if max_tokens:
            generation_config["maxOutputTokens"] = max_tokens
        payload: dict[str, Any] = {
            "contents": contents,
            "generationConfig": generation_config,
        }
        if system_prompt:
            payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}
        if structured_output:
            generation_config["responseSchema"] = structured_output.model_json_schema()
            generation_config["responseMimeType"] = "application/json"

        start = time.monotonic()
        try:
            response = await self._client.post(url, json=payload, params=params)
        except httpx.TimeoutException as exc:
            raise AiTimeoutError("Gemini request timed out") from exc
        except httpx.HTTPError as exc:
            raise AiUnavailableError("Gemini provider unavailable") from exc

        latency_ms = int((time.monotonic() - start) * 1000)
        if response.status_code == 429:
            raise AiUnavailableError("Gemini rate limit exceeded")
        if response.status_code in {401, 403}:
            raise AiUnavailableError("Gemini authentication failed")
        if response.status_code >= 500:
            raise AiUnavailableError("Gemini provider unavailable")
        if response.status_code != 200:
            raise AiUnavailableError("Gemini request failed")

        data = response.json()
        candidates = data.get("candidates", [])
        if not candidates:
            raise AiInvalidOutputError("No candidates in Gemini response")
        first = candidates[0]
        finish_reason = first.get("finishReason", "")
        if finish_reason == "MAX_TOKENS":
            raise AiInvalidOutputError("Response truncated (max tokens)")
        if finish_reason == "SAFETY":
            raise AiRefusalError("Gemini safety filter triggered")
        parts = first.get("content", {}).get("parts", [])
        if not parts:
            raise AiInvalidOutputError("No content parts in response")
        raw_text = parts[0].get("text", "")
        usage = AiUsage()
        if "usageMetadata" in data:
            um = data["usageMetadata"]
            usage.prompt_tokens = um.get("promptTokenCount", 0)
            usage.completion_tokens = um.get("candidatesTokenCount", 0)
            usage.total_tokens = um.get("totalTokenCount", 0)
        result = AiResponse(
            content=raw_text,
            raw={"status": "ok", "model": self.model},
            usage=usage,
            latency_ms=latency_ms,
        )
        if structured_output:
            result.content = validate_structured_output(raw_text, structured_output)
        return result

    async def generate_with_images(
        self,
        prompt: str,
        images: Sequence[ImagePart],
        system_prompt: str | None = None,
        structured_output: type[BaseModel] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AiResponse:
        if not images:
            raise AiInvalidOutputError("OCR request missing images")
        url = f"{_GEMINI_BASE_URL}/models/{self.model}:generateContent"
        params = {"key": self.api_key}
        parts: list[dict[str, Any]] = [{"text": prompt}]
        for image in images:
            parts.append(
                {
                    "inline_data": {
                        "mime_type": image.mime_type or "image/jpeg",
                        "data": base64.standard_b64encode(image.data).decode("ascii"),
                    }
                }
            )
        generation_config: dict[str, Any] = {"candidateCount": 1}
        if temperature is not None:
            generation_config["temperature"] = temperature
        if max_tokens:
            generation_config["maxOutputTokens"] = max_tokens
        payload: dict[str, Any] = {
            "contents": [{"parts": parts}],
            "generationConfig": generation_config,
        }
        if system_prompt:
            payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}
        if structured_output:
            generation_config["responseSchema"] = structured_output.model_json_schema()
            generation_config["responseMimeType"] = "application/json"

        start = time.monotonic()
        try:
            response = await self._client.post(url, json=payload, params=params)
        except httpx.TimeoutException as exc:
            raise AiTimeoutError("Gemini request timed out") from exc
        except httpx.HTTPError as exc:
            raise AiUnavailableError("Gemini provider unavailable") from exc

        latency_ms = int((time.monotonic() - start) * 1000)
        if response.status_code == 429:
            raise AiUnavailableError("Gemini rate limit exceeded")
        if response.status_code in {401, 403}:
            raise AiUnavailableError("Gemini authentication failed")
        if response.status_code >= 500:
            raise AiUnavailableError("Gemini provider unavailable")
        if response.status_code != 200:
            raise AiUnavailableError("Gemini request failed")

        data = response.json()
        candidates = data.get("candidates", [])
        if not candidates:
            raise AiInvalidOutputError("No candidates in Gemini response")
        first = candidates[0]
        finish_reason = first.get("finishReason", "")
        if finish_reason == "MAX_TOKENS":
            raise AiInvalidOutputError("Response truncated (max tokens)")
        if finish_reason == "SAFETY":
            raise AiRefusalError("Gemini safety filter triggered")
        parts_out = first.get("content", {}).get("parts", [])
        if not parts_out:
            raise AiInvalidOutputError("No content parts in response")
        raw_text = parts_out[0].get("text", "")
        usage = AiUsage()
        if "usageMetadata" in data:
            um = data["usageMetadata"]
            usage.prompt_tokens = um.get("promptTokenCount", 0)
            usage.completion_tokens = um.get("candidatesTokenCount", 0)
            usage.total_tokens = um.get("totalTokenCount", 0)
        result = AiResponse(
            content=raw_text,
            raw={"status": "ok", "model": self.model},
            usage=usage,
            latency_ms=latency_ms,
        )
        if structured_output:
            result.content = validate_structured_output(raw_text, structured_output)
        logger.info(
            "gemini_vision_ok model=%s latency_ms=%s tokens=%s images=%s",
            self.model,
            latency_ms,
            usage.total_tokens,
            len(images),
        )
        return result


# ─────────────────────────────────────────────────────────────────────────────
# Fake Adapter (for testing only)
# ─────────────────────────────────────────────────────────────────────────────


DEFAULT_FAKE_TURN = (
    '{"message": "Em đang nghĩ gì về ý chính của đề bài này?",'
    ' "suggested_state": "THESIS", "sources": []}'
)

_FAKE_CHUNK_LINE = re.compile(r"\[([^\]\n]+)\]:\s*([^\n]+)")


def _fake_outline_init_for_prompt(system_prompt: str | None, prompt: str) -> str:
    """Bind default fake outline citations to chunks present in the prompt."""
    blob = f"{system_prompt or ''}\n{prompt}"
    start = blob.find("CHUNKS")
    haystack = blob[start:] if start >= 0 else blob
    match = _FAKE_CHUNK_LINE.search(haystack)
    if not match:
        return DEFAULT_FAKE_OUTLINE_INIT
    chunk_id = match.group(1).strip()
    quote = match.group(2).strip()[:120]
    data = json.loads(DEFAULT_FAKE_OUTLINE_INIT)
    data["sources"] = [{"chunk_id": chunk_id, "quote": quote}]
    for section in data.get("sections") or []:
        for point in section.get("points") or []:
            if point.get("source_chunk_id"):
                point["source_chunk_id"] = chunk_id
    return json.dumps(data, ensure_ascii=False)


DEFAULT_FAKE_OUTLINE_INIT = (
    '{"message": "Đây là dàn ý gợi ý theo đề; em có thể hỏi để hiểu hoặc nhờ chỉnh sửa.",'
    ' "thesis": "Ý chí vượt khó giúp con người đứng vững trước thử thách.",'
    ' "sections": ['
    '  {"id": "intro", "title": "I. Mở bài — Đặt vấn đề",'
    '   "points": [{"id": "intro-1", "text": "Dẫn vào vấn đề ý chí vượt khó", "kind": "claim"}]},'
    '  {"id": "body", "title": "II. Thân bài — Triển khai luận điểm",'
    '   "points": ['
    '     {"id": "body-1", "text": "Luận điểm 1: Ý chí giúp vượt khó", "kind": "claim"},'
    '     {"id": "body-1e", "text": "Gợi ý dẫn chứng: ý chí vượt khó", "kind": "evidence",'
    '      "source_chunk_id": "chunk_1"}'
    "   ]},"
    '  {"id": "conclusion", "title": "III. Kết bài — Đánh giá & Thông điệp",'
    '   "points": [{"id": "conc-1", "text": "Khẳng định giá trị của bản lĩnh", "kind": "note"}]}'
    " ],"
    ' "arguments": [{"id": "arg-1", "content": "Ý chí giúp vượt khó", "position": 0}],'
    ' "needs_clarification": false,'
    ' "sources": [{"chunk_id": "chunk_1", "quote": "ý chí vượt khó"}]}'
)


@dataclass
class FakeAiAdapter(AiPort):
    """Fake AI adapter for testing only. Never calls a real provider."""

    model: str = "fake-model"
    responses: list[str] = field(default_factory=list)
    outline_responses: list[str] = field(default_factory=list)
    response_index: int = 0
    outline_response_index: int = 0
    fail_next: bool = False
    fail_with: type[Exception] | Exception = AiUnavailableError
    call_count: int = 0
    last_prompt: str = ""
    last_system_prompt: str | None = None
    last_temperature: float | None = None
    last_max_tokens: int | None = None
    last_structured_output: type[BaseModel] | None = None
    hold_before_generate: Any = None
    release_generate: Any = None

    @property
    def provider_name(self) -> str:
        return "fake"

    @property
    def model_name(self) -> str:
        return self.model

    def add_response(self, text: str) -> None:
        self.responses.append(text)

    def add_outline_response(self, text: str) -> None:
        self.outline_responses.append(text)

    def set_fail_next(self, exc: type[Exception] | Exception = AiUnavailableError) -> None:
        self.fail_next = True
        self.fail_with = exc

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        structured_output: type[BaseModel] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AiResponse:
        self.call_count += 1
        self.last_prompt = prompt
        self.last_system_prompt = system_prompt
        self.last_temperature = temperature
        self.last_max_tokens = max_tokens
        self.last_structured_output = structured_output

        if self.hold_before_generate is not None:
            self.hold_before_generate.set()
        if self.release_generate is not None:
            await self.release_generate.wait()

        if self.fail_next:
            self.fail_next = False
            exc = self.fail_with
            if isinstance(exc, type):
                raise exc("Fake failure")
            raise exc

        wants_outline = structured_output is not None and (
            structured_output is SocraticOutlineInit
            or getattr(structured_output, "__name__", "") == "SocraticOutlineInit"
        )
        wants_document = structured_output is not None and (
            structured_output is DocumentAnalysisResult
            or getattr(structured_output, "__name__", "") == "DocumentAnalysisResult"
        )
        if wants_outline:
            if self.outline_responses:
                content = self.outline_responses[
                    self.outline_response_index % len(self.outline_responses)
                ]
                self.outline_response_index += 1
            else:
                content = _fake_outline_init_for_prompt(system_prompt, prompt)
        elif wants_document and not self.responses:
            content = fake_document_analysis_json(prompt)
        elif self.responses:
            content = self.responses[self.response_index % len(self.responses)]
            self.response_index += 1
        else:
            content = DEFAULT_FAKE_TURN

        if structured_output:
            try:
                data = json.loads(content)
                parsed = structured_output.model_validate(data)
            except (json.JSONDecodeError, ValidationError) as exc:
                raise AiInvalidOutputError("Fake structured output invalid") from exc
            return AiResponse(
                content=parsed,
                raw={"fake": True, "provider": "fake", "model": self.model},
                latency_ms=5,
            )

        return AiResponse(
            content=content,
            raw={"fake": True, "provider": "fake", "model": self.model},
            latency_ms=5,
        )

    async def generate_with_images(
        self,
        prompt: str,
        images: Sequence[ImagePart],
        system_prompt: str | None = None,
        structured_output: type[BaseModel] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AiResponse:
        if structured_output is not None and (
            structured_output is OcrPageModel
            or getattr(structured_output, "__name__", "") == "OcrPageModel"
        ):
            fake = OcrPageModel.model_validate(
                {
                    "segments": [
                        {
                            "order": 1,
                            "text": "[không rõ] Ảnh chưa được gửi tới mô hình OCR thật.",
                            "needs_review": True,
                            "review_reason": "Chế độ giả lập",
                            "confidence": None,
                        }
                    ],
                    "needs_review": True,
                    "review_reason": "Chế độ giả lập không đọc ảnh thật.",
                }
            )
            self.call_count += 1
            self.last_prompt = prompt
            self.last_system_prompt = system_prompt
            self.last_structured_output = structured_output
            return AiResponse(
                content=fake,
                raw={
                    "fake": True,
                    "provider": "fake",
                    "model": self.model,
                    "images": len(images),
                },
                latency_ms=5,
            )
        return await self.generate(
            prompt,
            system_prompt=system_prompt,
            structured_output=structured_output,
            temperature=temperature,
            max_tokens=max_tokens,
        )


# ─────────────────────────────────────────────────────────────────────────────
# Adapter Factory
# ─────────────────────────────────────────────────────────────────────────────


def create_ai_adapter(
    settings: Settings | None = None,
    *,
    allow_missing_key: bool = False,
    http_client: httpx.AsyncClient | None = None,
    model_override: str | None = None,
    timeout_override: float | None = None,
) -> AiPort:
    """Create an AI adapter from Settings.

    OpenAI SDK owns transport retries (`max_retries=settings.AI_MAX_RETRIES`).
    `model_override` / `timeout_override` select a task-specific model
    (OCR) without changing Socratic defaults.
    """
    if settings is None:
        settings = get_settings()

    provider = settings.AI_PROVIDER.lower().strip()
    model = (model_override or settings.AI_MODEL or "").strip()
    timeout_seconds = (
        float(timeout_override)
        if timeout_override is not None
        else float(settings.AI_TIMEOUT_SECONDS)
    )

    if provider == "openai":
        if not settings.OPENAI_API_KEY:
            if allow_missing_key:
                logger.warning("OPENAI_API_KEY not set; using FakeAiAdapter")
                return FakeAiAdapter(model=model or "fake-model")
            raise AiConfigurationError(
                "openai",
                "OPENAI_API_KEY is required but not set.",
            )
        if not model:
            raise AiConfigurationError(
                "openai",
                "AI_MODEL is required but not set.",
            )
        client_kwargs: dict[str, Any] = {
            "api_key": settings.OPENAI_API_KEY,
            "timeout": httpx.Timeout(timeout_seconds, connect=10.0),
            "max_retries": settings.AI_MAX_RETRIES,
        }
        if http_client is not None:
            client_kwargs["http_client"] = http_client
        client = AsyncOpenAI(**client_kwargs)
        return OpenAiAdapter(
            client=client,
            model=model,
            timeout_seconds=timeout_seconds,
            max_retries=0,
        )

    if provider == "gemini":
        if not settings.GEMINI_API_KEY:
            if allow_missing_key:
                logger.warning("GEMINI_API_KEY not set; using FakeAiAdapter")
                return FakeAiAdapter(model=model or "fake-model")
            raise AiConfigurationError(
                "gemini",
                "GEMINI_API_KEY is required but not set.",
            )
        if not model:
            raise AiConfigurationError(
                "gemini",
                "AI_MODEL is required but not set.",
            )
        return GeminiAdapter(
            api_key=settings.GEMINI_API_KEY,
            model=model,
            timeout_seconds=timeout_seconds,
            max_retries=settings.AI_MAX_RETRIES,
        )

    if provider == "fake":
        return FakeAiAdapter(model=model or "fake-model")

    raise AiConfigurationError(
        provider,
        "Unknown AI_PROVIDER. Supported providers: openai, gemini, fake",
    )
