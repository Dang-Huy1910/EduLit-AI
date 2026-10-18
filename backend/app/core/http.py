from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import Request, Response

from app.config import Settings
from app.core.errors import ERROR_MESSAGES, ApiHttpException

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
CSRF_HEADER = "x-edulit-csrf"
SENSITIVE_FIELDS = frozenset(
    {
        "password",
        "newpassword",
        "currentpassword",
        "token",
        "new_password",
        "current_password",
    }
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def client_ip(request: Request, settings: Settings) -> str:
    host = request.client.host if request.client else "0.0.0.0"
    if host not in settings.trusted_proxy_ips:
        return host
    forwarded = request.headers.get("x-forwarded-for")
    if not forwarded:
        return host
    first = forwarded.split(",")[0].strip()
    return first or host


def user_agent_summary(request: Request) -> str:
    raw = (request.headers.get("user-agent") or "").strip()
    return raw[:256]


async def verify_mutation_guards(request: Request, settings: Settings) -> None:
    if request.method.upper() in SAFE_METHODS:
        return

    origin = request.headers.get("origin")
    if not origin or origin == "null":
        referer = request.headers.get("referer")
        if referer:
            parsed_ref = urlparse(referer)
            if parsed_ref.scheme and parsed_ref.netloc:
                origin = f"{parsed_ref.scheme}://{parsed_ref.netloc}"

    if not origin or origin == "null" or not settings.is_origin_allowed(origin):
        raise ApiHttpException(403, "CSRF_ORIGIN", ERROR_MESSAGES["CSRF_ORIGIN"])

    csrf = request.headers.get(CSRF_HEADER, "")
    if csrf.strip() != "1":
        raise ApiHttpException(403, "CSRF_HEADER", ERROR_MESSAGES["CSRF_HEADER"])

    content_type = (request.headers.get("content-type") or "").lower()
    if not content_type.startswith("application/json"):
        raise ApiHttpException(400, "JSON_REQUIRED", ERROR_MESSAGES["JSON_REQUIRED"])


def set_session_cookie(
    response: Response,
    settings: Settings,
    raw_token: str,
    *,
    persistent: bool,
    expires_at: datetime,
) -> None:
    kwargs: dict[str, object] = {
        "key": settings.SESSION_COOKIE_NAME,
        "value": raw_token,
        "path": "/",
        "httponly": True,
        "samesite": "lax",
        "secure": settings.is_cookie_secure,
    }
    if persistent:
        kwargs["max_age"] = settings.SESSION_TTL_SECONDS_LONG
        kwargs["expires"] = expires_at
    response.set_cookie(**kwargs)


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.is_cookie_secure,
    )
