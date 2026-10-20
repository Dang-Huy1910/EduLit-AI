"""Student writing profile: published work in, one AI synthesis out, cached.

GET never calls the model. The refresh path re-reads the eligible published
results, reuses the cache when `source_hash` is unchanged, and replaces the
cache only after the model output passes verbatim-evidence validation.

Only papers the teacher already published are used: results pointed by
`Submission.current_published_result_id`, still published, still granted to the
student, with the transcription copy the result was graded on. There is no
knowledge base, no RAG, no worker and no grading side effect.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import unicodedata
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import (
    AiConfigurationError,
    AiError,
    AiInvalidOutputError,
    AiPort,
    create_ai_adapter,
)
from app.ai.prompt_assets import PromptAssetError, load_prompt_asset
from app.ai.schemas import WRITING_PROFILE_SCHEMA_VERSION, WritingProfileOutput
from app.config import Settings, get_settings
from app.core.errors import ERROR_MESSAGES, ApiHttpException
from app.core.http import utcnow
from app.db.models import (
    AssessmentResult,
    Assignment,
    AssignmentAccess,
    AssignmentRevision,
    ClassMembership,
    Classroom,
    Submission,
    TranscriptionRevision,
    TranscriptionRevisionStatus,
    User,
    UserRole,
    WritingProfile,
)

logger = logging.getLogger("edulit.writing_profile")

# ── The eight expression groups of the prototype ─────────────────────────────
TRAITS: tuple[tuple[str, str], ...] = (
    ("WORD_CHOICE", "Lựa chọn từ ngữ & Vốn từ"),
    ("SENTENCE_RHYTHM", "Nhịp câu & Giọng điệu"),
    ("SENTENCE_STRUCTURE", "Cấu trúc câu đa tầng"),
    ("ARGUMENT_ORGANIZATION", "Tổ chức luận điểm"),
    ("COHESION", "Mạch lạc & Tính toàn vẹn"),
    ("EVIDENCE_LINKING", "Nối & Phân tích dẫn chứng"),
    ("TRANSITIONS", "Chuyển ý & Liên kết đoạn"),
    ("PARAGRAPH_UNITY", "Tính trọn vẹn của đoạn"),
)
TRAIT_NAMES = dict(TRAITS)

LEVEL_LABELS: dict[str, str] = {
    "INSUFFICIENT": "Chưa đủ dữ liệu",
    "EMERGING": "Bước đầu hình thành",
    "CONSISTENT": "Đã ổn định",
    "STRONG": "Nổi bật, thành thạo",
}
KIND_LABELS: dict[str, str] = {
    "STRENGTH": "Điểm mạnh",
    "WEAKNESS": "Điểm cần rèn",
    "STYLE": "Đặc trưng diễn đạt",
}
GENRE_LABELS: dict[str, str] = {
    "nghi_luan_van_hoc": "Nghị luận văn học",
    "NLVH": "Nghị luận văn học",
    "nghi_luan_xa_hoi": "Nghị luận xã hội",
    "NLXH": "Nghị luận xã hội",
}
GENRE_KINDS: dict[str, str] = {
    "nghi_luan_van_hoc": "NLVH",
    "NLVH": "NLVH",
    "nghi_luan_xa_hoi": "NLXH",
    "NLXH": "NLXH",
}

AI_LABEL = "AI nhận xét"
PUBLISHED_LABEL = "Nhận xét đã công bố"

NOTICE_EMPTY = (
    "Em chưa có bài viết nào được công bố kết quả. Hồ sơ văn phong chỉ tổng hợp "
    "từ bài đã được giáo viên công bố, nên hiện chưa có gì để phân tích."
)
NOTICE_NOT_ANALYZED = (
    "Hồ sơ chưa được tổng hợp. Em bấm “Cập nhật hồ sơ” để hệ thống phân tích "
    "các bài đã công bố."
)
NOTICE_STALE = (
    "Kết quả công bố đang xem đã thay đổi nên nội dung hồ sơ cũ không còn dùng "
    "được. Em bấm “Cập nhật hồ sơ” để tổng hợp lại."
)
NOTICE_INSUFFICIENT = (
    "Chưa đủ căn cứ trích dẫn trong các bài đã công bố để tổng hợp hồ sơ."
)

STATUS_EMPTY = "empty"
STATUS_NOT_ANALYZED = "not_analyzed"
STATUS_READY = "ready"
STATUS_STALE = "stale"

MIN_QUOTE_CHARS = 8
MIN_PAGE_CHARS = 600
MIN_PAGE_CHARS_FLOOR = 200
MAX_COMMENT_CHARS = 1200
DRAFT_TX = TranscriptionRevisionStatus.DRAFT.value

_WHITESPACE_RE = re.compile(r"\s+")
_QUOTE_MARKS = "\"'“”‘’«»"
# Wrapping quotation marks and leading/trailing ellipses around a model quote.
_EDGE = r"(?:[\s" + re.escape(_QUOTE_MARKS) + r"]|\.\.\.|…)+"
_EDGE_RE = re.compile(f"^{_EDGE}|{_EDGE}$")


@dataclass
class ProfileSource:
    """One eligible published paper, fully resolved from the database."""

    index: int
    submission_id: uuid.UUID
    result_id: uuid.UUID
    revision_id: uuid.UUID
    assignment_id: uuid.UUID | None
    link_id: str
    transcription_revision_id: uuid.UUID
    title: str
    genre: str
    published_at: datetime | None
    snapshot_hash: str
    raw_page_texts: list[tuple[int, str]] = field(default_factory=list)
    page_texts: list[tuple[int, str]] = field(default_factory=list)
    published_comment: str = ""
    published_guidance: list[str] = field(default_factory=list)

    @property
    def source_id(self) -> str:
        return f"S{self.index}"

    @property
    def genre_label(self) -> str:
        return GENRE_LABELS.get(self.genre, self.genre or "Chưa rõ thể loại")

    @property
    def genre_kind(self) -> str:
        return GENRE_KINDS.get(self.genre, "")

    @property
    def published_on(self) -> str | None:
        return self.published_at.date().isoformat() if self.published_at else None


class WritingProfileService:
    """Read and refresh the writing profile of the signed-in student."""

    def __init__(
        self,
        session: AsyncSession,
        settings: Settings | None = None,
        ai_port: AiPort | None = None,
    ) -> None:
        self.session = session
        self.settings = settings or get_settings()
        self._ai_port = ai_port

    # ── Public API ───────────────────────────────────────────────────────────

    async def get_profile(self, student: User) -> dict[str, Any]:
        """Read-only view. Never calls the model."""
        return await self._view(student, allow_ai=False)

    async def refresh(self, student: User) -> dict[str, Any]:
        """Analyze or update. Reuses the cache when the sources are unchanged."""
        return await self._view(student, allow_ai=True)

    # ── View orchestration ───────────────────────────────────────────────────

    async def _view(self, student: User, *, allow_ai: bool) -> dict[str, Any]:
        if student.role != UserRole.STUDENT:
            raise ApiHttpException(403, "STUDENT_REQUIRED", ERROR_MESSAGES["STUDENT_REQUIRED"])

        header = await self._student_header(student)
        sources, source_hash = await self._collect_sources(student)
        summary = {
            "eligibleCount": len(sources),
            "analyzedCount": 0,
            "promptVersion": self.settings.WRITING_PROFILE_PROMPT_VERSION,
            "multipleSources": len(sources) > 1,
        }
        cached = await self._load_cache(student.id)
        hit = cached is not None and cached.source_hash == source_hash and bool(cached.payload)

        if not sources:
            # Nothing published to read, or everything was revoked/deleted.
            # An old cache must never be shown once its sources are gone.
            return self._response(
                status=STATUS_EMPTY,
                header=header,
                summary=summary,
                notice=NOTICE_EMPTY,
                profile=None,
            )

        # An "insufficient evidence" result is kept for display, but a refresh
        # may try again: the model can cite valid quotes on a second pass.
        retry_insufficient = allow_ai and hit and bool(cached.payload.get("insufficient"))
        if not allow_ai or (hit and not retry_insufficient):
            if hit:
                status, notice = STATUS_READY, cached.payload.get("notice")
            elif cached is None or not cached.payload:
                status, notice = STATUS_NOT_ANALYZED, NOTICE_NOT_ANALYZED
            else:
                status, notice = STATUS_STALE, NOTICE_STALE
            if hit:
                summary["analyzedCount"] = cached.source_count
                summary["promptVersion"] = cached.prompt_version
            return self._response(
                status=status,
                header=header,
                summary=summary,
                notice=notice,
                profile=(cached.payload if hit else None),
                updated_at=cached.analyzed_at if hit else None,
            )

        payload = await self._synthesize(student, sources)
        stored = await self._save_cache(
            student.id,
            payload=payload,
            source_hash=source_hash,
            source_count=len(sources),
            evidence_count=int(payload["stats"]["evidenceCount"]),
        )
        summary["analyzedCount"] = stored.source_count
        return self._response(
            status=STATUS_READY,
            header=header,
            summary=summary,
            notice=payload.get("notice"),
            profile=payload,
            updated_at=stored.analyzed_at,
            refreshed=True,
        )

    def _response(
        self,
        *,
        status: str,
        header: dict[str, Any],
        summary: dict[str, Any],
        notice: str | None,
        profile: dict[str, Any] | None,
        updated_at: datetime | None = None,
        refreshed: bool = False,
    ) -> dict[str, Any]:
        return {
            "status": status,
            "notice": notice,
            "student": header,
            "sourceSummary": summary,
            "updatedAt": updated_at.isoformat() if updated_at else None,
            "refreshed": refreshed,
            "profile": profile,
        }

    async def _student_header(self, student: User) -> dict[str, Any]:
        row = (
            await self.session.execute(
                select(Classroom.code, Classroom.name, Classroom.academic_year)
                .join(ClassMembership, ClassMembership.classroom_id == Classroom.id)
                .where(
                    ClassMembership.user_id == student.id,
                    ClassMembership.membership_role == "STUDENT",
                    ClassMembership.status == "ACTIVE",
                )
                .order_by(Classroom.created_at.desc())
            )
        ).first()
        return {
            "id": str(student.id),
            "displayName": student.display_name,
            "loginId": student.login_id,
            "className": row.name if row else "",
            "classCode": row.code if row else "",
            "academicYear": row.academic_year if row else "",
        }

    # ── Source collection ────────────────────────────────────────────────────

    async def _collect_sources(self, student: User) -> tuple[list[ProfileSource], str]:
        """Resolve eligible published papers, newest first, and their hash."""
        limit = max(1, int(self.settings.WRITING_PROFILE_MAX_SOURCES or 5))
        rows = (
            await self.session.execute(
                select(Submission.id, Submission.current_published_result_id, AssessmentResult)
                .join(
                    AssessmentResult,
                    AssessmentResult.id == Submission.current_published_result_id,
                )
                .where(
                    Submission.student_id == student.id,
                    AssessmentResult.is_published.is_(True),
                    AssessmentResult.student_id == student.id,
                )
                .order_by(
                    AssessmentResult.published_at.desc().nullslast(),
                    AssessmentResult.updated_at.desc(),
                )
            )
        ).all()
        candidates: list[tuple[uuid.UUID, AssessmentResult]] = [
            (row[0], row[2]) for row in rows if row[2] is not None
        ]

        revision_ids = [item[1].assignment_revision_id for item in candidates]
        granted = await self._granted_revision_ids(student.id, revision_ids)

        sources: list[ProfileSource] = []
        for submission_id, result in candidates:
            if len(sources) >= limit:
                break
            source = await self._build_source(
                student,
                submission_id=submission_id,
                result=result,
                granted=granted,
                index=len(sources) + 1,
            )
            if source is not None:
                sources.append(source)

        return sources, self._source_hash(sources)

    async def _granted_revision_ids(
        self, student_id: uuid.UUID, revision_ids: list[uuid.UUID]
    ) -> set[uuid.UUID]:
        if not revision_ids:
            return set()
        rows = (
            await self.session.execute(
                select(AssignmentAccess.assignment_revision_id).where(
                    AssignmentAccess.student_id == student_id,
                    AssignmentAccess.assignment_revision_id.in_(revision_ids),
                    AssignmentAccess.revoked_at.is_(None),
                )
            )
        ).all()
        return {row[0] for row in rows}

    async def _build_source(
        self,
        student: User,
        *,
        submission_id: uuid.UUID,
        result: AssessmentResult,
        granted: set[uuid.UUID],
        index: int,
    ) -> ProfileSource | None:
        """Return a source only if it is still published, granted and readable.

        Mirrors the student result view: the published result may belong to an
        earlier attempt while the student revises, so the copy is the one the
        result was graded on, not the current attempt's working copy.
        """
        if result.submission_id != submission_id or result.student_id != student.id:
            return None
        revision = await self.session.get(AssignmentRevision, result.assignment_revision_id)
        if revision is None or revision.status != "PUBLISHED":
            return None
        if revision.id not in granted:
            return None
        assignment = (
            await self.session.get(Assignment, revision.assignment_id)
            if revision.assignment_id
            else None
        )
        if assignment is not None and assignment.status == "DELETED":
            return None
        tx = await self.session.get(TranscriptionRevision, result.transcription_revision_id)
        # A confirmed copy turns SUPERSEDED when the student reopens it; its
        # pages stay frozen, so it is still the published copy. DRAFT never is.
        if tx is None or tx.attempt_id != result.attempt_id or tx.status == DRAFT_TX:
            return None

        snapshot = result.published_payload if isinstance(result.published_payload, dict) else {}
        raw_pages: list[tuple[int, str]] = []
        for page in tx.pages or []:
            if not isinstance(page, dict):
                continue
            text = self._page_text(page)
            if text.strip():
                raw_pages.append((int(page.get("pageIndex") or 0), text))
        if not raw_pages:
            return None
        guidance = [
            str(item).strip()[:MAX_COMMENT_CHARS]
            for item in snapshot.get("improvementGuidance") or []
            if str(item or "").strip()
        ][:4]

        return ProfileSource(
            index=index,
            submission_id=submission_id,
            result_id=result.id,
            revision_id=revision.id,
            assignment_id=revision.assignment_id,
            link_id=self._link_id(revision, assignment),
            transcription_revision_id=result.transcription_revision_id,
            title=revision.title,
            genre=revision.genre,
            published_at=result.published_at,
            snapshot_hash=_stable_hash(
                {
                    "payload": snapshot,
                    "version": result.version,
                    "publishedAt": result.published_at.isoformat()
                    if result.published_at
                    else None,
                }
            ),
            raw_page_texts=raw_pages,
            page_texts=list(raw_pages),
            published_comment=str(snapshot.get("overallComment") or "").strip()[:MAX_COMMENT_CHARS],
            published_guidance=guidance,
        )

    @staticmethod
    def _page_text(page: dict[str, Any]) -> str:
        parts = [
            str(segment.get("text") or "")
            for segment in page.get("segments") or []
            if isinstance(segment, dict)
        ]
        # NFC so a quote typed by the model matches Vietnamese diacritics.
        return unicodedata.normalize("NFC", "\n".join(part for part in parts if part.strip()))

    @staticmethod
    def _link_id(revision: AssignmentRevision, assignment: Assignment | None) -> str:
        """Prefer the catalog assignment id; fall back to the revision id."""
        if assignment is not None and assignment.published_revision_id == revision.id:
            return str(assignment.id)
        return str(revision.id)

    def _source_hash(self, sources: list[ProfileSource]) -> str:
        model = (self.settings.WRITING_PROFILE_MODEL or self.settings.AI_MODEL or "").strip()
        return _stable_hash(
            {
                "schemaVersion": WRITING_PROFILE_SCHEMA_VERSION,
                "promptVersion": self.settings.WRITING_PROFILE_PROMPT_VERSION,
                "provider": self.settings.AI_PROVIDER,
                "model": model,
                "sources": [
                    {
                        "index": source.index,
                        "submissionId": str(source.submission_id),
                        "resultId": str(source.result_id),
                        "revisionId": str(source.revision_id),
                        "assignmentId": str(source.assignment_id)
                        if source.assignment_id
                        else None,
                        "transcriptionRevisionId": str(source.transcription_revision_id),
                        "publishedAt": source.published_at.isoformat()
                        if source.published_at
                        else None,
                        "snapshot": source.snapshot_hash,
                        "pages": _stable_hash(source.raw_page_texts),
                    }
                    for source in sources
                ],
            }
        )

    # ── Cache ────────────────────────────────────────────────────────────────

    async def _load_cache(self, student_id: uuid.UUID) -> WritingProfile | None:
        return await self.session.get(WritingProfile, student_id)

    async def _save_cache(
        self,
        student_id: uuid.UUID,
        *,
        payload: dict[str, Any],
        source_hash: str,
        source_count: int,
        evidence_count: int,
    ) -> WritingProfile:
        now = utcnow()
        values: dict[str, Any] = {
            "student_id": student_id,
            "payload": payload,
            "source_hash": source_hash,
            "source_count": source_count,
            "evidence_count": evidence_count,
            "prompt_version": self.settings.WRITING_PROFILE_PROMPT_VERSION,
            "schema_version": WRITING_PROFILE_SCHEMA_VERSION,
            "provider": self.settings.AI_PROVIDER,
            "model": self._model_name(),
            "analyzed_at": now,
            "updated_at": now,
        }
        updates = {key: value for key, value in values.items() if key != "student_id"}
        await self.session.execute(
            pg_insert(WritingProfile)
            .values(**values)
            .on_conflict_do_update(index_elements=["student_id"], set_=updates)
        )
        await self.session.commit()
        row = await self.session.get(WritingProfile, student_id, populate_existing=True)
        if row is None:  # pragma: no cover - the upsert above always leaves a row
            raise ApiHttpException(500, "INTERNAL", ERROR_MESSAGES["INTERNAL"])
        return row

    def _model_name(self) -> str:
        return (self.settings.WRITING_PROFILE_MODEL or self.settings.AI_MODEL or "").strip()

    # ── AI synthesis (one call, never on GET) ────────────────────────────────

    def _prompt_asset(self):
        try:
            return load_prompt_asset(
                "assessment",
                self.settings.WRITING_PROFILE_PROMPT_VERSION,
                "writing-profile",
            )
        except PromptAssetError as exc:
            logger.error("writing_profile_prompt_error version=%s", exc.version)
            raise ApiHttpException(503, "AI_UNAVAILABLE", ERROR_MESSAGES["AI_UNAVAILABLE"]) from exc

    def _adapter(self) -> AiPort:
        if self._ai_port is not None:
            return self._ai_port
        try:
            return create_ai_adapter(
                self.settings,
                model_override=self.settings.WRITING_PROFILE_MODEL or None,
                timeout_override=float(self.settings.WRITING_PROFILE_TIMEOUT_SECONDS or 90),
            )
        except AiConfigurationError as exc:
            logger.error("writing_profile_ai_config_error provider=%s", exc.provider)
            raise ApiHttpException(503, "AI_UNAVAILABLE", ERROR_MESSAGES["AI_UNAVAILABLE"]) from exc

    async def _synthesize(
        self, student: User, sources: list[ProfileSource]
    ) -> dict[str, Any]:
        """Run the single synthesis call and return a validated payload."""
        asset = self._prompt_asset()
        adapter = self._adapter()
        self._fit_source_texts(sources)
        prompt = self._user_payload(sources)
        timeout = float(self.settings.WRITING_PROFILE_TIMEOUT_SECONDS or 90)
        try:
            # Hard ceiling on top of the adapter timeout, so SDK retries
            # cannot keep the request open indefinitely.
            response = await asyncio.wait_for(
                adapter.generate(
                    prompt,
                    system_prompt=asset.text,
                    structured_output=WritingProfileOutput,
                    max_tokens=int(self.settings.WRITING_PROFILE_MAX_OUTPUT_TOKENS or 4096),
                ),
                timeout=timeout + 5,
            )
        except TimeoutError as exc:
            logger.warning("writing_profile_timeout student_id=%s", student.id)
            raise ApiHttpException(
                503, "AI_UNAVAILABLE", ERROR_MESSAGES["AI_UNAVAILABLE"]
            ) from exc
        except AiInvalidOutputError as exc:
            logger.warning("writing_profile_invalid_output student_id=%s", student.id)
            raise ApiHttpException(
                503, "WRITING_PROFILE_INVALID", ERROR_MESSAGES["WRITING_PROFILE_INVALID"]
            ) from exc
        except AiError as exc:
            logger.warning(
                "writing_profile_ai_error student_id=%s code=%s", student.id, exc.code
            )
            raise ApiHttpException(
                503, "AI_UNAVAILABLE", ERROR_MESSAGES["AI_UNAVAILABLE"]
            ) from exc

        parsed = response.content
        if not isinstance(parsed, WritingProfileOutput):
            raise ApiHttpException(
                503, "WRITING_PROFILE_INVALID", ERROR_MESSAGES["WRITING_PROFILE_INVALID"]
            )
        return self._build_payload(parsed, sources)

    def _user_payload(self, sources: list[ProfileSource]) -> str:
        """Everything the model may rely on, plus a JSON block for fake mode."""
        data = {
            "task": "Tổng hợp hồ sơ văn phong từ bài viết đã công bố",
            "traitGroups": [{"traitId": key, "traitName": name} for key, name in TRAITS],
            "limits": {
                "maxObservations": int(self.settings.WRITING_PROFILE_MAX_OBSERVATIONS or 8),
                "sourceCount": len(sources),
                "allowTrend": len(sources) > 1,
            },
            "sources": [
                {
                    "sourceId": source.source_id,
                    "assignmentTitle": source.title,
                    "genreLabel": source.genre_label,
                    "publishedOn": source.published_on,
                    "pages": [
                        {"pageIndex": page_index, "text": text}
                        for page_index, text in source.page_texts
                    ],
                    "publishedComments": (
                        [source.published_comment] if source.published_comment else []
                    )
                    + source.published_guidance,
                }
                for source in sources
            ],
        }
        body = json.dumps(data, ensure_ascii=False, indent=1)
        return (
            "Dữ liệu các bài viết đã công bố của học sinh:\n\n```json\n"
            f"{body}\n```\n\n"
            "Trả về JSON đúng schema, mỗi quan sát kèm trích dẫn nguyên văn."
        )

    def _fit_source_texts(self, sources: list[ProfileSource]) -> None:
        """Bound the prompt size without inventing or dropping evidence text."""
        budget = max(2000, int(self.settings.WRITING_PROFILE_MAX_INPUT_CHARS or 60_000))
        limit = max(MIN_PAGE_CHARS, int(self.settings.WRITING_PROFILE_PAGE_CHAR_LIMIT or 12_000))
        while limit > MIN_PAGE_CHARS_FLOOR:
            if _pages_total(sources) <= budget:
                return
            limit = max(MIN_PAGE_CHARS_FLOOR, limit // 2)
            for source in sources:
                source.page_texts = [
                    (page_index, text[:limit]) for page_index, text in source.raw_page_texts
                ]
        longest = sorted(
            ((source, position) for source in sources for position in range(len(source.page_texts))),
            key=lambda item: -len(item[0].page_texts[item[1]][1]),
        )
        for source, position in longest:
            if _pages_total(sources) <= budget:
                return
            page_index, text = source.page_texts[position]
            room = max(MIN_PAGE_CHARS_FLOOR, len(text) - (_pages_total(sources) - budget))
            source.page_texts[position] = (page_index, text[:room])

    def _build_payload(
        self, parsed: WritingProfileOutput, sources: list[ProfileSource]
    ) -> dict[str, Any]:
        """Attach real paper metadata and drop every unverifiable observation."""
        observations, dropped = self._resolve_observations(parsed, sources)
        counts: dict[str, int] = {}
        for item in observations:
            key = str(item["traitId"])
            counts[key] = counts.get(key, 0) + 1
        model_traits = {trait.trait_id: trait for trait in parsed.traits}

        traits_out: list[dict[str, Any]] = []
        for key, name in TRAITS:
            evidence = counts.get(key, 0)
            model_trait = model_traits.get(key)
            if evidence == 0:
                # No verified quote for this group: never claim a level.
                level, note = "INSUFFICIENT", LEVEL_LABELS["INSUFFICIENT"]
            else:
                level = model_trait.level if model_trait else "EMERGING"
                if level == "INSUFFICIENT":
                    level = "EMERGING"
                note = (model_trait.note or "").strip() if model_trait else ""
                if not note:
                    note = f"Ghi nhận {evidence} minh chứng trong bài đã công bố."
            traits_out.append(
                {
                    "traitId": key,
                    "traitName": name,
                    "level": level,
                    "levelLabel": LEVEL_LABELS[level],
                    "note": note,
                    "evidenceCount": evidence,
                }
            )

        per_source: dict[str, int] = {}
        for item in observations:
            key = str(item["sourceId"])
            per_source[key] = per_source.get(key, 0) + 1
        sources_out = [
            {
                "sourceId": source.source_id,
                "assignmentId": source.link_id,
                "assignmentTitle": source.title,
                "genre": source.genre_kind,
                "genreLabel": source.genre_label,
                "publishedAt": source.published_at.isoformat() if source.published_at else None,
                "publishedOn": source.published_on,
                "publishedComment": source.published_comment,
                "publishedLabel": PUBLISHED_LABEL,
                "evidenceCount": per_source.get(source.source_id, 0),
                "resultId": str(source.result_id),
            }
            for source in sources
        ]

        stats = {
            "analyzedCount": len(sources),
            "evidenceCount": len(observations),
            "strengthCount": sum(1 for item in observations if item["kind"] == "STRENGTH"),
            "weaknessCount": sum(1 for item in observations if item["kind"] == "WEAKNESS"),
            "styleCount": sum(1 for item in observations if item["kind"] == "STYLE"),
            "traitsWithEvidence": sum(1 for trait in traits_out if trait["evidenceCount"] > 0),
            "droppedCount": dropped,
            "multipleSources": len(sources) > 1,
        }
        return {
            "label": AI_LABEL,
            # A summary with no verified quote behind it is not shown.
            "summary": parsed.summary.strip() if observations else "",
            "insufficient": not observations,
            "traits": traits_out,
            "observations": observations,
            "sources": sources_out,
            "stats": stats,
            "notice": NOTICE_INSUFFICIENT if not observations else None,
        }

    def _resolve_observations(
        self, parsed: WritingProfileOutput, sources: list[ProfileSource]
    ) -> tuple[list[dict[str, Any]], int]:
        """Keep only observations whose quote exists in the paper they cite."""
        limit = max(1, int(self.settings.WRITING_PROFILE_MAX_OBSERVATIONS or 8))
        by_id = {source.source_id: source for source in sources}
        resolved: list[dict[str, Any]] = []
        seen: set[str] = set()
        dropped = 0
        for candidate in parsed.observations:
            if len(resolved) >= limit:
                dropped += 1
                continue
            source = by_id.get(str(candidate.source_id or "").strip().upper())
            found = self._match_quote(source, candidate)
            if source is None or found is None:
                dropped += 1
                continue
            page_index, quote, start, end = found
            view = self._observation_view(candidate, source, page_index, quote, start, end)
            if view["id"] in seen:
                dropped += 1
                continue
            seen.add(view["id"])
            resolved.append(view)
        return resolved, dropped

    def _match_quote(
        self, source: ProfileSource | None, candidate: Any
    ) -> tuple[int, str, int, int] | None:
        """Verbatim match inside the cited page of the copy sent to the model.

        Only whitespace (OCR line breaks) and the style of quotation marks may
        differ, and an ellipsis may trim either end. An ellipsis inside must
        exist in the paper itself, so a quote stitched from two places fails.
        The page must be the one cited, and the text must be within what the
        model actually received.
        """
        if source is None:
            return None
        raw_quote = unicodedata.normalize("NFC", str(candidate.evidence_quote or ""))
        quote = _WHITESPACE_RE.sub(" ", raw_quote).strip()
        quote = _EDGE_RE.sub("", quote)
        if len(quote) < MIN_QUOTE_CHARS:
            return None
        pattern = _quote_pattern(quote)
        if pattern is None:
            return None
        cited = int(candidate.page_index)
        for page_index, text in source.page_texts:
            if page_index != cited:
                continue
            found = pattern.search(text)
            if found:
                return page_index, text[found.start() : found.end()], found.start(), found.end()
        return None

    def _observation_view(
        self,
        candidate: Any,
        source: ProfileSource,
        page_index: int,
        quote: str,
        start: int,
        end: int,
    ) -> dict[str, Any]:
        """Real paper metadata, never model-invented titles or dates."""
        trait_id = str(candidate.trait_id)
        kind = str(candidate.kind)
        digest = hashlib.sha1(
            f"{source.result_id}:{trait_id}:{kind}:{page_index}:{start}".encode("utf-8")
        ).hexdigest()[:12]
        return {
            "id": digest,
            "label": AI_LABEL,
            "traitId": trait_id,
            "traitName": TRAIT_NAMES.get(trait_id, trait_id),
            "kind": kind,
            "kindLabel": KIND_LABELS.get(kind, kind),
            "description": str(candidate.description).strip(),
            "practiceTip": str(candidate.practice_tip or "").strip(),
            "evidenceQuote": quote,
            "evidenceStart": start,
            "evidenceEnd": end,
            "pageIndex": page_index,
            "sourceId": source.source_id,
            "assignmentId": source.link_id,
            "assignmentTitle": source.title,
            "genre": source.genre_kind,
            "genreLabel": source.genre_label,
            "publishedAt": source.published_at.isoformat() if source.published_at else None,
            "publishedOn": source.published_on,
            "resultId": str(source.result_id),
            "linkHref": f"/assignments/{source.link_id}/result",
        }


def _stable_hash(payload: Any) -> str:
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _pages_total(sources: list[ProfileSource]) -> int:
    return sum(len(text) for source in sources for _, text in source.page_texts)


def _quote_pattern(quote: str) -> re.Pattern[str] | None:
    words = quote.split()
    if not words:
        return None
    marks = "[" + re.escape(_QUOTE_MARKS) + "]"

    def word_pattern(word: str) -> str:
        return "".join(marks if char in _QUOTE_MARKS else re.escape(char) for char in word)

    pattern_str = r"\s+".join(word_pattern(w) for w in words)
    try:
        return re.compile(pattern_str)
    except re.error:
        return None
