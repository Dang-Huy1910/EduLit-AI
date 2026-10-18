from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.core.errors import ERROR_MESSAGES, ApiHttpException, error_body
from app.core.http import SENSITIVE_FIELDS
from app.db.session import close_db
from app.identity.router import router as auth_router

logger = logging.getLogger("edulit.api")


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    _configure_logging()
    get_settings()
    yield
    await close_db()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="EduLit-AI Auth API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if not settings.is_production else None,
        redoc_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_origin_regex=r"^https://.*\.vercel\.app$",
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-Edulit-CSRF", "Accept"],
        max_age=600,
    )

    @app.exception_handler(ApiHttpException)
    async def api_http_handler(_request: Request, exc: ApiHttpException) -> JSONResponse:
        headers = {}
        if exc.retry_after is not None:
            headers["Retry-After"] = str(exc.retry_after)
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.code, exc.message, exc.fields),
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
        fields: dict[str, str] = {}
        for err in exc.errors():
            loc = err.get("loc") or ()
            name = str(loc[-1]) if loc else "body"
            if name.lower() in SENSITIVE_FIELDS:
                fields[name] = "Giá trị không hợp lệ."
            else:
                fields[name] = "Giá trị không hợp lệ."
        return JSONResponse(
            status_code=400,
            content=error_body("VALIDATION", ERROR_MESSAGES["VALIDATION"], fields),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code == 404:
            return JSONResponse(status_code=404, content=error_body("NOT_FOUND"))
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body("INTERNAL", ERROR_MESSAGES["INTERNAL"]),
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(_request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_error type=%s", type(exc).__name__)
        return JSONResponse(status_code=500, content=error_body("INTERNAL"))

    @app.get("/api/health")
    async def health() -> dict[str, bool]:
        return {"ok": True}

    app.include_router(auth_router, prefix="/api")
    return app


app = create_app()
