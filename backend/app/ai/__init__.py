"""AI module for EduLit-AI."""

from app.ai.adapters import (
    AiConfigurationError,
    AiError,
    AiInvalidOutputError,
    AiPort,
    AiRefusalError,
    AiResponse,
    AiTimeoutError,
    AiUnavailableError,
    FakeAiAdapter,
    GeminiAdapter,
    OpenAiAdapter,
    create_ai_adapter,
    validate_structured_output,
)
from app.ai.prompt_assets import PromptAsset, PromptAssetError, load_socratic_prompt
from app.ai.schemas import SOCRATIC_OUTPUT_SCHEMA_VERSION, SourceReference, SocraticOutput

__all__ = [
    "AiConfigurationError",
    "AiError",
    "AiInvalidOutputError",
    "AiPort",
    "AiRefusalError",
    "AiResponse",
    "AiTimeoutError",
    "AiUnavailableError",
    "FakeAiAdapter",
    "GeminiAdapter",
    "OpenAiAdapter",
    "PromptAsset",
    "PromptAssetError",
    "SOCRATIC_OUTPUT_SCHEMA_VERSION",
    "SourceReference",
    "SocraticOutput",
    "create_ai_adapter",
    "load_socratic_prompt",
    "validate_structured_output",
]
