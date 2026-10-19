"""Socratic API Router.

Prefix: /api/socratic-sessions
CSRF/Origin guards reuse identity.require_mutation_guards (GET is skipped).
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, status
from pydantic import BaseModel, ConfigDict, Field

from app.config import Settings, get_settings
from app.core.errors import ApiHttpException
from app.db.models import User
from app.identity.deps import get_session_context, require_mutation_guards
from app.identity.service import SessionContext
from app.services.socratic_service import (
    AiInvalidOutputServiceError,
    AiUnavailableServiceError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    SocraticService,
    SocraticServiceError,
    evaluate_readiness,
)

router = APIRouter(
    prefix="/socratic-sessions",
    tags=["socratic"],
    dependencies=[Depends(require_mutation_guards)],
)


class CreateSessionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    assignmentCode: str = Field(..., min_length=1, max_length=32)


class CreateSessionResponse(BaseModel):
    id: str
    studentId: str
    assignmentRevisionId: str
    state: str
    version: int
    outlineVersion: int
    createdAt: str


class MessageRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    content: str = Field(..., min_length=1, max_length=2000)
    selectedPointId: str | None = Field(default=None, alias="selectedPointId")
    selectedSectionId: str | None = Field(default=None, alias="selectedSectionId")
    expectedOutlineVersion: int | None = Field(default=None, alias="expectedOutlineVersion")


class MessageResponse(BaseModel):
    id: str
    turnId: int
    role: str
    content: str
    sources: list[dict] | None = None
    status: str
    createdAt: str
    intent: str | None = None
    proposals: list[dict] | None = None
    appliedOps: list[dict] | None = None
    outlineChanged: bool = False
    outlineVersion: int | None = None
    currentOutline: dict | None = None
    clarificationReason: str | None = None


class MessagesListResponse(BaseModel):
    messages: list[MessageResponse]
    hasMore: bool
    nextBeforeTurn: int | None


class OutlineContent(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sections: list[dict] = Field(default_factory=list)
    thesis: str | None = None
    arguments: list[dict] = Field(default_factory=list)
    counterArguments: list[dict] = Field(default_factory=list)


class UpdateOutlineRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    content: OutlineContent
    expectedVersion: int = Field(..., ge=0, alias="expectedVersion")


class OutlineResponse(BaseModel):
    id: str
    sessionId: str
    revision: int
    content: dict
    author: str
    reviewStatus: str
    createdAt: str
    readiness: str | None = None


class ReviewOutlineRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    revisionId: str = Field(..., alias="revisionId")


class SessionResponse(BaseModel):
    id: str
    studentId: str
    assignmentRevisionId: str
    state: str
    version: int
    outlineVersion: int
    lastMessageAt: str | None
    createdAt: str
    updatedAt: str
    currentOutline: OutlineResponse | None = None
    readiness: str
    outlineInitStatus: str = "NONE"
    outlinePrepStatus: str | None = None


class OutlineInitResponse(BaseModel):
    status: str
    outline: OutlineResponse | None = None
    message: str | None = None
    sessionState: str
    outlineVersion: int
    readiness: str | None = None
    outlinePrepStatus: str | None = None


def _map_error(e: SocraticServiceError) -> None:
    if isinstance(e, NotFoundError):
        raise ApiHttpException(status.HTTP_404_NOT_FOUND, e.code, e.message)
    if isinstance(e, ForbiddenError):
        raise ApiHttpException(status.HTTP_403_FORBIDDEN, e.code, e.message)
    if isinstance(e, ConflictError):
        raise ApiHttpException(status.HTTP_409_CONFLICT, e.code, e.message)
    if isinstance(e, AiInvalidOutputServiceError):
        raise ApiHttpException(status.HTTP_502_BAD_GATEWAY, e.code, e.message)
    if isinstance(e, AiUnavailableServiceError):
        raise ApiHttpException(status.HTTP_503_SERVICE_UNAVAILABLE, e.code, e.message)
    if e.code == "VALIDATION":
        raise ApiHttpException(status.HTTP_400_BAD_REQUEST, e.code, e.message)
    raise ApiHttpException(status.HTTP_500_INTERNAL_SERVER_ERROR, e.code, e.message)


def _outline_response(revision, readiness: str | None = None) -> OutlineResponse:
    return OutlineResponse(
        id=str(revision.id),
        sessionId=str(revision.session_id),
        revision=revision.revision,
        content=revision.content,
        author=revision.author,
        reviewStatus=revision.review_status.value,
        createdAt=revision.created_at.isoformat(),
        readiness=readiness,
    )


def _session_response(
    session,
    outline=None,
    readiness: str = "INCONCLUSIVE",
    *,
    outline_init_status: str | None = None,
    outline_prep_status: str | None = None,
) -> SessionResponse:
    return SessionResponse(
        id=str(session.id),
        studentId=str(session.student_id),
        assignmentRevisionId=str(session.assignment_revision_id),
        state=session.state.value,
        version=session.version,
        outlineVersion=session.outline_version,
        lastMessageAt=session.last_message_at.isoformat() if session.last_message_at else None,
        createdAt=session.created_at.isoformat(),
        updatedAt=session.updated_at.isoformat(),
        currentOutline=_outline_response(outline, readiness) if outline else None,
        readiness=readiness,
        outlineInitStatus=outline_init_status
        or getattr(session, "outline_init_status", None)
        or "NONE",
        outlinePrepStatus=outline_prep_status,
    )


def _message_response(message, result=None, outline=None) -> MessageResponse:
    meta = message.turn_meta or {}
    if result is not None:
        intent = result.intent
        proposals = result.proposals or meta.get("proposals")
        applied = result.applied_ops or meta.get("appliedOps")
        changed = result.outline_changed
        version = result.outline_version
        reason = result.clarification_reason
    else:
        intent = meta.get("intent")
        proposals = meta.get("proposals")
        applied = meta.get("appliedOps")
        changed = bool(meta.get("outlineChanged"))
        version = meta.get("outlineVersion")
        reason = meta.get("clarificationReason")
    return MessageResponse(
        id=str(message.id),
        turnId=message.turn_id,
        role=message.role.value,
        content=message.content,
        sources=message.sources,
        status=message.status.value,
        createdAt=message.created_at.isoformat(),
        intent=intent,
        proposals=proposals,
        appliedOps=applied,
        outlineChanged=bool(changed),
        outlineVersion=version,
        currentOutline=_outline_response(outline).model_dump() if outline else None,
        clarificationReason=reason,
    )


async def get_authenticated_student(
    ctx: Annotated[SessionContext, Depends(get_session_context)],
) -> User:
    if ctx.user.role.value != "STUDENT":
        raise ApiHttpException(
            status.HTTP_403_FORBIDDEN,
            "STUDENT_REQUIRED",
            "Only students can access Socratic sessions",
        )
    return ctx.user


async def get_socratic_service(
    ctx: Annotated[SessionContext, Depends(get_session_context)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> SocraticService:
    return SocraticService(ctx.db, settings=settings)


@router.post("", response_model=CreateSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: CreateSessionRequest,
    student: Annotated[User, Depends(get_authenticated_student)],
    service: Annotated[SocraticService, Depends(get_socratic_service)],
):
    try:
        session = await service.create_session(student, body.assignmentCode)
        return CreateSessionResponse(
            id=str(session.id),
            studentId=str(session.student_id),
            assignmentRevisionId=str(session.assignment_revision_id),
            state=session.state.value,
            version=session.version,
            outlineVersion=session.outline_version,
            createdAt=session.created_at.isoformat(),
        )
    except SocraticServiceError as e:
        _map_error(e)


@router.get("", response_model=list[SessionResponse])
async def list_sessions(
    student: Annotated[User, Depends(get_authenticated_student)],
    service: Annotated[SocraticService, Depends(get_socratic_service)],
):
    sessions = await service.list_sessions(student)
    return [_session_response(s) for s in sessions]


class FindSessionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    assignmentCode: str = Field(..., min_length=1, max_length=32)


class FindSessionResponse(BaseModel):
    session: SessionResponse | None
    exists: bool


@router.get("/by-assignment", response_model=FindSessionResponse)
async def find_session_by_assignment(
    student: Annotated[User, Depends(get_authenticated_student)],
    service: Annotated[SocraticService, Depends(get_socratic_service)],
    assignmentCode: str = Query(..., min_length=1, max_length=32),
):
    """Find existing session for an assignment, or return None if not found."""
    try:
        session = await service.find_session_by_assignment(student, assignmentCode)
        if session:
            outline = await service.get_current_outline(session.id, student)
            policy = session.assignment_revision.readiness_policy or {}
            readiness = evaluate_readiness(outline.content if outline else None, policy)
            prep = await service.get_outline_prep(session)
            return FindSessionResponse(
                session=_session_response(
                    session,
                    outline,
                    readiness,
                    outline_init_status=service.mapped_init_status(session, prep),
                    outline_prep_status=prep.status if prep else None,
                ),
                exists=True,
            )
        return FindSessionResponse(session=None, exists=False)
    except SocraticServiceError as e:
        _map_error(e)


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    student: Annotated[User, Depends(get_authenticated_student)],
    service: Annotated[SocraticService, Depends(get_socratic_service)],
):
    try:
        sid = uuid.UUID(session_id)
        session = await service.get_session(sid, student)
        outline = await service.get_current_outline(sid, student)
        policy = session.assignment_revision.readiness_policy or {}
        readiness = evaluate_readiness(outline.content if outline else None, policy)
        prep = await service.get_outline_prep(session)
        return _session_response(
            session,
            outline,
            readiness,
            outline_init_status=service.mapped_init_status(session, prep),
            outline_prep_status=prep.status if prep else None,
        )
    except ValueError:
        raise ApiHttpException(status.HTTP_400_BAD_REQUEST, "INVALID_SESSION_ID", "Invalid session ID format")
    except SocraticServiceError as e:
        _map_error(e)


@router.get("/{session_id}/outline", response_model=OutlineResponse)
async def get_outline(
    session_id: str,
    student: Annotated[User, Depends(get_authenticated_student)],
    service: Annotated[SocraticService, Depends(get_socratic_service)],
):
    try:
        sid = uuid.UUID(session_id)
        session = await service.get_session(sid, student)
        outline = await service.get_current_outline(sid, student)
        if outline is None:
            raise NotFoundError("No current outline")
        policy = session.assignment_revision.readiness_policy or {}
        readiness = evaluate_readiness(outline.content, policy)
        return _outline_response(outline, readiness)
    except ValueError:
        raise ApiHttpException(status.HTTP_400_BAD_REQUEST, "INVALID_SESSION_ID", "Invalid session ID format")
    except SocraticServiceError as e:
        _map_error(e)


@router.get("/{session_id}/messages", response_model=MessagesListResponse)
async def get_messages(
    session_id: str,
    student: Annotated[User, Depends(get_authenticated_student)],
    service: Annotated[SocraticService, Depends(get_socratic_service)],
    limit: int = Query(default=50, ge=1, le=100),
    beforeTurn: int | None = Query(default=None),
):
    try:
        sid = uuid.UUID(session_id)
        messages, has_more, next_cursor = await service.get_messages(
            sid, student, limit, beforeTurn
        )
        return MessagesListResponse(
            messages=[_message_response(m) for m in messages],
            hasMore=has_more,
            nextBeforeTurn=next_cursor,
        )
    except ValueError:
        raise ApiHttpException(status.HTTP_400_BAD_REQUEST, "INVALID_SESSION_ID", "Invalid session ID format")
    except SocraticServiceError as e:
        _map_error(e)


@router.post("/{session_id}/messages", response_model=MessageResponse)
async def send_message(
    session_id: str,
    body: MessageRequest,
    student: Annotated[User, Depends(get_authenticated_student)],
    service: Annotated[SocraticService, Depends(get_socratic_service)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
):
    try:
        sid = uuid.UUID(session_id)
        message, result = await service.process_turn(
            session_id=sid,
            user=student,
            student_input=body.content,
            idempotency_key=idempotency_key,
            selected_point_id=body.selectedPointId,
            selected_section_id=body.selectedSectionId,
            expected_outline_version=body.expectedOutlineVersion,
        )
        outline = None
        if result.outline_changed or result.outline_version is not None:
            outline = await service.get_current_outline(sid, student)
        return _message_response(message, result, outline)
    except ValueError:
        raise ApiHttpException(status.HTTP_400_BAD_REQUEST, "INVALID_SESSION_ID", "Invalid session ID format")
    except SocraticServiceError as e:
        _map_error(e)


async def _outline_init_response(
    service: SocraticService,
    sid: uuid.UUID,
    student,
    outline,
    status: str,
    message: str | None,
) -> OutlineInitResponse:
    session = await service.get_session(sid, student)
    policy = session.assignment_revision.readiness_policy or {}
    readiness = evaluate_readiness(outline.content if outline else None, policy)
    prep = await service.get_outline_prep(session)
    outline_version = outline.revision if outline is not None else session.outline_version
    return OutlineInitResponse(
        status=status,
        outline=_outline_response(outline, readiness) if outline else None,
        message=message,
        sessionState=session.state.value,
        outlineVersion=outline_version,
        readiness=readiness,
        outlinePrepStatus=prep.status if prep else None,
    )


@router.get("/{session_id}/outline-init", response_model=OutlineInitResponse)
async def get_outline_init(
    session_id: str,
    student: Annotated[User, Depends(get_authenticated_student)],
    service: Annotated[SocraticService, Depends(get_socratic_service)],
):
    try:
        sid = uuid.UUID(session_id)
        outline, status, message = await service.read_outline_init(sid, student)
        return await _outline_init_response(service, sid, student, outline, status, message)
    except ValueError:
        raise ApiHttpException(status.HTTP_400_BAD_REQUEST, "INVALID_SESSION_ID", "Invalid session ID format")
    except SocraticServiceError as e:
        _map_error(e)


@router.post("/{session_id}/outline-init", response_model=OutlineInitResponse)
async def init_outline(
    session_id: str,
    student: Annotated[User, Depends(get_authenticated_student)],
    service: Annotated[SocraticService, Depends(get_socratic_service)],
    retry: bool = Query(default=False),
):
    try:
        sid = uuid.UUID(session_id)
        outline, status, message = await service.ensure_initial_outline(
            sid, student, retry=retry
        )
        return await _outline_init_response(service, sid, student, outline, status, message)
    except ValueError:
        raise ApiHttpException(status.HTTP_400_BAD_REQUEST, "INVALID_SESSION_ID", "Invalid session ID format")
    except SocraticServiceError as e:
        _map_error(e)


@router.put("/{session_id}/outline", response_model=OutlineResponse)
async def update_outline(
    session_id: str,
    body: UpdateOutlineRequest,
    student: Annotated[User, Depends(get_authenticated_student)],
    service: Annotated[SocraticService, Depends(get_socratic_service)],
):
    try:
        sid = uuid.UUID(session_id)
        revision = await service.update_outline(
            session_id=sid,
            user=student,
            content=body.content.model_dump(),
            expected_version=body.expectedVersion,
        )
        return _outline_response(revision)
    except ValueError:
        raise ApiHttpException(status.HTTP_400_BAD_REQUEST, "INVALID_SESSION_ID", "Invalid session ID format")
    except SocraticServiceError as e:
        _map_error(e)


@router.post("/{session_id}/review", response_model=OutlineResponse)
async def review_outline(
    session_id: str,
    body: ReviewOutlineRequest,
    student: Annotated[User, Depends(get_authenticated_student)],
    service: Annotated[SocraticService, Depends(get_socratic_service)],
):
    try:
        sid = uuid.UUID(session_id)
        rid = uuid.UUID(body.revisionId)
        revision, readiness = await service.review_outline(sid, student, rid)
        return _outline_response(revision, readiness)
    except ValueError:
        raise ApiHttpException(status.HTTP_400_BAD_REQUEST, "INVALID_ID", "Invalid ID format")
    except SocraticServiceError as e:
        _map_error(e)
