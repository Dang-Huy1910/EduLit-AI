"""Student writing profile: published work in, cumulative AI synthesis out.

GET never calls the model. A refresh sends only the papers the profile has not
read yet, together with the previous profile, and replaces the cache only after
the model output passes verbatim-evidence validation. Observations from papers
read earlier are carried over while those papers stay published, and every
successful refresh appends a compact version for the progress view.

Only papers the teacher already published are used: results pointed by
`Submission.current_published_result_id`, still published, once granted to the
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

from sqlalchemy import func, select
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
    Term,
    TranscriptionRevision,
    TranscriptionRevisionStatus,
    User,
    UserRole,
    WritingProfile,
    WritingProfileVersion,
)
from app.identity.rate_limit import hit_rate_limit

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
    "Hồ sơ chưa được tổng hợp. Hệ thống sẽ tự tổng hợp lần đầu trong ít phút; "
    "em cũng có thể bấm “Cập nhật hồ sơ” để làm ngay."
)
NOTICE_STALE = (
    "Có {count} bài mới được công bố hoặc vừa được công bố lại. Em bấm “Cập nhật "
    "hồ sơ” để hệ thống đọc thêm các bài này và cập nhật hồ sơ."
)
NOTICE_INSUFFICIENT = (
    "Chưa đủ căn cứ trích dẫn trong các bài đã công bố để tổng hợp hồ sơ."
)

STATUS_EMPTY = "empty"
STATUS_NOT_ANALYZED = "not_analyzed"
STATUS_READY = "ready"
STATUS_STALE = "stale"

HIGH_LEVELS = {"CONSISTENT", "STRONG"}
# "Stable" or "strong" needs verified quotes from at least this many papers.
MIN_SOURCES_FOR_HIGH_LEVEL = 2
MAX_PROFILE_OBSERVATIONS = 12
MAX_HISTORY_VERSIONS = 12

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
    # Access was revoked later (e.g. removed from the class): the paper still
    # belongs to the student's history, but its result page is not linkable.
    access_revoked: bool = False

    @property
    def source_id(self) -> str:
        return f"S{self.index}"

    @property
    def key(self) -> str:
        """Identity of what the profile read: the result and its published snapshot."""
        return f"{self.result_id}:{self.snapshot_hash}"

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
        """Read new papers into the profile. Reuses the cache when nothing is new."""
        return await self._view(student, allow_ai=True)

    async def get_profile_for_teacher(
        self, teacher: User, classroom_id: uuid.UUID, student_id: uuid.UUID
    ) -> dict[str, Any]:
        """Read-only view of one student in a class the teacher owns."""
        if teacher.role != UserRole.TEACHER:
            raise ApiHttpException(403, "TEACHER_REQUIRED", ERROR_MESSAGES["TEACHER_REQUIRED"])
        member = (
            await self.session.execute(
                select(ClassMembership.id)
                .join(Classroom, Classroom.id == ClassMembership.classroom_id)
                .where(
                    Classroom.id == classroom_id,
                    Classroom.owner_teacher_id == teacher.id,
                    ClassMembership.user_id == student_id,
                    ClassMembership.membership_role == "STUDENT",
                )
            )
        ).first()
        student = await self.session.get(User, student_id) if member else None
        if student is None or student.role != UserRole.STUDENT:
            raise ApiHttpException(404, "NOT_FOUND", "Không tìm thấy học sinh trong lớp.")
        return await self._view(student, allow_ai=False)

    # ── View orchestration ───────────────────────────────────────────────────

    async def _view(self, student: User, *, allow_ai: bool) -> dict[str, Any]:
        if student.role != UserRole.STUDENT:
            raise ApiHttpException(403, "STUDENT_REQUIRED", ERROR_MESSAGES["STUDENT_REQUIRED"])

        header = await self._student_header(student)
        sources = await self._collect_sources(student)
        cached = await self._load_cache(student.id)
        stored = cached.payload if cached is not None and cached.payload else None
        analyzed = _analyzed_keys(cached)
        pending = [source for source in sources if source.key not in analyzed]
        summary = {
            "eligibleCount": len(sources),
            "analyzedCount": 0,
            "pendingCount": len(pending),
            "promptVersion": self.settings.WRITING_PROFILE_PROMPT_VERSION,
            "multipleSources": len(sources) > 1,
        }

        if not sources:
            # Nothing published to read, or everything was unpublished/deleted.
            # An old profile must never be shown once all its sources are gone.
            return self._response(
                status=STATUS_EMPTY,
                header=header,
                summary=summary,
                notice=NOTICE_EMPTY,
                profile=None,
            )

        current = self._current_view(stored, sources) if stored is not None else None
        history = await self._history(student.id) if current is not None else []
        # An "insufficient evidence" result may be retried on the same papers:
        # the model can cite valid quotes on a second pass.
        retry_insufficient = (
            allow_ai and current is not None and current["insufficient"] and not pending
        )
        if not allow_ai or (current is not None and not pending and not retry_insufficient):
            if current is None:
                status, notice = STATUS_NOT_ANALYZED, NOTICE_NOT_ANALYZED
            elif pending:
                status, notice = STATUS_STALE, NOTICE_STALE.format(count=len(pending))
            else:
                status, notice = STATUS_READY, current.get("notice")
            if current is not None:
                summary["analyzedCount"] = current["stats"]["analyzedCount"]
            return self._response(
                status=status,
                header=header,
                summary=summary,
                notice=notice,
                profile=current,
                updated_at=cached.analyzed_at if current is not None else None,
                history=history,
            )

        await hit_rate_limit(
            self.settings,
            f"writing-profile:user:{student.id}",
            int(self.settings.RATE_LIMIT_WRITING_PROFILE_MAX or 6),
        )
        payload, stored_row, read = await self._synthesize_and_save(
            student, sources, pending, current, analyzed
        )
        summary["analyzedCount"] = payload["stats"]["analyzedCount"]
        summary["pendingCount"] = len([source for source in sources if source not in read])
        return self._response(
            status=STATUS_READY,
            header=header,
            summary=summary,
            notice=payload.get("notice"),
            profile=payload,
            updated_at=stored_row.analyzed_at,
            refreshed=True,
            history=await self._history(student.id),
        )

    async def initialize(self, student: User) -> bool:
        """Build the first profile without the student asking. Used by the worker.

        Does nothing once a profile exists (the student refreshes it from then
        on) or while the student has no eligible published paper. Not counted
        against the student's refresh limit.
        """
        if student.role != UserRole.STUDENT:
            return False
        if await self._load_cache(student.id) is not None:
            return False
        sources = await self._collect_sources(student)
        if not sources:
            return False
        await self._synthesize_and_save(student, sources, sources, None, set())
        return True

    async def _synthesize_and_save(
        self,
        student: User,
        sources: list[ProfileSource],
        pending: list[ProfileSource],
        current: dict[str, Any] | None,
        analyzed: set[str],
    ) -> tuple[dict[str, Any], WritingProfile, list[ProfileSource]]:
        """Read the next batch into the profile and store the result."""
        limit = max(1, int(self.settings.WRITING_PROFILE_MAX_SOURCES or 5))
        batch = (pending or sources)[:limit]
        payload = await self._synthesize(student, batch, sources, current)
        previous_keys = analyzed if current is not None else set()
        read = [
            source
            for source in sources
            if source.key in previous_keys or source in batch
        ]
        stored_row = await self._save_cache(
            student.id,
            payload=payload,
            analyzed_sources=[
                {"resultId": str(source.result_id), "snapshot": source.snapshot_hash}
                for source in read
            ],
            source_hash=_stable_hash(sorted(source.key for source in read)),
            new_source_count=len(batch),
        )
        return payload, stored_row, read

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
        history: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        return {
            "status": status,
            "notice": notice,
            "student": header,
            "sourceSummary": summary,
            "updatedAt": updated_at.isoformat() if updated_at else None,
            "refreshed": refreshed,
            "profile": profile,
            "history": history or [],
        }

    async def _student_header(self, student: User) -> dict[str, Any]:
        rows = (
            await self.session.execute(
                select(Classroom.code, Classroom.name, Term.academic_year)
                .join(ClassMembership, ClassMembership.classroom_id == Classroom.id)
                .join(Term, Term.id == Classroom.term_id)
                .where(
                    ClassMembership.user_id == student.id,
                    ClassMembership.membership_role == "STUDENT",
                    ClassMembership.status == "ACTIVE",
                    Classroom.archived_at.is_(None),
                )
                .order_by(Term.starts_on.desc(), Classroom.code)
            )
        ).all()
        # A student can be in several subject classes; list them, newest term first.
        newest = rows[0] if rows else None
        return {
            "id": str(student.id),
            "displayName": student.display_name,
            "loginId": student.login_id,
            "className": newest.name if newest and len(rows) == 1 else "",
            "classCode": ", ".join(row.code for row in rows),
            "academicYear": newest.academic_year if newest else "",
        }

    async def _history(self, student_id: uuid.UUID) -> list[dict[str, Any]]:
        rows = (
            await self.session.execute(
                select(WritingProfileVersion)
                .where(WritingProfileVersion.student_id == student_id)
                .order_by(WritingProfileVersion.version.desc())
                .limit(MAX_HISTORY_VERSIONS)
            )
        ).scalars().all()
        return [
            {
                "version": row.version,
                "analyzedAt": row.analyzed_at.isoformat() if row.analyzed_at else None,
                "sourceCount": row.source_count,
                "newSourceCount": row.new_source_count,
                "evidenceCount": row.evidence_count,
                "traits": list(row.traits or []),
            }
            for row in reversed(rows)
        ]

    # ── Source collection ────────────────────────────────────────────────────

    async def _collect_sources(self, student: User) -> list[ProfileSource]:
        """Resolve every eligible published paper, newest first."""
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
        grants = await self._grants(student.id, revision_ids)

        sources: list[ProfileSource] = []
        for submission_id, result in candidates:
            source = await self._build_source(
                student,
                submission_id=submission_id,
                result=result,
                grants=grants,
                index=len(sources) + 1,
            )
            if source is not None:
                sources.append(source)
        return sources

    async def _grants(
        self, student_id: uuid.UUID, revision_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, bool]:
        """Revision id -> whether the grant is still active.

        A revoked grant still counts: the paper was assigned to the student and
        stays in their history after they leave or are removed from a class.
        """
        if not revision_ids:
            return {}
        rows = (
            await self.session.execute(
                select(
                    AssignmentAccess.assignment_revision_id,
                    func.bool_or(AssignmentAccess.revoked_at.is_(None)),
                )
                .where(
                    AssignmentAccess.student_id == student_id,
                    AssignmentAccess.assignment_revision_id.in_(revision_ids),
                )
                .group_by(AssignmentAccess.assignment_revision_id)
            )
        ).all()
        return {row[0]: bool(row[1]) for row in rows}

    async def _build_source(
        self,
        student: User,
        *,
        submission_id: uuid.UUID,
        result: AssessmentResult,
        grants: dict[uuid.UUID, bool],
        index: int,
    ) -> ProfileSource | None:
        """Return a source only if it is still published, was granted and is readable.

        Mirrors the student result view: the published result may belong to an
        earlier attempt while the student revises, so the copy is the one the
        result was graded on, not the current attempt's working copy.
        """
        if result.submission_id != submission_id or result.student_id != student.id:
            return None
        revision = await self.session.get(AssignmentRevision, result.assignment_revision_id)
        if revision is None or revision.status != "PUBLISHED":
            return None
        if revision.id not in grants:
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
                    "transcriptionRevisionId": str(result.transcription_revision_id),
                    "pages": _stable_hash(raw_pages),
                }
            ),
            raw_page_texts=raw_pages,
            page_texts=list(raw_pages),
            published_comment=str(snapshot.get("overallComment") or "").strip()[:MAX_COMMENT_CHARS],
            published_guidance=guidance,
            access_revoked=not grants[revision.id],
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

    # ── Cache ────────────────────────────────────────────────────────────────

    async def _load_cache(self, student_id: uuid.UUID) -> WritingProfile | None:
        return await self.session.get(WritingProfile, student_id, populate_existing=True)

    async def _save_cache(
        self,
        student_id: uuid.UUID,
        *,
        payload: dict[str, Any],
        analyzed_sources: list[dict[str, str]],
        source_hash: str,
        new_source_count: int,
    ) -> WritingProfile:
        now = utcnow()
        stats = payload["stats"]
        current = await self._load_cache(student_id)
        version = (current.version if current is not None else 0) + 1
        values: dict[str, Any] = {
            "student_id": student_id,
            "payload": payload,
            "source_hash": source_hash,
            "source_count": int(stats["analyzedCount"]),
            "evidence_count": int(stats["evidenceCount"]),
            "analyzed_sources": analyzed_sources,
            "version": version,
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
        await self.session.execute(
            pg_insert(WritingProfileVersion)
            .values(
                student_id=student_id,
                version=version,
                summary=payload.get("summary") or "",
                traits=[
                    {
                        "traitId": trait["traitId"],
                        "level": trait["level"],
                        "evidenceCount": trait["evidenceCount"],
                    }
                    for trait in payload["traits"]
                ],
                source_count=int(stats["analyzedCount"]),
                new_source_count=new_source_count,
                evidence_count=int(stats["evidenceCount"]),
                prompt_version=self.settings.WRITING_PROFILE_PROMPT_VERSION,
                model=self._model_name(),
                analyzed_at=now,
            )
            # Two refreshes racing on the same version: keep the first snapshot.
            .on_conflict_do_nothing(constraint="writing_profile_versions_student_version_key")
        )
        await self.session.commit()
        row = await self._load_cache(student_id)
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
        self,
        student: User,
        batch: list[ProfileSource],
        sources: list[ProfileSource],
        previous: dict[str, Any] | None,
    ) -> dict[str, Any]:
        """Run the single synthesis call and merge it into the previous profile."""
        asset = self._prompt_asset()
        adapter = self._adapter()
        self._fit_source_texts(batch)
        prompt = self._user_payload(batch, previous)
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

        new_observations, dropped = self._resolve_observations(parsed, batch)
        batch_results = {str(source.result_id) for source in batch}
        eligible = {str(source.result_id) for source in sources}
        carried = [
            item
            for item in (previous or {}).get("observations") or []
            if item["resultId"] in eligible and item["resultId"] not in batch_results
        ]
        previous_results = {item["resultId"] for item in (previous or {}).get("sources") or []}
        read = [
            source
            for source in sources
            if str(source.result_id) in previous_results or str(source.result_id) in batch_results
        ]
        hints = {
            trait["traitId"]: (trait["level"], trait["note"])
            for trait in (previous or {}).get("traits") or []
        }
        hints.update({trait.trait_id: (trait.level, trait.note) for trait in parsed.traits})
        observations = (new_observations + carried)[:MAX_PROFILE_OBSERVATIONS]
        return self._assemble(
            summary=parsed.summary.strip(),
            hints=hints,
            observations=observations,
            read=read,
            dropped=dropped,
            new_count=len(batch),
        )

    def _user_payload(
        self, batch: list[ProfileSource], previous: dict[str, Any] | None
    ) -> str:
        """Everything the model may rely on, plus a JSON block for fake mode."""
        analyzed_before = int((previous or {}).get("stats", {}).get("analyzedCount") or 0)
        data: dict[str, Any] = {
            "task": "Cập nhật hồ sơ văn phong từ bài viết đã công bố",
            "traitGroups": [{"traitId": key, "traitName": name} for key, name in TRAITS],
            "limits": {
                "maxObservations": int(self.settings.WRITING_PROFILE_MAX_OBSERVATIONS or 8),
                "sourceCount": len(batch),
                "allowTrend": len(batch) + analyzed_before > 1,
            },
            "previousProfile": _previous_context(previous),
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
                for source in batch
            ],
        }
        body = json.dumps(data, ensure_ascii=False, indent=1)
        return (
            "Dữ liệu hồ sơ trước đó và các bài viết mới được công bố của học sinh:\n\n```json\n"
            f"{body}\n```\n\n"
            "Trả về JSON đúng schema, mỗi quan sát kèm trích dẫn nguyên văn từ bài mới."
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

    # ── Payload assembly ─────────────────────────────────────────────────────

    def _current_view(
        self, stored: dict[str, Any], sources: list[ProfileSource]
    ) -> dict[str, Any]:
        """The stored profile, limited to papers that are still eligible."""
        eligible = {str(source.result_id) for source in sources}
        read_results = {item.get("resultId") for item in stored.get("sources") or []}
        read = [source for source in sources if str(source.result_id) in read_results]
        observations = [
            item for item in stored.get("observations") or [] if item.get("resultId") in eligible
        ]
        hints = {
            trait["traitId"]: (trait["level"], trait["note"])
            for trait in stored.get("traits") or []
        }
        stats = stored.get("stats") or {}
        return self._assemble(
            summary=str(stored.get("summary") or ""),
            hints=hints,
            observations=observations,
            read=read,
            dropped=int(stats.get("droppedCount") or 0),
            new_count=int(stats.get("newCount") or 0),
        )

    def _assemble(
        self,
        *,
        summary: str,
        hints: dict[str, tuple[str, str]],
        observations: list[dict[str, Any]],
        read: list[ProfileSource],
        dropped: int,
        new_count: int,
    ) -> dict[str, Any]:
        """Build the payload from real paper metadata and verified observations.

        Levels are only claimed with evidence: no quote means "insufficient",
        and "stable"/"strong" needs quotes from at least two papers.
        """
        source_ids = {str(source.result_id): f"S{position}" for position, source in enumerate(read, 1)}
        by_result = {str(source.result_id): source for source in read}
        observations = [
            {**item, "sourceId": source_ids[item["resultId"]], **_source_link(by_result[item["resultId"]])}
            for item in observations
            if item["resultId"] in source_ids
        ]

        counts: dict[str, int] = {}
        papers: dict[str, set[str]] = {}
        for item in observations:
            key = str(item["traitId"])
            counts[key] = counts.get(key, 0) + 1
            papers.setdefault(key, set()).add(item["resultId"])

        traits_out: list[dict[str, Any]] = []
        for key, name in TRAITS:
            evidence = counts.get(key, 0)
            hint_level, hint_note = hints.get(key, ("EMERGING", ""))
            if evidence == 0:
                # No verified quote for this group: never claim a level.
                level, note = "INSUFFICIENT", LEVEL_LABELS["INSUFFICIENT"]
            else:
                level = hint_level if hint_level in LEVEL_LABELS else "EMERGING"
                if level == "INSUFFICIENT":
                    level = "EMERGING"
                if level in HIGH_LEVELS and len(papers[key]) < MIN_SOURCES_FOR_HIGH_LEVEL:
                    level = "EMERGING"
                note = (hint_note or "").strip()
                if not note or note == LEVEL_LABELS["INSUFFICIENT"]:
                    note = f"Ghi nhận {evidence} minh chứng trong bài đã công bố."
            traits_out.append(
                {
                    "traitId": key,
                    "traitName": name,
                    "level": level,
                    "levelLabel": LEVEL_LABELS[level],
                    "note": note,
                    "evidenceCount": evidence,
                    "sourceCount": len(papers.get(key, ())),
                }
            )

        per_source: dict[str, int] = {}
        for item in observations:
            per_source[item["sourceId"]] = per_source.get(item["sourceId"], 0) + 1
        sources_out = [
            {
                "sourceId": source_ids[str(source.result_id)],
                "assignmentId": source.link_id,
                "assignmentTitle": source.title,
                "genre": source.genre_kind,
                "genreLabel": source.genre_label,
                "publishedAt": source.published_at.isoformat() if source.published_at else None,
                "publishedOn": source.published_on,
                "publishedComment": source.published_comment,
                "publishedLabel": PUBLISHED_LABEL,
                "evidenceCount": per_source.get(source_ids[str(source.result_id)], 0),
                "resultId": str(source.result_id),
                "linkable": not source.access_revoked,
            }
            for source in read
        ]

        stats = {
            "analyzedCount": len(read),
            "newCount": new_count,
            "evidenceCount": len(observations),
            "strengthCount": sum(1 for item in observations if item["kind"] == "STRENGTH"),
            "weaknessCount": sum(1 for item in observations if item["kind"] == "WEAKNESS"),
            "styleCount": sum(1 for item in observations if item["kind"] == "STYLE"),
            "traitsWithEvidence": sum(1 for trait in traits_out if trait["evidenceCount"] > 0),
            "droppedCount": dropped,
            "multipleSources": len(read) > 1,
        }
        return {
            "label": AI_LABEL,
            # A summary with no verified quote behind it is not shown.
            "summary": summary if observations else "",
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
        """Verbatim match inside one page of the copy sent to the model.

        Only whitespace (OCR line breaks) and the style of quotation marks may
        differ, and an ellipsis may trim either end. An ellipsis inside must
        exist in the paper itself, so a quote stitched from two places fails.
        The cited page is tried first; a quote found word for word on another
        page of the same paper is kept with the page corrected. The text must
        be within what the model actually received.
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
        pages = sorted(source.page_texts, key=lambda page: page[0] != cited)
        for page_index, text in pages:
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
            "resultId": str(source.result_id),
            **_source_link(source),
        }


