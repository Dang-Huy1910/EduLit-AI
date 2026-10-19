"""Typed AI output schemas for Socratic structured parsing."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator


SOCRATIC_OUTPUT_SCHEMA_VERSION = "socratic_output.v1"
SOCRATIC_OUTLINE_INIT_SCHEMA_VERSION = "socratic_outline_init.v1"
OCR_PAGE_SCHEMA_VERSION = "ocr_page.v1"

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


class OutlineSourceInit(SourceReference):
    """Source citation on the one-shot outline-init payload."""


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


DOCUMENT_ANALYSIS_SCHEMA_VERSION = "document_analysis.v1"
DOCUMENT_EXTRACT_MARKER = "TÀI LIỆU MARKDOWN:"


class DocumentConstraint(BaseModel):
    kind: Literal["genre", "length", "audience", "evidence", "compare", "other"] = "other"
    text: str = Field(..., min_length=1, max_length=500)
    missing: bool = False


class ExtractedMaterial(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=255)
    author: str = Field(default="", max_length=255)
    source_info: str = Field(default="", max_length=4000)
    content: str = Field(default="", max_length=80_000)
    warnings: list[str] = Field(default_factory=list)


class ExtractedPrompt(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=255)
    writing_task: str = Field(default="", max_length=80_000)
    writing_task_summary: str = Field(default="", max_length=2000)
    extra_guidance: str = Field(default="", max_length=8000)
    genre: Literal["NLVH", "NLXH"] = "NLVH"
    grade_level: int = 11
    constraints: list[DocumentConstraint] = Field(default_factory=list)
    linked_material_ids: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    @field_validator("grade_level", mode="before")
    @classmethod
    def _grade(cls, value: object) -> int:
        try:
            grade = int(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 11
        return grade if grade in {10, 11, 12} else 11


class ExtractedRubricLevel(BaseModel):
    score: float
    descriptor: str = ""


class ExtractedRubricCriterion(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=255)
    weight: float
    guide_note: str = Field(default="", max_length=4000)
    levels: list[ExtractedRubricLevel] = Field(default_factory=list)
    required_elements: list[str] = Field(default_factory=list)
    penalty_per_error: float | None = None
    anti_patterns: list[str] = Field(default_factory=list)
    ambiguous: bool = False


class ExtractedRubric(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=255)
    short_title: str = Field(default="", max_length=128)
    description: str = Field(default="", max_length=4000)
    max_score: float
    score_step: float = 0.25
    grade_level: int = 11
    criteria: list[ExtractedRubricCriterion] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    ambiguous: bool = False


class DocumentAnalysisResult(BaseModel):
    """Structured extract of an imported teacher document. Not a Socratic turn."""

    document_kind: Literal["MATERIAL", "PROMPT", "RUBRIC", "MIXED"] = "MIXED"
    materials: list[ExtractedMaterial] = Field(default_factory=list)
    prompts: list[ExtractedPrompt] = Field(default_factory=list)
    rubrics: list[ExtractedRubric] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)

    @field_validator("materials", "prompts", "rubrics", "warnings", "missing", mode="before")
    @classmethod
    def _coerce_lists(cls, value: object) -> object:
        return value or []


class OcrSegmentModel(BaseModel):
    """One ordered line or paragraph transcribed from a handwritten page."""

    order: int = Field(..., ge=1)
    text: str = Field(default="")
    needs_review: bool = False
    review_reason: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)

    @field_validator("confidence", mode="before")
    @classmethod
    def _no_fake_confidence(cls, value: object) -> object:
        if value == "" or value is False:
            return None
        return value

    @field_validator("review_reason", mode="before")
    @classmethod
    def _empty_reason(cls, value: object) -> object:
        if value == "":
            return None
        return value


ASSESSMENT_OUTPUT_SCHEMA_VERSION = "assessment_output.v1"
CLASS_INSIGHT_SCHEMA_VERSION = "class_insight.v1"
ISSUE_CODE_RE = re.compile(r"^[A-Z][A-Z0-9_]{1,62}$")


class AssessmentIssueModel(BaseModel):
    """One error or omission. `located` needs real segment ids; `missing` does not."""

    code: str = Field(..., min_length=2, max_length=64)
    kind: Literal["located", "missing"] = "located"
    message: str = Field(..., min_length=1, max_length=500)
    segment_ids: list[str] = Field(default_factory=list)

    @field_validator("code")
    @classmethod
    def _code(cls, value: str) -> str:
        text = (value or "").strip().upper().replace("-", "_").replace(" ", "_")
        if not ISSUE_CODE_RE.match(text):
            raise ValueError("issue code must be stable UPPER_SNAKE")
        return text

    @field_validator("segment_ids", mode="before")
    @classmethod
    def _seg_ids(cls, value: object) -> object:
        return value or []


class AssessmentCriterionModel(BaseModel):
    criterion_id: str = Field(..., min_length=1, max_length=64)
    awarded_score: float
    comment: str = Field(default="", max_length=4000)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    missing_elements: list[str] = Field(default_factory=list)
    issues: list[AssessmentIssueModel] = Field(default_factory=list)
    evidence_segment_ids: list[str] = Field(default_factory=list)

    @field_validator(
        "strengths", "weaknesses", "missing_elements", "issues", "evidence_segment_ids", mode="before"
    )
    @classmethod
    def _lists(cls, value: object) -> object:
        return value or []


class AssessmentOutput(BaseModel):
    """Structured rubric scoring. Server recomputes the total from criteria."""

    criteria: list[AssessmentCriterionModel] = Field(default_factory=list)
    overall_comment: str = Field(..., min_length=1, max_length=4000)
    improvement_guidance: list[str] = Field(default_factory=list)

    @field_validator("criteria", "improvement_guidance", mode="before")
    @classmethod
    def _coerce(cls, value: object) -> object:
        return value or []


class InsightPriorityModel(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    evidence: str = Field(..., min_length=1, max_length=1000)
    suggested_activities: list[str] = Field(default_factory=list)

    @field_validator("suggested_activities", mode="before")
    @classmethod
    def _acts(cls, value: object) -> object:
        return value or []


class ClassInsightOutput(BaseModel):
    priorities: list[InsightPriorityModel] = Field(default_factory=list)
    notes: str = Field(default="", max_length=4000)

    @field_validator("priorities", mode="before")
    @classmethod
    def _pri(cls, value: object) -> object:
        return value or []


class OcrPageModel(BaseModel):
    """Structured OCR for a single handwritten page."""

    segments: list[OcrSegmentModel] = Field(default_factory=list)
    needs_review: bool = False
    review_reason: str | None = None

    @field_validator("segments", mode="before")
    @classmethod
    def _coerce_segments(cls, value: object) -> object:
        return value or []

    @field_validator("review_reason", mode="before")
    @classmethod
    def _empty_page_reason(cls, value: object) -> object:
        if value == "":
            return None
        return value
