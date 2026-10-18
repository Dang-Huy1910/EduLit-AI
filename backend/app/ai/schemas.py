"""Typed AI output schemas for Socratic structured parsing."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


SOCRATIC_OUTPUT_SCHEMA_VERSION = "socratic_output.v1"


class SourceReference(BaseModel):
    """A citation into teacher-provided course material.

    Both fields are required. Missing IDs or free-form dicts are rejected.
    """

    chunk_id: str = Field(..., min_length=1, description="ID of an allowed context chunk")
    quote: str = Field(..., min_length=1, description="Verbatim quote from that chunk")


class SocraticOutput(BaseModel):
    """Structured output from a Socratic turn."""

    message: str = Field(
        ...,
        description="AI response (max 4 sentences, ends with a question, no sample writing)",
    )
    suggested_state: Literal["THESIS", "OUTLINE", "REVIEW"] = Field(
        ...,
        description="Suggested next FSM state",
    )
    sources: list[SourceReference] = Field(
        default_factory=list,
        description="Source references into provided context chunks",
    )
