from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.core.http import verify_mutation_guards
from app.db.session import get_db
from app.email.adapter import EmailAdapter
from app.identity.service import AuthService, SessionContext


async def require_mutation_guards(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    await verify_mutation_guards(request, settings)


def get_email_adapter(settings: Annotated[Settings, Depends(get_settings)]) -> EmailAdapter:
    return EmailAdapter(settings)


def get_auth_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    email: Annotated[EmailAdapter, Depends(get_email_adapter)],
) -> AuthService:
    return AuthService(db, settings, email)


async def get_session_context(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    db: Annotated[AsyncSession, Depends(get_db)],
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> SessionContext:
    raw = request.cookies.get(settings.SESSION_COOKIE_NAME)
    ctx = await service.authenticate(raw)
    # Attach the DB session for use by downstream dependencies
    ctx.db = db
    return ctx
