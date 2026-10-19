from __future__ import annotations

import asyncio
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
from app.db.migrate import upgrade_head
from app.core.http import SENSITIVE_FIELDS
from app.db.session import close_db
from app.workers.outline_prep import start_outline_prep_worker
from app.workers.ocr import start_ocr_worker
from app.workers.assessment import start_assessment_worker
from app.identity.router import router as auth_router
from app.api.routers.socratic import router as socratic_router
from app.api.routers.catalog import router as catalog_router
from app.api.routers.assignments import student_router as assignments_router
from app.api.routers.assignments import teacher_router as teacher_assignments_router
from app.api.routers.submissions import router as submissions_router
from app.api.routers.assessments import student_router as assessment_student_router
from app.api.routers.assessments import teacher_router as assessment_teacher_router

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
    settings = get_settings()
    if settings.should_run_migrations:
        logger.info("applying database migrations")
        upgrade_head()
    worker_task = None
    stop_worker = None
    ocr_task = None
    stop_ocr = None
    grade_task = None
    stop_grade = None
    if settings.OUTLINE_PREP_WORKER_ENABLED and not settings.is_test:
        worker_task, stop_worker = start_outline_prep_worker(settings=settings)
        logger.info("outline_prep worker attached to api process")
    if settings.OCR_WORKER_ENABLED and not settings.is_test:
        ocr_task, stop_ocr = start_ocr_worker(settings=settings)
        logger.info("ocr worker attached to api process")
    if settings.ASSESSMENT_WORKER_ENABLED and not settings.is_test:
        grade_task, stop_grade = start_assessment_worker(settings=settings)
        logger.info("assessment worker attached to api process")
    try:
        yield
    finally:
        if stop_worker is not None:
            stop_worker()
        if stop_ocr is not None:
            stop_ocr()
        if stop_grade is not None:
            stop_grade()
        if worker_task is not None:
            worker_task.cancel()
            try:
                await worker_task
            except asyncio.CancelledError:
                pass
        if ocr_task is not None:
            ocr_task.cancel()
            try:
                await ocr_task
            except asyncio.CancelledError:
                pass
        if grade_task is not None:
            grade_task.cancel()
            try:
                await grade_task
            except asyncio.CancelledError:
                pass
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
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-Edulit-CSRF", "Accept", "Idempotency-Key"],
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
    app.include_router(socratic_router, prefix="/api")
    app.include_router(catalog_router, prefix="/api")
    app.include_router(teacher_assignments_router, prefix="/api")
    app.include_router(assignments_router, prefix="/api")
    app.include_router(submissions_router, prefix="/api")
    app.include_router(assessment_student_router, prefix="/api")
    app.include_router(assessment_teacher_router, prefix="/api")
    return app


app = create_app()