def _source_link(source: ProfileSource) -> dict[str, Any]:
    """Current paper metadata for an observation, refreshed on every read."""
    return {
        "assignmentId": source.link_id,
        "assignmentTitle": source.title,
        "genre": source.genre_kind,
        "genreLabel": source.genre_label,
        "publishedAt": source.published_at.isoformat() if source.published_at else None,
        "publishedOn": source.published_on,
        "linkHref": "" if source.access_revoked else f"/assignments/{source.link_id}/result",
    }


def _analyzed_keys(cached: WritingProfile | None) -> set[str]:
    if cached is None or not cached.payload:
        return set()
    return {
        f"{item.get('resultId')}:{item.get('snapshot')}"
        for item in cached.analyzed_sources or []
        if isinstance(item, dict)
    }


def _previous_context(previous: dict[str, Any] | None) -> dict[str, Any] | None:
    """What the model may know about earlier papers: levels and notes, no quotes."""
    if not previous or previous.get("insufficient"):
        return None
    return {
        "analyzedCount": previous["stats"]["analyzedCount"],
        "summary": previous.get("summary") or "",
        "traits": [
            {
                "traitId": trait["traitId"],
                "level": trait["level"],
                "note": trait["note"],
                "evidenceCount": trait["evidenceCount"],
            }
            for trait in previous.get("traits") or []
        ],
        "observations": [
            {"traitId": item["traitId"], "kind": item["kind"], "description": item["description"]}
            for item in previous.get("observations") or []
        ],
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


MAX_STYLE_TRAITS = 3


async def outline_style_context(
    session: AsyncSession, student_id: uuid.UUID, settings: Settings
) -> dict[str, Any] | None:
    """Weak expression groups to personalise an outline, or None.

    Uses the cached profile only (no model call). The profile must rest on at
    least `OUTLINE_STYLE_MIN_SOURCES` papers and name a weakness; quotes from
    earlier papers are never passed on.
    """
    cached = await session.get(WritingProfile, student_id)
    payload = cached.payload if cached is not None else None
    if not payload or payload.get("insufficient"):
        return None
    analyzed = int((payload.get("stats") or {}).get("analyzedCount") or 0)
    if analyzed < max(1, int(settings.OUTLINE_STYLE_MIN_SOURCES or 3)):
        return None

    weaknesses: dict[str, list[dict[str, Any]]] = {}
    for item in payload.get("observations") or []:
        if item.get("kind") == "WEAKNESS":
            weaknesses.setdefault(str(item.get("traitId")), []).append(item)
    traits = {trait["traitId"]: trait for trait in payload.get("traits") or []}
    # Groups with a recorded weakness first, then groups still at "emerging".
    ordered = list(weaknesses) + [
        key
        for key, _ in TRAITS
        if key not in weaknesses
        and traits.get(key, {}).get("level") == "EMERGING"
        and traits[key].get("evidenceCount")
    ]
    weak_traits = []
    for key in ordered[:MAX_STYLE_TRAITS]:
        trait = traits.get(key, {})
        items = weaknesses.get(key, [])
        weak_traits.append(
            {
                "traitId": key,
                "traitName": TRAIT_NAMES.get(key, key),
                "level": trait.get("level") or "EMERGING",
                "note": trait.get("note") or "",
                "issues": [str(item.get("description") or "") for item in items][:2],
                "practiceTips": [
                    str(item.get("practiceTip") or "") for item in items if item.get("practiceTip")
                ][:2],
            }
        )
    if not weak_traits:
        return None
    return {
        "analyzedCount": analyzed,
        "profileVersion": cached.version,
        "weakTraits": weak_traits,
    }


async def students_without_profile(
    session: AsyncSession, *, limit: int, skip: set[uuid.UUID]
) -> list[uuid.UUID]:
    """Students with a published result and no writing profile yet."""
    stmt = (
        select(Submission.student_id)
        .join(AssessmentResult, AssessmentResult.id == Submission.current_published_result_id)
        .outerjoin(WritingProfile, WritingProfile.student_id == Submission.student_id)
        .where(AssessmentResult.is_published.is_(True), WritingProfile.student_id.is_(None))
        .group_by(Submission.student_id)
        .order_by(func.max(AssessmentResult.published_at).desc().nullslast())
        .limit(limit)
    )
    if skip:
        stmt = stmt.where(Submission.student_id.not_in(skip))
    return list((await session.execute(stmt)).scalars().all())
