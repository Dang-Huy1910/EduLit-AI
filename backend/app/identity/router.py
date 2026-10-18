from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response

from app.config import Settings, get_settings
from app.core.http import (
    clear_session_cookie,
    client_ip,
    set_session_cookie,
    user_agent_summary,
)
from app.identity.deps import get_auth_service, get_session_context, require_mutation_guards
from app.identity.schemas import (
    ChangePasswordRequest,
    EmailRequest,
    LoginRequest,
    PublicUser,
    RegisterRequest,
    ResetPasswordRequest,
    TokenRequest,
    user_to_public,
)
from app.identity.service import AuthService, SessionContext

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
    dependencies=[Depends(require_mutation_guards)],
)


@router.post("/register", status_code=202)
async def register(
    body: RegisterRequest,
    request: Request,
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, str]:
    return await service.register(
        login_id_raw=body.login_id,
        email_raw=body.email,
        display_name_raw=body.display_name,
        password_raw=body.password,
        ip=client_ip(request, settings),
    )


@router.post("/verify-email")
async def verify_email(
    body: TokenRequest,
    request: Request,
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, str]:
    return await service.verify_email(body.token, client_ip(request, settings))


@router.post("/resend-verification", status_code=202)
async def resend_verification(
    body: EmailRequest,
    request: Request,
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, str]:
    return await service.resend_verification(body.email, client_ip(request, settings))


@router.post("/login")
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    current = request.cookies.get(settings.SESSION_COOKIE_NAME)
    result = await service.login(
        identifier_raw=body.login_id,
        password_raw=body.password,
        remember_me=body.remember_me,
        ip=client_ip(request, settings),
        user_agent=user_agent_summary(request),
        current_raw_token=current,
    )
    set_session_cookie(
        response,
        settings,
        result.raw_token,
        persistent=result.persistent,
        expires_at=result.expires_at,  # type: ignore[arg-type]
    )
    return {"user": result.user.model_dump(by_alias=True)}


@router.get("/me")
async def me(
    ctx: Annotated[SessionContext, Depends(get_session_context)],
) -> PublicUser:
    return user_to_public(ctx.user)


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    raw = request.cookies.get(settings.SESSION_COOKIE_NAME)
    await service.logout(raw)
    clear_session_cookie(response, settings)
    return {}


@router.post("/forgot-password", status_code=202)
async def forgot_password(
    body: EmailRequest,
    request: Request,
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, str]:
    return await service.forgot_password(body.email, client_ip(request, settings))


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordRequest,
    request: Request,
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, str]:
    return await service.reset_password(body.token, body.new_password, client_ip(request, settings))


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    response: Response,
    ctx: Annotated[SessionContext, Depends(get_session_context)],
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, str]:
    result = await service.change_password(ctx, body.current_password, body.new_password)
    clear_session_cookie(response, settings)
    return result


@router.get("/sessions")
async def list_sessions(
    ctx: Annotated[SessionContext, Depends(get_session_context)],
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> dict[str, Any]:
    return await service.list_sessions(ctx)


@router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: uuid.UUID,
    response: Response,
    ctx: Annotated[SessionContext, Depends(get_session_context)],
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    was_current = await service.revoke_session(ctx, session_id)
    if was_current:
        clear_session_cookie(response, settings)
    return {}


@router.post("/logout-all")
async def logout_all(
    response: Response,
    ctx: Annotated[SessionContext, Depends(get_session_context)],
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    await service.logout_all(ctx)
    clear_session_cookie(response, settings)
    return {}
