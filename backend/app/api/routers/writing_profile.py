"""Student writing profile HTTP API: GET read-only and POST refresh."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, status

from app.core.errors import ApiHttpException, ERROR_MESSAGES
from app.db.models import User, UserRole
from app.identity.deps import get_session_context, require_mutation_guards
from app.identity.service import SessionContext
from app.services.writing_profile_service import WritingProfileService

router = APIRouter(
    prefix="/student/writing-profile",
    tags=["writing-profile"],
    dependencies=[Depends(require_mutation_guards)],
)


async def get_student(ctx: Annotated[SessionContext, Depends(get_session_context)]) -> User:
    if ctx.user.role != UserRole.STUDENT:
        raise ApiHttpException(
            status.HTTP_403_FORBIDDEN,
            "STUDENT_REQUIRED",
            ERROR_MESSAGES["STUDENT_REQUIRED"],
        )
    return ctx.user


async def get_writing_profile_service(
    ctx: Annotated[SessionContext, Depends(get_session_context)],
) -> WritingProfileService:
    return WritingProfileService(ctx.db)


@router.get("")
@router.get("/")
async def get_writing_profile(
    student: Annotated[User, Depends(get_student)],
    service: Annotated[WritingProfileService, Depends(get_writing_profile_service)],
) -> dict[str, Any]:
    return await service.get_profile(student)


@router.post("/refresh")
@router.post("/refresh/")
async def refresh_writing_profile(
    student: Annotated[User, Depends(get_student)],
    service: Annotated[WritingProfileService, Depends(get_writing_profile_service)],
) -> dict[str, Any]:
    return await service.refresh(student)
