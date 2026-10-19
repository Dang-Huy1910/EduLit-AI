"""One-shot initial outline generation. Separate from conversation turns."""

from __future__ import annotations

import logging
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.ai.adapters import (
    AiConfigurationError,
    AiError,
    AiInvalidOutputError,
    AiPort,
    AiRefusalError,
    AiTimeoutError,
    AiUnavailableError,
)
from app.ai.prompt_assets import PromptAsset
from app.ai.schemas import (
    OutlineSourceInit,
    SOCRATIC_OUTLINE_INIT_SCHEMA_VERSION,
    SocraticOutlineInit,
)
from app.workflows.guardrails import (
    build_source_alias_map,
    compact_log_reason,
    format_aliased_chunks,
    materialize_init_sources,
    normalize_outline_source_ids,
    resolve_source_id,
    source_alias_init_retry_hint,
    validate_response,
    validate_sources,
    validate_structured_outline,
)
from app.workflows.outline_ops import (
    assignment_has_essential_context,
    empty_outline,
    normalize_outline_content,
    validate_init_points,
)
from app.workflows.socratic_graph import (
    MAX_CHUNK_CHARS,
    MAX_MODEL_ATTEMPTS,
    UNTRUSTED_MATERIAL_BANNER,
    _dump_untrusted,
    _sources_as_dicts,
    _truncate,
)

logger = logging.getLogger("edulit.socratic_outline_init")

CLARIFICATION_MESSAGE = (
    "Để soạn dàn ý sát đề, thầy/cô cần đề bài, yêu cầu và ngữ liệu rõ hơn. "
    "Em có thể cho biết đề đang hỏi điều gì và ngữ liệu chính là gì không?"
)


class OutlineInitResult(BaseModel):
    status: Literal["COMPLETED", "NEEDS_CLARIFICATION", "FAILED"]
    message: str
    content: dict[str, Any] | None = None
    sources: list[dict] = Field(default_factory=list)
    prompt_version: str = ""
    prompt_hash: str = ""
    schema_version: str = SOCRATIC_OUTLINE_INIT_SCHEMA_VERSION
    model: str = ""
    needs_clarification: bool = False


def _build_init_system_prompt(
    template: str,
    *,
    instructions: dict[str, Any],
    rubric: dict[str, Any],
    context_chunks: list[dict],
    alias_map,
) -> str:
    chunks_text = format_aliased_chunks(
        context_chunks, alias_map, truncate=_truncate, per_chunk_chars=800
    )
    chunks_text = _truncate(chunks_text, MAX_CHUNK_CHARS)
    parts = [template.strip()]
    parts.append("\n\nNHIỆM VỤ: Tạo dàn ý ban đầu. Không hội thoại chỉnh sửa.")
    aliases = ", ".join(alias_map.aliases) or "(không có)"
    parts.append(
        "\n\nALIAS NGUỒN: Khi điền sources[].chunk_id và source_chunk_id, "
        f"sao chép đúng một trong các alias: {aliases}. "
        "Chỉ chọn ID nguồn; hệ thống lấy trích đoạn nguyên văn từ đúng chunk. "
        "Không bịa quote, không dùng UUID, không rút gọn thành chunk_2. "
        "Không đổi id ý (body-1) hay section_id (intro/body/conclusion)."
    )
    if instructions:
        parts.append(_dump_untrusted(f"{UNTRUSTED_MATERIAL_BANNER} INSTRUCTIONS", instructions))
    parts.append(_dump_untrusted(f"{UNTRUSTED_MATERIAL_BANNER} RUBRIC", rubric or {}))
    parts.append(_dump_untrusted(f"{UNTRUSTED_MATERIAL_BANNER} CHUNKS", chunks_text or "(none)"))
    return "".join(parts)


def _normalize_init_output(
    output: SocraticOutlineInit,
    alias_map,
    context_chunks: list[dict],
) -> str:
    """Map aliases to full IDs and fill quotes from the matching chunk.

    Does not touch point.id. Fabricated quotes are dropped; the stored
    quote is always a verbatim excerpt of the cited chunk.
    """
    materialized, err = materialize_init_sources(
        output.sources, alias_map, context_chunks
    )
    if err:
        return err
    output.sources = [
        OutlineSourceInit(chunk_id=item.chunk_id, quote=item.quote)
        for item in materialized
    ]
    for section in output.sections or []:
        for point in section.points or []:
            raw = point.source_chunk_id
            if not raw:
                continue
            full_id, err = resolve_source_id(
                alias_map, raw, field="source_chunk_id"
            )
            if err:
                return err
            point.source_chunk_id = full_id
    return ""


def _content_from_init(output: SocraticOutlineInit) -> dict[str, Any]:
    raw = {
        "thesis": output.thesis,
        "sections": [section.model_dump() for section in output.sections],
        "arguments": [arg.model_dump() for arg in output.arguments],
        "counterArguments": [],
    }
    return normalize_outline_content(raw)


def _clarification_result(
    *,
    message: str,
    prompt_asset: PromptAsset,
    ai_port: AiPort,
) -> OutlineInitResult:
    return OutlineInitResult(
        status="NEEDS_CLARIFICATION",
        message=message,
        content=None,
        sources=[],
        prompt_version=prompt_asset.version,
        prompt_hash=prompt_asset.sha256,
        schema_version=prompt_asset.schema_version or SOCRATIC_OUTLINE_INIT_SCHEMA_VERSION,
        model=ai_port.model_name,
        needs_clarification=True,
    )


