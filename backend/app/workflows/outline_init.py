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
from app.ai.schemas import SOCRATIC_OUTLINE_INIT_SCHEMA_VERSION, SocraticOutlineInit
from app.workflows.guardrails import (
    context_chunk_id,
    validate_response,
    validate_sources,
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
) -> str:
    chunks_text = "\n\n".join(
        f"[{context_chunk_id(c, i)}]: {_truncate(str(c.get('text') or c.get('content') or ''), 800)}"
        for i, c in enumerate(context_chunks)
    )
    chunks_text = _truncate(chunks_text, MAX_CHUNK_CHARS)
    parts = [template.strip()]
    parts.append("\n\nNHIỆM VỤ: Tạo dàn ý ban đầu. Không hội thoại chỉnh sửa.")
    if instructions:
        parts.append(_dump_untrusted(f"{UNTRUSTED_MATERIAL_BANNER} INSTRUCTIONS", instructions))
    parts.append(_dump_untrusted(f"{UNTRUSTED_MATERIAL_BANNER} RUBRIC", rubric or {}))
    parts.append(_dump_untrusted(f"{UNTRUSTED_MATERIAL_BANNER} CHUNKS", chunks_text or "(none)"))
    return "".join(parts)


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

    system_prompt = _build_init_system_prompt(
        prompt_asset.text,
        instructions=instructions,
        rubric=rubric,
        context_chunks=context_chunks,
    )
    user_prompt = (
        f"Đề bài: {title.strip()}\n"
        "Hãy soạn dàn ý gợi ý (mở/thân/kết, luận đề, luận điểm, gợi ý dẫn chứng). "
        "Ý ngắn, không viết đoạn văn mẫu."
    )

    last_error = ""
    for attempt in range(MAX_MODEL_ATTEMPTS):
        prompt = user_prompt
        if attempt > 0 and last_error:
            prompt += (
                "\n\nLẦN SỬA BẮT BUỘC: Kết quả trước bị từ chối vì: "
                f"{last_error}. "
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
            logger.warning("outline_init content_error attempt=%s code=%s", attempt, exc.code)
            continue
        except AiError:
            raise

        output = response.content
        if not isinstance(output, SocraticOutlineInit):
            last_error = "AI_INVALID_OUTPUT"
            continue

        if output.needs_clarification:
            question = (output.clarification_question or output.message or CLARIFICATION_MESSAGE).strip()
            return _clarification_result(
                message=question,
                prompt_asset=prompt_asset,
                ai_port=ai_port,
            )

        ok, err = validate_response(output.message, task="outline_init")
        if not ok:
            last_error = err
            continue
        src_ok, src_err = validate_sources(output.sources, context_chunks)
        if not src_ok:
            last_error = src_err
            continue

        content = _content_from_init(output)
        points_ok, points_err = validate_init_points(content)
        if not points_ok:
            last_error = points_err
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

    logger.warning("outline_init failed after retries last_error=%s", last_error)
    raise AiInvalidOutputError(last_error or "Outline init output invalid")


DEFAULT_EMPTY_OUTLINE = empty_outline()
