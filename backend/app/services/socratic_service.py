"""Socratic Service.

Session management, turn orchestration, outline revisions, and idempotency.
"""

from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, case, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.adapters import (
    AiConfigurationError,
    AiError,
    AiPort,
    AiTimeoutError,
    AiUnavailableError,
    create_ai_adapter,
)
from app.ai.prompt_assets import PromptAssetError, load_socratic_prompt
from app.ai.schemas import OutlineOp
from app.config import Settings, get_settings
from app.core.http import utcnow
from app.db.models import (
    AssignmentAccess,
    AssignmentRevision,
    ChatMessage,
    ChatRole,
    IdempotencyRecord,
    IdempotencyState,
    MessageStatus,
    OutlineInitStatus,
    OutlineRevision,
    OutlineRevisionStatus,
    SocraticSession,
    SocraticState,
    User,
    UserRole,
)
from app.workflows.outline_init import run_outline_init
from app.workflows.outline_ops import (
    OutlineOpError,
    apply_outline_ops,
    find_point,
    normalize_outline_content,
    proposals_as_dicts,
)
from app.workflows.socratic_graph import TurnResult, run_turn

OUTLINE_INIT_IDEMPOTENCY_KEY = "outline-init"

logger = logging.getLogger("edulit.socratic")

IDEMPOTENCY_TTL_HOURS = 24
RESERVATION_LEASE_SECONDS = 300
APPLY_FAILURE_MESSAGES = {
    "OUTLINE_VERSION_CONFLICT": (
        "Dàn ý vừa được cập nhật nên thầy/cô chưa áp dụng thao tác. "
        "Em xem lại canvas rồi nêu lại yêu cầu giúp thầy/cô nhé?"
    ),
    "OUTLINE_OP_AMBIGUOUS": (
        "Em muốn thêm, sửa hay xóa ý nào? "
        "Hãy chọn ý trên dàn ý hoặc nêu rõ vị trí giúp thầy/cô."
    ),
    "OUTLINE_OP_INVALID": (
        "Thao tác dàn ý chưa hợp lệ nên chưa được áp dụng. "
        "Em mô tả lại ý cần đổi được không?"
    ),
}
DISPLAYABLE_ASSISTANT_STATUSES = (MessageStatus.VALIDATED, MessageStatus.FALLBACK)
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 50


class SocraticServiceError(Exception):
    def __init__(self, message: str, code: str = "SOCRATIC_ERROR"):
        self.message = message
        self.code = code
        super().__init__(message)


class NotFoundError(SocraticServiceError):
    def __init__(self, message: str = "Resource not found", code: str = "NOT_FOUND"):
        super().__init__(message, code)


class ForbiddenError(SocraticServiceError):
    def __init__(self, message: str = "Access denied", code: str = "FORBIDDEN"):
        super().__init__(message, code)


class ConflictError(SocraticServiceError):
    def __init__(self, message: str = "Conflict", code: str = "CONFLICT"):
        super().__init__(message, code)


class AiUnavailableServiceError(SocraticServiceError):
    def __init__(self, message: str = "AI service not available", code: str = "AI_UNAVAILABLE"):
        super().__init__(message, code)


def _hash_key(key: str) -> str:
    """Current idempotency key digest (32 hex chars)."""
    return hashlib.sha256(key.encode()).hexdigest()[:32]


def _legacy_hash_key(key: str) -> str:
    """Pre-upgrade idempotency key digest (16 hex chars)."""
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def _key_hashes(key: str) -> tuple[str, ...]:
    modern = _hash_key(key)
    legacy = _legacy_hash_key(key)
    if modern == legacy:
        return (modern,)
    return (modern, legacy)


def _hash_payload(payload: str) -> str:
    return hashlib.sha256(payload.encode()).hexdigest()


def evaluate_readiness(content: dict[str, Any] | None, policy: dict[str, Any] | None) -> str:
    """READY | NOT_READY | INCONCLUSIVE.

    Empty/missing policy cannot be treated as ready. Chat-turn count is not used.
    """
    if not policy:
        return "INCONCLUSIVE"
    data = content or {}
    required_keys = policy.get("requiredContentKeys") or policy.get("required_content_keys") or []
    if not required_keys and "minSections" not in policy and "minArguments" not in policy:
        if "min_sections" not in policy and "min_arguments" not in policy:
            return "INCONCLUSIVE"
    for key in required_keys:
        value = data.get(key)
        if value in (None, "", [], {}):
            return "NOT_READY"
    min_sections = policy.get("minSections", policy.get("min_sections"))
    if min_sections:
        sections = data.get("sections") or []
        if not isinstance(sections, list) or len(sections) < int(min_sections):
            return "NOT_READY"
    min_arguments = policy.get("minArguments", policy.get("min_arguments"))
    if min_arguments:
        arguments = data.get("arguments") or []
        if not isinstance(arguments, list) or len(arguments) < int(min_arguments):
            return "NOT_READY"
    return "READY"