async def run_outline_init(
    *,
    title: str,
    instructions: dict[str, Any],
    rubric: dict[str, Any],
    context_chunks: list[dict],
    ai_port: AiPort,
    prompt_asset: PromptAsset,
    max_output_tokens: int = 2048,
) -> OutlineInitResult:
    """Generate the first outline. At most two model calls. No fake scaffold."""
    if not assignment_has_essential_context(title, instructions, context_chunks, rubric):
        logger.info("outline_init missing essential context")
        return _clarification_result(
            message=CLARIFICATION_MESSAGE,
            prompt_asset=prompt_asset,
            ai_port=ai_port,
        )

    alias_map = build_source_alias_map(context_chunks)
    system_prompt = _build_init_system_prompt(
        prompt_asset.text,
        instructions=instructions,
        rubric=rubric,
        context_chunks=context_chunks,
        alias_map=alias_map,
    )
    user_prompt = (
        f"Đề bài: {title.strip()}\n"
        "Hãy soạn dàn ý gợi ý (mở/thân/kết, luận đề, luận điểm, gợi ý dẫn chứng). "
        "Ý ngắn, không viết đoạn văn mẫu."
    )
    retry_hint = source_alias_init_retry_hint(alias_map)

    last_error = ""
    last_stage = "generate"
    for attempt in range(MAX_MODEL_ATTEMPTS):
        prompt = user_prompt
        if attempt > 0 and last_error:
            prompt += (
                "\n\nLẦN SỬA BẮT BUỘC: Kết quả trước bị từ chối vì: "
                f"{last_error}. {retry_hint} "
                "Trả JSON đúng schema, ý ngắn, không viết hộ, nguồn phải khớp ngữ liệu."
            )
        try:
            response = await ai_port.generate(
                prompt=prompt,
                system_prompt=system_prompt,
                structured_output=SocraticOutlineInit,
                temperature=None,
                max_tokens=max_output_tokens,
            )
        except (AiUnavailableError, AiTimeoutError, AiConfigurationError):
            raise
        except (AiInvalidOutputError, AiRefusalError) as exc:
            last_error = exc.code
            last_stage = "generate"
            logger.warning(
                "outline_init validation_failed stage=%s attempt=%s reason=%s",
                last_stage,
                attempt + 1,
                compact_log_reason(exc.code),
            )
            continue
        except AiError:
            raise

        output = response.content
        if not isinstance(output, SocraticOutlineInit):
            last_error = "AI_INVALID_OUTPUT"
            last_stage = "parse"
            logger.warning(
                "outline_init validation_failed stage=%s attempt=%s reason=%s",
                last_stage,
                attempt + 1,
                last_error,
            )
            continue

        if output.needs_clarification:
            question = (output.clarification_question or output.message or CLARIFICATION_MESSAGE).strip()
            return _clarification_result(
                message=question,
                prompt_asset=prompt_asset,
                ai_port=ai_port,
            )

        norm_err = _normalize_init_output(output, alias_map, context_chunks)
        if norm_err:
            last_error = norm_err
            last_stage = "normalize_sources"
            logger.warning(
                "outline_init validation_failed stage=%s attempt=%s reason=%s",
                last_stage,
                attempt + 1,
                compact_log_reason(norm_err),
            )
            continue

        ok, err = validate_response(output.message, task="outline_init")
        if not ok:
            last_error = err
            last_stage = "validate_response"
            logger.warning(
                "outline_init validation_failed stage=%s attempt=%s reason=%s",
                last_stage,
                attempt + 1,
                compact_log_reason(err),
            )
            continue
        src_ok, src_err = validate_sources(output.sources, context_chunks)
        if not src_ok:
            last_error = src_err
            last_stage = "validate_sources"
            logger.warning(
                "outline_init validation_failed stage=%s attempt=%s reason=%s",
                last_stage,
                attempt + 1,
                compact_log_reason(src_err),
            )
            continue

        content = _content_from_init(output)
        content_norm_err = normalize_outline_source_ids(content, alias_map)
        if content_norm_err:
            last_error = content_norm_err
            last_stage = "normalize_outline"
            logger.warning(
                "outline_init validation_failed stage=%s attempt=%s reason=%s",
                last_stage,
                attempt + 1,
                compact_log_reason(content_norm_err),
            )
            continue
        points_ok, points_err = validate_init_points(content)
        if not points_ok:
            last_error = points_err
            last_stage = "validate_init_points"
            logger.warning(
                "outline_init validation_failed stage=%s attempt=%s reason=%s",
                last_stage,
                attempt + 1,
                compact_log_reason(points_err),
            )
            continue
        structured_ok, structured_err = validate_structured_outline(content, context_chunks)
        if not structured_ok:
            last_error = structured_err
            last_stage = "validate_structured_outline"
            logger.warning(
                "outline_init validation_failed stage=%s attempt=%s reason=%s",
                last_stage,
                attempt + 1,
                compact_log_reason(structured_err),
            )
            continue

        return OutlineInitResult(
            status="COMPLETED",
            message=output.message,
            content=content,
            sources=_sources_as_dicts(output.sources),
            prompt_version=prompt_asset.version,
            prompt_hash=prompt_asset.sha256,
            schema_version=prompt_asset.schema_version or SOCRATIC_OUTLINE_INIT_SCHEMA_VERSION,
            model=ai_port.model_name,
            needs_clarification=False,
        )

    logger.warning(
        "outline_init failed after retries stage=%s attempts=%s reason=%s",
        last_stage,
        MAX_MODEL_ATTEMPTS,
        compact_log_reason(last_error),
    )
    raise AiInvalidOutputError(last_error or "Outline init output invalid")


DEFAULT_EMPTY_OUTLINE = empty_outline()
