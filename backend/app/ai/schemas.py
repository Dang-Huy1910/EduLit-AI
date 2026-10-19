"""Typed AI output schemas for Socratic structured parsing."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


SOCRATIC_OUTPUT_SCHEMA_VERSION = "socratic_output.v1"
SOCRATIC_OUTLINE_INIT_SCHEMA_VERSION = "socratic_outline_init.v1"

ConversationIntent = Literal["EXPLAIN", "PROPOSE", "EDIT", "MIXED", "CLARIFY"]
OutlinePointKind = Literal["claim", "evidence", "note"]
OutlineOpType = Literal["add", "update", "delete"]
OutlineSectionId = Literal["intro", "body", "conclusion"]


class SourceReference(BaseModel):
    """A citation into teacher-provided course material.

    Both fields are required. Missing IDs or free-form dicts are rejected.
    """

    chunk_id: str = Field(..., min_length=1, description="ID of an allowed context chunk")
    quote: str = Field(..., min_length=1, description="Verbatim quote from that chunk")


class OutlinePoint(BaseModel):
    """A short outline bullet. Never a sample paragraph."""

    id: str = Field(..., min_length=1, max_length=64)
    text: str = Field(..., min_length=1, max_length=280)
    kind: OutlinePointKind = "claim"
    source_chunk_id: str | None = None


class OutlineSectionModel(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=200)
    points: list[OutlinePoint] = Field(default_factory=list)
    content: str | None = None


class OutlineArgument(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    content: str = Field(..., min_length=1, max_length=280)
    position: int = 0


class OutlineOp(BaseModel):
    """A single constrained outline mutation. The model never writes the DB.

    Completeness is enforced by the application layer so a partial op becomes
    CLARIFY instead of failing the whole structured parse.
    """

    op: OutlineOpType
    target_id: str | None = Field(
        default=None, description="Point id for update/delete"
    )
    section_id: str | None = Field(
        default=None, description="Section id for add, or to disambiguate"
    )
    text: str | None = Field(default=None, max_length=280)
    kind: OutlinePointKind | None = None
    after_point_id: str | None = None


class OutlineProposal(BaseModel):
    """A suggested bullet the student must accept before it is stored."""

    section_id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1, max_length=280)
    kind: OutlinePointKind = "claim"
    source_chunk_id: str | None = None


class SocraticOutput(BaseModel):
    """Structured output from a Socratic conversation turn.

    Extra fields are optional so older fixtures and adapters keep parsing.
    """

    message: str = Field(
        ...,
        description="AI response for the current intent (no sample essay)",
    )
    suggested_state: Literal["THESIS", "OUTLINE", "REVIEW"] = Field(
        ...,
        description="Suggested next FSM state",
    )
    sources: list[SourceReference] = Field(
        default_factory=list,
        description="Source references into provided context chunks",
    )
    intent: ConversationIntent | None = Field(
        default=None,
        description="EXPLAIN | PROPOSE | EDIT | MIXED | CLARIFY",
    )
    outline_ops: list[OutlineOp] = Field(
        default_factory=list,
        description="Constrained outline mutations. Applied only for EDIT/MIXED.",
    )
    proposals: list[OutlineProposal] = Field(
        default_factory=list,
        description="Suggestions shown with an add-to-outline control. Not auto-applied.",
    )

    @field_validator("outline_ops", mode="before")
    @classmethod
    def _coerce_ops(cls, value: object) -> object:
        return value or []

    @field_validator("proposals", mode="before")
    @classmethod
    def _coerce_proposals(cls, value: object) -> object:
        return value or []


class SocraticOutlineInit(BaseModel):
    """Structured output for the one-time initial outline generation."""

    message: str = Field(
        ...,
        description="Short welcome or clarification. Not a sample essay.",
    )
    thesis: str = Field(default="", max_length=280)
    sections: list[OutlineSectionModel] = Field(default_factory=list)
    arguments: list[OutlineArgument] = Field(default_factory=list)
    needs_clarification: bool = False
    clarification_question: str | None = None
    sources: list[SourceReference] = Field(default_factory=list)

    @field_validator("sections", mode="before")
    @classmethod
    def _coerce_sections(cls, value: object) -> object:
        return value or []