class SocraticService:
    def __init__(
        self,
        db: AsyncSession,
        settings: Settings | None = None,
        ai_port: AiPort | None = None,
    ):
        self.db = db
        self.settings = settings or get_settings()
        self._ai_port = ai_port
        # Optional test hooks for review/outline races (Events).
        self.after_review_load: Any = None
        self.hold_review: Any = None

    def _ensure_ai_port(self) -> AiPort:
        if self._ai_port is None:
            try:
                self._ai_port = create_ai_adapter(self.settings)
            except AiConfigurationError as exc:
                logger.error("AI configuration error provider=%s", exc.provider)
                raise AiUnavailableServiceError("AI service is not configured") from exc
        return self._ai_port

    @property
    def ai_port(self) -> AiPort:
        return self._ensure_ai_port()

    def _load_prompt(self, kind: str = "system"):
        try:
            return load_socratic_prompt(self.settings.SOCRATIC_PROMPT_VERSION, kind=kind)
        except PromptAssetError as exc:
            logger.error("prompt_asset_error version=%s kind=%s", exc.version, kind)
            raise AiUnavailableServiceError("Socratic prompt is not configured") from exc

    # ── Authorization ────────────────────────────────────────────────────────

    async def _get_access(
        self, assignment_id: uuid.UUID, student_id: uuid.UUID
    ) -> AssignmentAccess | None:
        result = await self.db.execute(
            select(AssignmentAccess).where(
                AssignmentAccess.assignment_revision_id == assignment_id,
                AssignmentAccess.student_id == student_id,
            )
        )
        return result.scalar_one_or_none()

    async def _require_assignment_access(
        self, assignment: AssignmentRevision, user: User, *, for_mutation: bool
    ) -> None:
        if assignment.status == "DRAFT":
            raise NotFoundError("Assignment not found or not available")
        access = await self._get_access(assignment.id, user.id)
        if access is None or access.revoked_at is not None:
            raise ForbiddenError("Assignment is not assigned to this student", "ACCESS_DENIED")
        if assignment.status == "CLOSED" and for_mutation:
            raise ConflictError("Assignment is closed", "ASSIGNMENT_CLOSED")

    async def _load_owned_session(
        self, session_id: uuid.UUID, user: User, *, for_mutation: bool
    ) -> SocraticSession:
        if user.role != UserRole.STUDENT:
            raise ForbiddenError("Only students can access Socratic sessions")
        result = await self.db.execute(
            select(SocraticSession).where(SocraticSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        if not session:
            raise NotFoundError("Session not found")
        if session.student_id != user.id:
            raise ForbiddenError("Access denied")
        assignment = session.assignment_revision
        await self._require_assignment_access(assignment, user, for_mutation=for_mutation)
        return session

    # ── Sessions ─────────────────────────────────────────────────────────────

    async def create_session(self, user: User, assignment_code: str) -> SocraticSession:
        if user.role != UserRole.STUDENT:
            raise ForbiddenError("Only students can create Socratic sessions")

        result = await self.db.execute(
            select(AssignmentRevision).where(AssignmentRevision.code == assignment_code)
        )
        assignment = result.scalar_one_or_none()
        if not assignment or assignment.status == "DRAFT":
            raise NotFoundError(
                f"Assignment with code '{assignment_code}' not found or not available"
            )
        if assignment.status != "PUBLISHED":
            raise NotFoundError(
                f"Assignment with code '{assignment_code}' not found or not available"
            )

        await self._require_assignment_access(assignment, user, for_mutation=True)

        existing = await self.db.execute(
            select(SocraticSession).where(
                SocraticSession.student_id == user.id,
                SocraticSession.assignment_revision_id == assignment.id,
            )
        )
        if existing.scalar_one_or_none():
            raise ConflictError("Session already exists for this assignment")

        session = SocraticSession(
            student_id=user.id,
            assignment_revision_id=assignment.id,
            state=SocraticState.INIT,
            outline_version=0,
        )
        self.db.add(session)
        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise ConflictError("Session already exists for this assignment") from exc
        await self.db.refresh(session)
        logger.info("socratic session created session_id=%s", session.id)
        return session

    async def get_session(self, session_id: uuid.UUID, user: User) -> SocraticSession:
        return await self._load_owned_session(session_id, user, for_mutation=False)

    async def list_sessions(self, user: User) -> list[SocraticSession]:
        if user.role != UserRole.STUDENT:
            raise ForbiddenError("Only students can list Socratic sessions")
        result = await self.db.execute(
            select(SocraticSession)
            .join(
                AssignmentAccess,
                and_(
                    AssignmentAccess.assignment_revision_id
                    == SocraticSession.assignment_revision_id,
                    AssignmentAccess.student_id == SocraticSession.student_id,
                    AssignmentAccess.revoked_at.is_(None),
                ),
            )
            .where(SocraticSession.student_id == user.id)
            .order_by(SocraticSession.created_at.desc())
        )
        return list(result.scalars().all())

    async def find_session_by_assignment(
        self, user: User, assignment_code: str
    ) -> SocraticSession | None:
        """Find existing session for a specific assignment code."""
        if user.role != UserRole.STUDENT:
            raise ForbiddenError("Only students can access Socratic sessions")

        # Find the assignment revision by code
        result = await self.db.execute(
            select(AssignmentRevision).where(AssignmentRevision.code == assignment_code)
        )
        assignment = result.scalar_one_or_none()
        if not assignment:
            return None

        # Find session for this assignment and student
        result = await self.db.execute(
            select(SocraticSession).where(
                SocraticSession.student_id == user.id,
                SocraticSession.assignment_revision_id == assignment.id,
            )
        )
        return result.scalar_one_or_none()

    # ── Messages / pagination ────────────────────────────────────────────────

    def _clamp_limit(self, limit: int | None) -> int:
        if limit is None:
            return DEFAULT_PAGE_SIZE
        if limit < 1 or limit > MAX_PAGE_SIZE:
            raise SocraticServiceError(
                f"limit must be between 1 and {MAX_PAGE_SIZE}", "VALIDATION"
            )
        return limit

    async def get_messages(
        self,
        session_id: uuid.UUID,
        user: User,
        limit: int = DEFAULT_PAGE_SIZE,
        before_turn: int | None = None,
    ) -> tuple[list[ChatMessage], bool, int | None]:
        """Return displayable messages, paginated by whole turns.

        Includes student messages and assistant VALIDATED/FALLBACK messages.
        REJECTED/PENDING assistant output is never returned.
        Order: turn_id ASC, student before assistant, created_at, id.
        """
        await self._load_owned_session(session_id, user, for_mutation=False)
        page_size = self._clamp_limit(limit)

        turn_query = (
            select(ChatMessage.turn_id)
            .where(ChatMessage.session_id == session_id)
            .where(
                or_(
                    ChatMessage.role == ChatRole.STUDENT,
                    ChatMessage.status.in_(DISPLAYABLE_ASSISTANT_STATUSES),
                )
            )
            .distinct()
        )
        if before_turn is not None:
            turn_query = turn_query.where(ChatMessage.turn_id < before_turn)
        turn_query = turn_query.order_by(ChatMessage.turn_id.desc()).limit(page_size + 1)
        turn_rows = (await self.db.execute(turn_query)).scalars().all()
        has_more = len(turn_rows) > page_size
        turn_ids = list(reversed(turn_rows[:page_size]))
        if not turn_ids:
            return [], False, None

        msg_query = (
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .where(ChatMessage.turn_id.in_(turn_ids))
            .where(
                or_(
                    ChatMessage.role == ChatRole.STUDENT,
                    ChatMessage.status.in_(DISPLAYABLE_ASSISTANT_STATUSES),
                )
            )
            .order_by(
                ChatMessage.turn_id.asc(),
                case((ChatMessage.role == ChatRole.STUDENT, 0), else_=1),
                ChatMessage.created_at.asc(),
                ChatMessage.id.asc(),
            )
        )
        messages = list((await self.db.execute(msg_query)).scalars().all())
        next_cursor = min(turn_ids) if has_more else None
        return messages, has_more, next_cursor

    # ── Turn processing ──────────────────────────────────────────────────────

    def _route(self, session_id: uuid.UUID) -> str:
        return f"/socratic-sessions/{session_id}/messages"

    def _outline_init_route(self, session_id: uuid.UUID) -> str:
        return f"/socratic-sessions/{session_id}/outline-init"

    def _turn_payload_text(
        self,
        student_input: str,
        selected_point_id: str | None,
        selected_section_id: str | None,
    ) -> str:
        if not selected_point_id and not selected_section_id:
            return student_input
        import json as _json

        return _json.dumps(
            {
                "content": student_input,
                "selectedPointId": selected_point_id or "",
                "selectedSectionId": selected_section_id or "",
            },
            ensure_ascii=False,
            sort_keys=True,
        )

    def _resolve_selected_point(
        self,
        outline: dict[str, Any] | None,
        selected_point_id: str | None,
        selected_section_id: str | None,
    ) -> dict[str, Any] | None:
        if not selected_point_id or not outline:
            return None
        content = normalize_outline_content(outline)
        point, index, section = find_point(content, selected_point_id, selected_section_id)
        if point is None or section is None:
            return None
        return {
            "id": point.get("id"),
            "text": point.get("text"),
            "kind": point.get("kind"),
            "section_id": section.get("id"),
            "index": index,
        }

    async def process_turn(
        self,
        session_id: uuid.UUID,
        user: User,
        student_input: str,
        request_id: str | None = None,
        idempotency_key: str | None = None,
        selected_point_id: str | None = None,
        selected_section_id: str | None = None,
        expected_outline_version: int | None = None,
    ) -> tuple[ChatMessage, TurnResult]:
        session = await self._load_owned_session(session_id, user, for_mutation=True)
        payload_text = self._turn_payload_text(
            student_input, selected_point_id, selected_section_id
        )
        selected_point: dict[str, Any] | None = None

        record: IdempotencyRecord | None = None
        if idempotency_key:
            replay = await self._lookup_idempotency(
                user.id, session_id, idempotency_key, payload_text
            )
            if replay is not None:
                return replay

            record = await self._get_idempotency_row(user.id, session_id, idempotency_key)

        self._ensure_ai_port()
        prompt_asset = self._load_prompt()

        reservation_token = uuid.uuid4()
        reserved = await self._try_reserve_turn(session.id, reservation_token)
        if not reserved:
            raise ConflictError(
                "Another turn is currently processing. Please try again.",
                "TURN_IN_PROGRESS",
            )

        recover_turn_id: int | None = None
        recover_student_id: uuid.UUID | None = None
        if record is not None and record.state in {
            IdempotencyState.FAILED,
            IdempotencyState.PROCESSING,
        }:
            cached = record.cached_response or {}
            if cached.get("turn_id") is not None:
                recover_turn_id = int(cached["turn_id"])
            if cached.get("student_message_id"):
                recover_student_id = uuid.UUID(str(cached["student_message_id"]))

        try:
            if idempotency_key:
                record = await self._upsert_idempotency_processing(
                    user.id, session_id, idempotency_key, payload_text, record
                )

            if recover_turn_id is not None:
                turn_id = recover_turn_id
            else:
                turn_id = await self._get_next_turn_id(session_id)

            if recover_student_id is None:
                student_msg = ChatMessage(
                    session_id=session_id,
                    turn_id=turn_id,
                    role=ChatRole.STUDENT,
                    content=student_input,
                    status=MessageStatus.VALIDATED,
                )
                self.db.add(student_msg)
                await self.db.flush()
                recover_student_id = student_msg.id
            else:
                student_msg = await self.db.get(ChatMessage, recover_student_id)
                if student_msg is None:
                    student_msg = ChatMessage(
                        session_id=session_id,
                        turn_id=turn_id,
                        role=ChatRole.STUDENT,
                        content=student_input,
                        status=MessageStatus.VALIDATED,
                    )
                    self.db.add(student_msg)
                    await self.db.flush()
                    recover_student_id = student_msg.id

            await self.db.execute(
                update(SocraticSession)
                .where(
                    SocraticSession.id == session_id,
                    SocraticSession.reservation_token == reservation_token,
                )
                .values(processing_turn=turn_id, updated_at=utcnow())
            )
            if record is not None:
                record.cached_response = {
                    "turn_id": turn_id,
                    "student_message_id": str(recover_student_id),
                }
                record.updated_at = utcnow()

            context = await self._load_session_context(session, exclude_turn_id=turn_id)
            selected_point = self._resolve_selected_point(
                context.get("current_outline"),
                selected_point_id,
                selected_section_id,
            )
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            await self._release_reservation(session_id, reservation_token)
            raise

        try:
            result = await run_turn(
                session_id=str(session_id),
                student_id=str(user.id),
                assignment_revision_id=str(session.assignment_revision_id),
                current_state=session.state.value,
                student_input=student_input,
                rubric=context["rubric"],
                context_chunks=context["context_chunks"],
                instructions=context.get("instructions") or {},
                current_outline=context.get("current_outline"),
                chat_history=context.get("chat_history") or [],
                ai_port=self.ai_port,
                prompt_asset=prompt_asset,
                max_output_tokens=self.settings.AI_MAX_OUTPUT_TOKENS,
                selected_point=selected_point,
            )
        except (AiUnavailableError, AiTimeoutError, AiConfigurationError, AiError) as exc:
            await self._fail_inflight(
                session_id, reservation_token, record.id if record else None
            )
            raise AiUnavailableServiceError("AI provider is unavailable") from exc
        except Exception:
            await self._fail_inflight(
                session_id, reservation_token, record.id if record else None
            )
            raise

        ai_msg = await self._finalize_turn(
            session_id=session_id,
            user_id=user.id,
            reservation_token=reservation_token,
            turn_id=turn_id,
            result=result,
            idempotency_id=record.id if record else None,
            selected_point=selected_point,
            expected_outline_version=expected_outline_version,
        )
        return ai_msg, result

    async def _lookup_idempotency(
        self,
        user_id: uuid.UUID,
        session_id: uuid.UUID,
        key: str,
        payload: str,
    ) -> tuple[ChatMessage, TurnResult] | None:
        record = await self._get_idempotency_row(user_id, session_id, key)
        if record is None:
            return None
        payload_hash = _hash_payload(payload)
        if record.request_hash != payload_hash:
            raise ConflictError(
                "Idempotency key reused with different payload for same session",
                "IDEMPOTENCY_PAYLOAD_MISMATCH",
            )
        now = utcnow()
        if record.expires_at <= now:
            return None
        if record.state == IdempotencyState.COMPLETED and record.resource_id:
            msg = await self.db.get(ChatMessage, record.resource_id)
            if msg is None:
                return None
            session = await self.db.get(SocraticSession, session_id)
            meta = msg.turn_meta or {}
            cached = record.cached_response or {}
            return msg, TurnResult(
                message=msg.content,
                status=msg.status.value,  # type: ignore[arg-type]
                suggested_state=(session.state.value if session else "INIT"),
                sources=msg.sources or [],
                prompt_version=msg.prompt_version or "",
                prompt_hash=msg.prompt_hash or "",
                schema_version=msg.schema_version or "",
                model=msg.model or "",
                intent=meta.get("intent") or cached.get("intent"),
                outline_ops=[],
                proposals=meta.get("proposals") or cached.get("proposals") or [],
                applied_ops=meta.get("appliedOps") or cached.get("applied_ops") or [],
                outline_changed=False,
                outline_version=meta.get("outlineVersion") or cached.get("outline_version"),
                clarification_reason=meta.get("clarificationReason"),
            )
        if record.state == IdempotencyState.PROCESSING:
            session = await self.db.get(SocraticSession, session_id)
            lease_valid = (
                session is not None
                and session.reservation_token is not None
                and session.reservation_expires_at is not None
                and session.reservation_expires_at > now
            )
            if lease_valid:
                raise ConflictError(
                    "This request is still processing",
                    "IDEMPOTENCY_IN_PROGRESS",
                )
            return None
        if record.state == IdempotencyState.FAILED:
            return None
        return None

    async def _get_idempotency_row(
        self, user_id: uuid.UUID, session_id: uuid.UUID, key: str
    ) -> IdempotencyRecord | None:
        hashes = _key_hashes(key)
        result = await self.db.execute(
            select(IdempotencyRecord).where(
                IdempotencyRecord.user_id == user_id,
                IdempotencyRecord.route == self._route(session_id),
                IdempotencyRecord.key_hash.in_(hashes),
            )
        )
        rows = list(result.scalars().all())
        if not rows:
            return None
        modern = _hash_key(key)

        def _rank(row: IdempotencyRecord) -> tuple[int, int]:
            completed = 1 if row.state == IdempotencyState.COMPLETED else 0
            current_hash = 1 if row.key_hash == modern else 0
            return (completed, current_hash)

        rows.sort(key=_rank, reverse=True)
        return rows[0]

    async def _upsert_idempotency_processing(
        self,
        user_id: uuid.UUID,
        session_id: uuid.UUID,
        key: str,
        payload: str,
        existing: IdempotencyRecord | None,
    ) -> IdempotencyRecord:
        now = utcnow()
        expires = now + timedelta(hours=IDEMPOTENCY_TTL_HOURS)
        if existing is not None:
            existing.state = IdempotencyState.PROCESSING
            existing.request_hash = _hash_payload(payload)
            existing.expires_at = expires
            existing.updated_at = now
            existing.resource_id = existing.resource_id
            await self.db.flush()
            return existing
        record = IdempotencyRecord(
            user_id=user_id,
            route=self._route(session_id),
            key_hash=_hash_key(key),
            request_hash=_hash_payload(payload),
            state=IdempotencyState.PROCESSING,
            expires_at=expires,
        )
        self.db.add(record)
        try:
            async with self.db.begin_nested():
                await self.db.flush()
            return record
        except IntegrityError as exc:
            existing = await self._get_idempotency_row(user_id, session_id, key)
            if existing is None:
                raise ConflictError(
                    "This request is still processing",
                    "IDEMPOTENCY_IN_PROGRESS",
                ) from exc
            if existing.state == IdempotencyState.COMPLETED and existing.resource_id:
                raise ConflictError(
                    "This request is still processing",
                    "IDEMPOTENCY_IN_PROGRESS",
                ) from exc
            raise ConflictError(
                "This request is still processing",
                "IDEMPOTENCY_IN_PROGRESS",
            ) from exc

    async def _try_reserve_turn(
        self, session_id: uuid.UUID, token: uuid.UUID
    ) -> bool:
        now = utcnow()
        expires = now + timedelta(seconds=RESERVATION_LEASE_SECONDS)
        result = await self.db.execute(
            update(SocraticSession)
            .where(
                SocraticSession.id == session_id,
                or_(
                    SocraticSession.reservation_token.is_(None),
                    SocraticSession.reservation_expires_at.is_(None),
                    SocraticSession.reservation_expires_at <= now,
                ),
            )
            .values(
                reservation_token=token,
                reservation_expires_at=expires,
                processing_turn=0,
                updated_at=now,
            )
            .returning(SocraticSession.id)
        )
        return result.one_or_none() is not None

    async def _release_reservation(
        self, session_id: uuid.UUID, token: uuid.UUID
    ) -> None:
        try:
            await self.db.execute(
                update(SocraticSession)
                .where(
                    SocraticSession.id == session_id,
                    SocraticSession.reservation_token == token,
                )
                .values(
                    reservation_token=None,
                    reservation_expires_at=None,
                    processing_turn=None,
                    updated_at=utcnow(),
                )
            )
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            logger.error("failed_to_release_reservation session_id=%s", session_id)

    async def _fail_inflight(
        self,
        session_id: uuid.UUID,
        token: uuid.UUID,
        idempotency_id: uuid.UUID | None,
    ) -> None:
        if self.db.in_transaction():
            await self.db.rollback()
        now = utcnow()
        claimed = await self.db.execute(
            update(SocraticSession)
            .where(
                SocraticSession.id == session_id,
                SocraticSession.reservation_token == token,
            )
            .values(
                reservation_token=None,
                reservation_expires_at=None,
                processing_turn=None,
                updated_at=now,
            )
            .returning(SocraticSession.id)
        )
        still_holds_lease = claimed.one_or_none() is not None
        if still_holds_lease and idempotency_id is not None:
            await self.db.execute(
                update(IdempotencyRecord)
                .where(
                    IdempotencyRecord.id == idempotency_id,
                    IdempotencyRecord.state == IdempotencyState.PROCESSING,
                )
                .values(state=IdempotencyState.FAILED, updated_at=now)
            )
        await self.db.commit()

    async def _finalize_turn(
        self,
        *,
        session_id: uuid.UUID,
        user_id: uuid.UUID,
        reservation_token: uuid.UUID,
        turn_id: int,
        result: TurnResult,
        idempotency_id: uuid.UUID | None,
        selected_point: dict[str, Any] | None = None,
        expected_outline_version: int | None = None,
    ) -> ChatMessage:
        now = utcnow()
        try:
            claimed = await self.db.execute(
                update(SocraticSession)
                .where(
                    SocraticSession.id == session_id,
                    SocraticSession.reservation_token == reservation_token,
                )
                .values(
                    last_message_at=now,
                    updated_at=now,
                    version=SocraticSession.version + 1,
                )
                .returning(SocraticSession.id, SocraticSession.state)
            )
            row = claimed.one_or_none()
            if row is None:
                raise ConflictError(
                    "Reservation is no longer held by this worker",
                    "STALE_RESERVATION",
                )

            status = MessageStatus(result.status.upper())
            if status == MessageStatus.VALIDATED:
                await self._apply_turn_outline_changes(
                    session_id,
                    result,
                    selected_point=selected_point,
                    expected_outline_version=expected_outline_version,
                )
            turn_meta = {
                "intent": result.intent,
                "appliedOps": result.applied_ops,
                "proposals": proposals_as_dicts(result.proposals),
                "outlineChanged": result.outline_changed,
                "outlineVersion": result.outline_version,
                "clarificationReason": result.clarification_reason,
            }
            ai_msg = ChatMessage(
                session_id=session_id,
                turn_id=turn_id,
                role=ChatRole.ASSISTANT,
                content=result.message,
                sources=result.sources if status == MessageStatus.VALIDATED else [],
                status=status,
                provider=self.ai_port.provider_name,
                model=result.model or self.ai_port.model_name,
                prompt_version=result.prompt_version or self.settings.SOCRATIC_PROMPT_VERSION,
                prompt_hash=result.prompt_hash or None,
                schema_version=result.schema_version or None,
                turn_meta=turn_meta,
            )
            self.db.add(ai_msg)
            await self.db.flush()

            if result.suggested_state:
                session = await self.db.get(SocraticSession, session_id)
                if session is not None:
                    await self._try_transition_state(session, result.suggested_state)

            await self.db.execute(
                update(SocraticSession)
                .where(
                    SocraticSession.id == session_id,
                    SocraticSession.reservation_token == reservation_token,
                )
                .values(
                    reservation_token=None,
                    reservation_expires_at=None,
                    processing_turn=None,
                    updated_at=utcnow(),
                )
            )
            if idempotency_id is not None:
                await self.db.execute(
                    update(IdempotencyRecord)
                    .where(IdempotencyRecord.id == idempotency_id)
                    .values(
                        state=IdempotencyState.COMPLETED,
                        resource_id=ai_msg.id,
                        cached_response=result.model_dump(),
                        updated_at=utcnow(),
                    )
                )
            await self.db.commit()
            await self.db.refresh(ai_msg)
            logger.info(
                "turn processed session_id=%s turn_id=%s status=%s",
                session_id,
                turn_id,
                result.status,
            )
            return ai_msg
        except ConflictError:
            await self.db.rollback()
            raise
        except IntegrityError as exc:
            await self.db.rollback()
            raise ConflictError("Turn already finalized", "CONFLICT") from exc
        except Exception:
            await self.db.rollback()
            await self._fail_inflight(session_id, reservation_token, idempotency_id)
            raise

    async def _get_next_turn_id(self, session_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.max(ChatMessage.turn_id)).where(ChatMessage.session_id == session_id)
        )
        last_turn = result.scalar_one_or_none()
        return int(last_turn or 0) + 1

    async def _current_outline_content(self, session: SocraticSession) -> dict[str, Any] | None:
        if session.outline_version == 0:
            return None
        result = await self.db.execute(
            select(OutlineRevision).where(
                OutlineRevision.session_id == session.id,
                OutlineRevision.revision == session.outline_version,
            )
        )
        row = result.scalar_one_or_none()
        return row.content if row is not None else None

    async def _cas_insert_outline(
        self,
        session_id: uuid.UUID,
        expected_version: int,
        content: dict[str, Any],
        *,
        author: str,
        source_refs: list[dict] | None = None,
        next_state: SocraticState | None = None,
    ) -> OutlineRevision | None:
        """Insert a new ACCEPTED revision if outline_version still matches.

        Returns None on CAS miss (caller must not treat it as applied).
        """
        new_revision_no = expected_version + 1
        now = utcnow()
        values: dict[str, Any] = {
            "outline_version": new_revision_no,
            "version": SocraticSession.version + 1,
            "updated_at": now,
            "outline_init_status": OutlineInitStatus.COMPLETED.value,
        }
        if next_state is not None:
            values["state"] = next_state
        cas = await self.db.execute(
            update(SocraticSession)
            .where(
                SocraticSession.id == session_id,
                SocraticSession.outline_version == expected_version,
            )
            .values(**values)
            .returning(SocraticSession.id)
        )
        if cas.one_or_none() is None:
            return None
        await self.db.execute(
            update(OutlineRevision)
            .where(
                OutlineRevision.session_id == session_id,
                OutlineRevision.review_status == OutlineRevisionStatus.ACCEPTED,
            )
            .values(review_status=OutlineRevisionStatus.SUPERSEDED)
        )
        revision = OutlineRevision(
            session_id=session_id,
            revision=new_revision_no,
            content=content,
            author=author,
            source_refs=source_refs,
            review_status=OutlineRevisionStatus.ACCEPTED,
        )
        self.db.add(revision)
        await self.db.flush()
        return revision

    def _mark_apply_failure(self, result: TurnResult, reason: str) -> None:
        result.clarification_reason = reason
        result.applied_ops = []
        result.outline_changed = False
        result.outline_ops = []
        result.intent = "CLARIFY"
        result.message = APPLY_FAILURE_MESSAGES.get(
            reason,
            "Thầy/cô chưa áp dụng thay đổi. Em nói rõ hơn ý cần chỉnh được không?",
        )

    async def _apply_turn_outline_changes(
        self,
        session_id: uuid.UUID,
        result: TurnResult,
        *,
        selected_point: dict[str, Any] | None,
        expected_outline_version: int | None,
    ) -> None:
        intent = (result.intent or "").upper()
        raw_ops = result.outline_ops or []
        if intent not in {"EDIT", "MIXED"} or not raw_ops:
            result.applied_ops = []
            result.outline_changed = False
            if intent == "PROPOSE":
                result.proposals = proposals_as_dicts(result.proposals)
            return

        session = await self.db.get(SocraticSession, session_id)
        if session is None:
            return
        loaded_version = session.outline_version
        if expected_outline_version is not None and expected_outline_version != loaded_version:
            self._mark_apply_failure(result, "OUTLINE_VERSION_CONFLICT")
            return

        ops: list[OutlineOp] = []
        for item in raw_ops:
            try:
                ops.append(item if isinstance(item, OutlineOp) else OutlineOp.model_validate(item))
            except Exception:
                self._mark_apply_failure(result, "OUTLINE_OP_INVALID")
                return

        current = await self._current_outline_content(session)
        try:
            new_content, applied = apply_outline_ops(
                current, ops, selected_point=selected_point
            )
        except OutlineOpError as exc:
            self._mark_apply_failure(result, exc.code)
            return

        if not applied:
            result.applied_ops = []
            result.outline_changed = False
            return

        next_state = None
        if session.state in {SocraticState.INIT, SocraticState.THESIS}:
            next_state = SocraticState.OUTLINE
        revision = await self._cas_insert_outline(
            session_id,
            loaded_version,
            new_content,
            author="ASSISTANT",
            source_refs=result.sources or None,
            next_state=next_state,
        )
        if revision is None:
            self._mark_apply_failure(result, "OUTLINE_VERSION_CONFLICT")
            return
        result.applied_ops = applied
        result.outline_changed = True
        result.outline_version = revision.revision
        result.proposals = proposals_as_dicts(result.proposals) if intent == "MIXED" else []

    async def _try_transition_state(self, session: SocraticSession, new_state: str) -> bool:
        valid_transitions = {
            SocraticState.INIT: [SocraticState.THESIS, SocraticState.OUTLINE],
            SocraticState.THESIS: [SocraticState.OUTLINE, SocraticState.INIT],
            SocraticState.OUTLINE: [SocraticState.REVIEW, SocraticState.THESIS],
            SocraticState.REVIEW: [SocraticState.OUTLINE],
        }
        try:
            target = SocraticState(new_state)
        except ValueError:
            return False
        if target not in valid_transitions.get(session.state, []):
            return False
        if target == SocraticState.REVIEW:
            outline = await self._current_outline_content(session)
            assignment = session.assignment_revision
            if assignment is None:
                assignment = await self.db.get(
                    AssignmentRevision, session.assignment_revision_id
                )
            policy = (assignment.readiness_policy if assignment is not None else None) or {}
            readiness = evaluate_readiness(outline, policy)
            if readiness != "READY":
                logger.info(
                    "reject REVIEW transition session_id=%s readiness=%s",
                    session.id,
                    readiness,
                )
                return False
        session.state = target
        return True

    async def _load_session_context(
        self, session: SocraticSession, exclude_turn_id: int | None = None
    ) -> dict[str, Any]:
        revision = session.assignment_revision
        current_outline_content = await self._current_outline_content(session)
        history_q = (
            select(ChatMessage)
            .where(ChatMessage.session_id == session.id)
            .where(
                or_(
                    ChatMessage.role == ChatRole.STUDENT,
                    ChatMessage.status.in_(DISPLAYABLE_ASSISTANT_STATUSES),
                )
            )
        )
        if exclude_turn_id is not None:
            history_q = history_q.where(ChatMessage.turn_id != exclude_turn_id)
        history_q = history_q.order_by(
            ChatMessage.turn_id.desc(),
            ChatMessage.created_at.desc(),
            ChatMessage.id.desc(),
        ).limit(20)
        chat_history = list((await self.db.execute(history_q)).scalars().all())
        chat_history.sort(
            key=lambda m: (
                m.turn_id,
                0 if m.role == ChatRole.STUDENT else 1,
                m.created_at,
                m.id,
            )
        )
        return {
            "rubric": revision.rubric or {},
            "context_chunks": revision.context_chunks or [],
            "instructions": revision.instructions or {},
            "current_outline": current_outline_content,
            "chat_history": [
                {"turn_id": m.turn_id, "role": m.role.value, "content": m.content}
                for m in chat_history
            ],
        }

    # ── Outline ──────────────────────────────────────────────────────────────

    async def update_outline(
        self,
        session_id: uuid.UUID,
        user: User,
        content: dict[str, Any],
        expected_version: int,
    ) -> OutlineRevision:
        session = await self._load_owned_session(session_id, user, for_mutation=True)
        content = normalize_outline_content(content)
        new_revision_no = expected_version + 1
        now = utcnow()
        cas = await self.db.execute(
            update(SocraticSession)
            .where(
                SocraticSession.id == session_id,
                SocraticSession.outline_version == expected_version,
            )
            .values(
                outline_version=new_revision_no,
                version=SocraticSession.version + 1,
                updated_at=now,
                state=(
                    SocraticState.OUTLINE
                    if session.state == SocraticState.REVIEW
                    else session.state
                ),
            )
            .returning(SocraticSession.id)
        )
        if cas.one_or_none() is None:
            current = (
                await self.db.execute(
                    select(SocraticSession.outline_version).where(
                        SocraticSession.id == session_id
                    )
                )
            ).scalar_one()
            raise ConflictError(
                f"Version conflict: expected {expected_version}, found {current}",
                "OUTLINE_VERSION_CONFLICT",
            )

        await self.db.execute(
            update(OutlineRevision)
            .where(
                OutlineRevision.session_id == session_id,
                OutlineRevision.review_status == OutlineRevisionStatus.ACCEPTED,
            )
            .values(review_status=OutlineRevisionStatus.SUPERSEDED)
        )
        revision = OutlineRevision(
            session_id=session_id,
            revision=new_revision_no,
            content=content,
            author="STUDENT",
            review_status=OutlineRevisionStatus.ACCEPTED,
        )
        self.db.add(revision)
        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise ConflictError(
                "Outline revision conflict",
                "OUTLINE_VERSION_CONFLICT",
            ) from exc
        await self.db.refresh(revision)
        return revision

    async def ensure_initial_outline(
        self,
        session_id: uuid.UUID,
        user: User,
        *,
        retry: bool = False,
    ) -> tuple[OutlineRevision | None, str, str | None]:
        """Create the first outline once per session.

        Concurrent callers: one worker generates; others get IN_PROGRESS or
        the already-saved revision. Never overwrites outline_version > 0.
        AI failure stores FAILED with no fake outline.
        """
        session = await self._load_owned_session(session_id, user, for_mutation=True)

        if session.outline_version > 0:
            outline = await self.get_current_outline(session_id, user)
            return outline, OutlineInitStatus.COMPLETED.value, None

        status = (session.outline_init_status or OutlineInitStatus.NONE.value).upper()
        now = utcnow()
        lease_valid = (
            session.reservation_token is not None
            and session.reservation_expires_at is not None
            and session.reservation_expires_at > now
        )
        if status == OutlineInitStatus.PROCESSING.value and lease_valid:
            raise ConflictError(
                "Outline is still being generated",
                "OUTLINE_INIT_IN_PROGRESS",
            )
        if status == OutlineInitStatus.NEEDS_CLARIFICATION.value and not retry:
            return None, status, None
        if status == OutlineInitStatus.COMPLETED.value:
            return None, status, None

        self._ensure_ai_port()
        prompt_asset = self._load_prompt("outline-init")
        reservation_token = uuid.uuid4()
        allowed_status = [
            OutlineInitStatus.NONE.value,
            OutlineInitStatus.FAILED.value,
            OutlineInitStatus.PROCESSING.value,
        ]
        if retry:
            allowed_status.append(OutlineInitStatus.NEEDS_CLARIFICATION.value)

        claimed = await self.db.execute(
            update(SocraticSession)
            .where(
                SocraticSession.id == session_id,
                SocraticSession.outline_version == 0,
                SocraticSession.outline_init_status.in_(allowed_status),
                or_(
                    SocraticSession.reservation_token.is_(None),
                    SocraticSession.reservation_expires_at.is_(None),
                    SocraticSession.reservation_expires_at <= now,
                ),
            )
            .values(
                reservation_token=reservation_token,
                reservation_expires_at=now + timedelta(seconds=RESERVATION_LEASE_SECONDS),
                outline_init_status=OutlineInitStatus.PROCESSING.value,
                updated_at=now,
            )
            .returning(SocraticSession.id)
        )
        if claimed.one_or_none() is None:
            await self.db.commit()
            session = await self.db.get(SocraticSession, session_id)
            if session and session.outline_version > 0:
                outline = await self.get_current_outline(session_id, user)
                return outline, OutlineInitStatus.COMPLETED.value, None
            raise ConflictError(
                "Outline is still being generated",
                "OUTLINE_INIT_IN_PROGRESS",
            )

        assignment = session.assignment_revision
        await self.db.commit()

        max_tokens = max(int(self.settings.AI_MAX_OUTPUT_TOKENS or 512), 2048)
        try:
            init_result = await run_outline_init(
                title=assignment.title,
                instructions=assignment.instructions or {},
                rubric=assignment.rubric or {},
                context_chunks=assignment.context_chunks or [],
                ai_port=self.ai_port,
                prompt_asset=prompt_asset,
                max_output_tokens=max_tokens,
            )
        except (AiUnavailableError, AiTimeoutError, AiConfigurationError, AiError) as exc:
            await self._fail_outline_init(session_id, reservation_token)
            raise AiUnavailableServiceError("AI provider is unavailable") from exc
        except Exception:
            await self._fail_outline_init(session_id, reservation_token)
            raise

        try:
            return await self._finalize_outline_init(
                session_id=session_id,
                reservation_token=reservation_token,
                init_result=init_result,
            )
        except ForbiddenError:
            raise
        except ConflictError as exc:
            if exc.code == "ASSIGNMENT_CLOSED":
                raise
            if self.db.in_transaction():
                await self.db.rollback()
            await self._release_reservation(session_id, reservation_token)
            outline = await self.get_current_outline(session_id, user)
            if outline is not None:
                return outline, OutlineInitStatus.COMPLETED.value, None
            raise ConflictError(
                "Outline is still being generated",
                "OUTLINE_INIT_IN_PROGRESS",
            )
        except IntegrityError:
            if self.db.in_transaction():
                await self.db.rollback()
            await self._release_reservation(session_id, reservation_token)
            outline = await self.get_current_outline(session_id, user)
            if outline is not None:
                return outline, OutlineInitStatus.COMPLETED.value, None
            raise ConflictError(
                "Outline is still being generated",
                "OUTLINE_INIT_IN_PROGRESS",
            )

    async def _fail_outline_init(
        self, session_id: uuid.UUID, token: uuid.UUID
    ) -> None:
        if self.db.in_transaction():
            await self.db.rollback()
        now = utcnow()
        await self.db.execute(
            update(SocraticSession)
            .where(
                SocraticSession.id == session_id,
                SocraticSession.reservation_token == token,
                SocraticSession.outline_version == 0,
            )
            .values(
                reservation_token=None,
                reservation_expires_at=None,
                processing_turn=None,
                outline_init_status=OutlineInitStatus.FAILED.value,
                updated_at=now,
            )
        )
        await self.db.commit()

    async def _abort_outline_init(
        self,
        session_id: uuid.UUID,
        reservation_token: uuid.UUID,
        *,
        status: str,
    ) -> None:
        now = utcnow()
        await self.db.execute(
            update(SocraticSession)
            .where(
                SocraticSession.id == session_id,
                SocraticSession.reservation_token == reservation_token,
                SocraticSession.outline_version == 0,
            )
            .values(
                reservation_token=None,
                reservation_expires_at=None,
                processing_turn=None,
                outline_init_status=status,
                updated_at=now,
            )
        )
        await self.db.commit()

    async def _finalize_outline_init(
        self,
        *,
        session_id: uuid.UUID,
        reservation_token: uuid.UUID,
        init_result: Any,
    ) -> tuple[OutlineRevision | None, str, str | None]:
        now = utcnow()
        claimed = await self.db.execute(
            update(SocraticSession)
            .where(
                SocraticSession.id == session_id,
                SocraticSession.reservation_token == reservation_token,
                SocraticSession.outline_version == 0,
                SocraticSession.reservation_expires_at > now,
            )
            .values(updated_at=now)
            .returning(
                SocraticSession.id,
                SocraticSession.state,
                SocraticSession.student_id,
                SocraticSession.assignment_revision_id,
            )
        )
        row = claimed.one_or_none()
        if row is None:
            raise ConflictError(
                "Reservation is no longer held by this worker",
                "STALE_RESERVATION",
            )

        student_id = row.student_id
        assignment_id = row.assignment_revision_id
        assignment = (
            await self.db.execute(
                select(AssignmentRevision)
                .where(AssignmentRevision.id == assignment_id)
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        access = (
            await self.db.execute(
                select(AssignmentAccess)
                .where(
                    AssignmentAccess.assignment_revision_id == assignment_id,
                    AssignmentAccess.student_id == student_id,
                )
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if access is None or access.revoked_at is not None:
            await self._abort_outline_init(
                session_id, reservation_token, status=OutlineInitStatus.FAILED.value
            )
            raise ForbiddenError("Assignment is not assigned to this student", "ACCESS_DENIED")
        if assignment is None or assignment.status != "PUBLISHED":
            await self._abort_outline_init(
                session_id, reservation_token, status=OutlineInitStatus.FAILED.value
            )
            raise ConflictError("Assignment is closed", "ASSIGNMENT_CLOSED")

        if init_result.needs_clarification or init_result.status == "NEEDS_CLARIFICATION":
            turn_id = await self._get_next_turn_id(session_id)
            msg = ChatMessage(
                session_id=session_id,
                turn_id=turn_id,
                role=ChatRole.ASSISTANT,
                content=init_result.message,
                sources=[],
                status=MessageStatus.VALIDATED,
                provider=self.ai_port.provider_name,
                model=init_result.model or self.ai_port.model_name,
                prompt_version=init_result.prompt_version or None,
                prompt_hash=init_result.prompt_hash or None,
                schema_version=init_result.schema_version or None,
                turn_meta={"intent": "CLARIFY", "outlineChanged": False},
            )
            self.db.add(msg)
            await self.db.execute(
                update(SocraticSession)
                .where(
                    SocraticSession.id == session_id,
                    SocraticSession.reservation_token == reservation_token,
                )
                .values(
                    reservation_token=None,
                    reservation_expires_at=None,
                    processing_turn=None,
                    outline_init_status=OutlineInitStatus.NEEDS_CLARIFICATION.value,
                    last_message_at=now,
                    updated_at=now,
                )
            )
            await self.db.commit()
            return None, OutlineInitStatus.NEEDS_CLARIFICATION.value, init_result.message

        content = normalize_outline_content(init_result.content)
        revision = await self._cas_insert_outline(
            session_id,
            0,
            content,
            author="ASSISTANT",
            source_refs=init_result.sources or None,
            next_state=SocraticState.OUTLINE,
        )
        if revision is None:
            raise ConflictError(
                "Outline already initialized",
                "OUTLINE_INIT_IN_PROGRESS",
            )

        turn_id = await self._get_next_turn_id(session_id)
        msg = ChatMessage(
            session_id=session_id,
            turn_id=turn_id,
            role=ChatRole.ASSISTANT,
            content=init_result.message,
            sources=init_result.sources or [],
            status=MessageStatus.VALIDATED,
            provider=self.ai_port.provider_name,
            model=init_result.model or self.ai_port.model_name,
            prompt_version=init_result.prompt_version or None,
            prompt_hash=init_result.prompt_hash or None,
            schema_version=init_result.schema_version or None,
            turn_meta={
                "intent": "EXPLAIN",
                "outlineChanged": True,
                "outlineVersion": revision.revision,
            },
        )
        self.db.add(msg)
        await self.db.execute(
            update(SocraticSession)
            .where(
                SocraticSession.id == session_id,
                SocraticSession.reservation_token == reservation_token,
            )
            .values(
                reservation_token=None,
                reservation_expires_at=None,
                processing_turn=None,
                outline_init_status=OutlineInitStatus.COMPLETED.value,
                last_message_at=now,
                updated_at=utcnow(),
            )
        )
        await self.db.commit()
        await self.db.refresh(revision)
        logger.info("outline_init completed session_id=%s revision=%s", session_id, revision.revision)
        return revision, OutlineInitStatus.COMPLETED.value, init_result.message

    async def get_current_outline(
        self, session_id: uuid.UUID, user: User
    ) -> OutlineRevision | None:
        session = await self._load_owned_session(session_id, user, for_mutation=False)
        if session.outline_version == 0:
            return None
        result = await self.db.execute(
            select(OutlineRevision).where(
                OutlineRevision.session_id == session_id,
                OutlineRevision.revision == session.outline_version,
            )
        )
        return result.scalar_one_or_none()

    async def review_outline(
        self,
        session_id: uuid.UUID,
        user: User,
        revision_id: uuid.UUID,
    ) -> tuple[OutlineRevision, str]:
        session = await self._load_owned_session(session_id, user, for_mutation=True)
        result = await self.db.execute(
            select(OutlineRevision).where(
                OutlineRevision.id == revision_id,
                OutlineRevision.session_id == session_id,
            )
        )
        revision = result.scalar_one_or_none()
        if not revision:
            raise NotFoundError("Outline revision not found")
        if revision.revision != session.outline_version:
            raise ConflictError(
                "Only the current outline revision can be reviewed",
                "OUTLINE_NOT_CURRENT",
            )
        if revision.review_status == OutlineRevisionStatus.SUPERSEDED:
            raise ConflictError(
                "Superseded revisions cannot be restored; create a new revision instead",
                "OUTLINE_SUPERSEDED",
            )

        if self.after_review_load is not None:
            self.after_review_load.set()
        if self.hold_review is not None:
            await self.hold_review.wait()

        now = utcnow()
        policy = session.assignment_revision.readiness_policy or {}
        readiness = evaluate_readiness(revision.content, policy)
        values: dict[str, Any] = {"updated_at": now}
        if readiness == "READY" and session.state in {
            SocraticState.OUTLINE,
            SocraticState.THESIS,
        }:
            values["state"] = SocraticState.REVIEW
            values["version"] = SocraticSession.version + 1

        cas = await self.db.execute(
            update(SocraticSession)
            .where(
                SocraticSession.id == session_id,
                SocraticSession.outline_version == revision.revision,
            )
            .values(**values)
            .returning(SocraticSession.id)
        )
        if cas.one_or_none() is None:
            raise ConflictError(
                "Outline changed during review",
                "OUTLINE_NOT_CURRENT",
            )
        if revision.review_status != OutlineRevisionStatus.ACCEPTED:
            still_current = await self.db.execute(
                select(OutlineRevision).where(
                    OutlineRevision.id == revision.id,
                    OutlineRevision.review_status != OutlineRevisionStatus.SUPERSEDED,
                )
            )
            current_row = still_current.scalar_one_or_none()
            if current_row is None:
                raise ConflictError(
                    "Outline changed during review",
                    "OUTLINE_NOT_CURRENT",
                )
            current_row.review_status = OutlineRevisionStatus.ACCEPTED
        await self.db.commit()
        await self.db.refresh(revision)
        return revision, readiness
