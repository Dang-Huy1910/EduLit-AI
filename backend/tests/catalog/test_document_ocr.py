"""Scanned PDF imports use durable, fenced OCR and explicit analysis afterwards."""

from __future__ import annotations

import asyncio
import io
import json
import uuid
from datetime import timedelta

import pytest
from PIL import Image, ImageDraw
from sqlalchemy import select, update

from app.ai.adapters import AiUnavailableError, FakeAiAdapter
from app.ai.schemas import DocumentOcrPage
from app.core.http import utcnow
from app.db.models import TeacherDocument, TeacherDocumentBlob, UserRole
from app.db.session import get_session_factory
from app.services.document_convert import convert_upload, render_pdf_page, sha256_text
from app.services.document_import import DocumentImportService
from app.workers import document_ocr
from tests.catalog.conftest import HEADERS, create_user, login_as

MULTIPART = {"Origin": "http://localhost:3000", "X-Edulit-CSRF": "1"}


def image_pdf(pages: int = 2) -> bytes:
    images = []
    try:
        for index in range(pages):
            image = Image.new("RGB", (1200, 1800), "white")
            ImageDraw.Draw(image).text((100, 100), f"DE THI - TRANG {index + 1}", fill="black")
            images.append(image)
        output = io.BytesIO()
        images[0].save(output, format="PDF", save_all=True, append_images=images[1:])
        return output.getvalue()
    finally:
        for image in images:
            image.close()


async def upload(client, *, pages=2, data=None, filename="scan.pdf"):
    response = await client.post(
        "/api/teacher/documents", headers=MULTIPART,
        files={"file": (filename, data if data is not None else image_pdf(pages), "application/pdf")},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def claim(settings, *, limit=1):
    factory = get_session_factory()
    async with factory() as session, session.begin():
        return await document_ocr.claim_jobs(
            session, limit=limit, lease_seconds=settings.IMPORT_OCR_LEASE_SECONDS,
            max_attempts=settings.IMPORT_OCR_MAX_ATTEMPTS,
        )


async def job_row(document_id):
    async with get_session_factory()() as session:
        return await session.get(TeacherDocument, uuid.UUID(str(document_id)))


async def queued(client, *, pages=2):
    created = await upload(client, pages=pages)
    assert created["status"] == "NEEDS_OCR"
    assert created["ocrStatus"] == "NONE"
    response = await client.post(f"/api/teacher/documents/{created['id']}/ocr", headers=HEADERS)
    assert response.status_code == 200, response.text
    return response.json()


def test_real_image_pdf_needs_ocr_and_renders_bounded_jpeg(settings):
    data = image_pdf()
    assert convert_upload(data, "scan.pdf", settings=settings).needs_ocr is True
    with Image.open(io.BytesIO(render_pdf_page(data, 0, 600))) as image:
        assert image.format == "JPEG"
        assert image.mode == "RGB"
        assert max(image.size) <= 2000


@pytest.mark.asyncio
async def test_endpoint_queues_idempotently_and_reports_progress(client, teacher_user, settings):
    payload = await queued(client)
    assert payload["ocrStatus"] == "QUEUED"
    assert payload["ocrPageCount"] == 2
    assert payload["ocrPagesDone"] == 0
    assert payload["ocrError"] is None
    assert payload["ocrMaxPages"] == settings.IMPORT_OCR_MAX_PAGES
    again = await client.post(f"/api/teacher/documents/{payload['id']}/ocr", headers=HEADERS)
    assert again.json() == payload
    jobs = await claim(settings)
    assert len(jobs) == 1
    before = await job_row(payload["id"])
    repeat = await client.post(f"/api/teacher/documents/{payload['id']}/ocr", headers=HEADERS)
    assert repeat.json()["ocrStatus"] == "PROCESSING"
    after = await job_row(payload["id"])
    assert before.ocr_lease_token == after.ocr_lease_token == jobs[0][1]
    assert after.ocr_attempt_count == 1
    assert await claim(settings) == []
    listed = await client.get("/api/teacher/documents", headers=HEADERS)
    assert listed.json()["items"][0]["ocrStatus"] == "PROCESSING"
    assert listed.json()["items"][0]["ocrMaxPages"] == settings.IMPORT_OCR_MAX_PAGES


@pytest.mark.asyncio
async def test_ocr_complete_keeps_original_then_analyze_and_confirm(client, teacher_user, settings):
    payload = await queued(client)
    document_id, token = (await claim(settings))[0]
    assert await document_ocr.process_claimed_job(
        get_session_factory(), document_id, token, settings=settings,
    ) == "done"
    response = await client.get(f"/api/teacher/documents/{document_id}", headers=HEADERS)
    result = response.json()
    assert result["status"] == "CONVERTED"
    assert result["ocrStatus"] == "DONE"
    assert result["needsOcr"] is False
    assert result["ocrPagesDone"] == result["ocrPageCount"] == 2
    assert result["analysis"] is None
    assert result["draft"] is None
    assert result["markdown"].count("<!-- Trang ") == 2
    assert result["markdown"].index("<!-- Trang 1 -->") < result["markdown"].index("<!-- Trang 2 -->")
    assert "2/2" in result["conversionWarning"]
    assert "rà soát" in result["conversionWarning"]
    assert result["errorCode"] is result["errorMessage"] is result["ocrError"] is None
    assert result["markdownSha256"] == sha256_text(result["markdown"])
    row = await job_row(document_id)
    assert row.converted_markdown_sha256 == sha256_text(result["markdown"])
    assert row.ocr_finished_at is not None
    assert row.ocr_lease_token is row.ocr_lease_expires_at is None
    assert row.ocr_model_metadata["provider"] == "fake"
    assert row.ocr_model_metadata["model"] == "fake-model"
    assert row.ocr_model_metadata["promptVersion"] == "v1"
    assert "provider" not in response.text and "fake-model" not in response.text
    async with get_session_factory()() as session:
        original = await session.scalar(
            select(TeacherDocumentBlob.original_bytes).where(TeacherDocumentBlob.document_id == document_id)
        )
    assert row.sha256 == payload["sha256"]
    assert len(original) == payload["byteSize"]
    blocked = await client.post(f"/api/teacher/documents/{document_id}/ocr", headers=HEADERS)
    assert blocked.status_code == 409
    analyzed = await client.post(
        f"/api/teacher/documents/{document_id}/analyze", headers=HEADERS,
        json={"expectedMarkdownSha256": result["markdownSha256"]},
    )
    assert analyzed.status_code == 200, analyzed.text
    assert analyzed.json()["status"] == "REVIEW"
    selected = analyzed.json()["selectedItemIds"]
    assert selected
    confirmed = await client.post(
        f"/api/teacher/documents/{document_id}/confirm", headers=HEADERS,
        json={"selectedItemIds": selected},
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["status"] == "CONFIRMED"


@pytest.mark.asyncio
async def test_ocr_endpoint_requires_owner_and_teacher(client, teacher_user, student_user, db_session, settings):
    payload = await upload(client)
    url = f"/api/teacher/documents/{payload['id']}/ocr"
    other = await create_user(db_session, settings, client, role=UserRole.TEACHER, prefix="gv2")
    await login_as(client, settings, db_session, other)
    denied = await client.post(url, headers=HEADERS)
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "ACCESS_DENIED"
    missing = await client.post(f"/api/teacher/documents/{uuid.uuid4()}/ocr", headers=HEADERS)
    assert missing.status_code == 404
    await login_as(client, settings, db_session, student_user)
    denied = await client.post(url, headers=HEADERS)
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "TEACHER_REQUIRED"
    assert (await job_row(payload["id"])).ocr_status == "NONE"


@pytest.mark.asyncio
async def test_ocr_rejects_non_pdf_and_wrong_state(client, teacher_user):
    payload = await upload(client, data=b"# Van ban chu co san", filename="text.md")
    url = f"/api/teacher/documents/{payload['id']}/ocr"
    denied = await client.post(url, headers=HEADERS)
    assert denied.status_code == 409
    # Even an inconsistent state must not send a text upload to the renderer.
    async with get_session_factory()() as session, session.begin():
        await session.execute(update(TeacherDocument).where(
            TeacherDocument.id == uuid.UUID(payload["id"])
        ).values(status="NEEDS_OCR"))
    assert (await client.post(url, headers=HEADERS)).status_code == 409


@pytest.mark.asyncio
async def test_page_limit_and_invalid_pdf_are_rejected(client, teacher_user, app, db_session, settings):
    from app.api.routers.catalog import get_import_service

    cfg = settings.model_copy(update={"IMPORT_OCR_MAX_PAGES": 1})
    app.dependency_overrides[get_import_service] = lambda: DocumentImportService(db_session, settings=cfg)
    try:
        payload = await upload(client)
        response = await client.post(f"/api/teacher/documents/{payload['id']}/ocr", headers=HEADERS)
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "IMPORT_OCR_TOO_MANY_PAGES"
        assert "1 trang" in response.json()["error"]["message"]
        assert (await job_row(payload["id"])).ocr_status == "NONE"
        valid = await queued(client, pages=1)
        assert valid["ocrPageCount"] == 1
        assert valid["ocrMaxPages"] == 1
        corrupt = await upload(client, data=b"%PDF-broken", filename="broken.pdf")
        response = await client.post(f"/api/teacher/documents/{corrupt['id']}/ocr", headers=HEADERS)
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "IMPORT_TYPE"
    finally:
        app.dependency_overrides.pop(get_import_service)


@pytest.mark.asyncio
async def test_provider_errors_retry_then_fail_and_teacher_can_retry(client, teacher_user, settings):
    payload = await queued(client, pages=1)
    cfg = settings.model_copy(update={"IMPORT_OCR_MAX_ATTEMPTS": 2})
    adapter = FakeAiAdapter()
    for attempt in (1, 2):
        document_id, token = (await claim(cfg))[0]
        adapter.set_fail_next(AiUnavailableError("private-provider private-model secret-error"))
        outcome = await document_ocr.process_claimed_job(
            get_session_factory(), document_id, token, settings=cfg, ai_port=adapter,
        )
        assert outcome == ("queued" if attempt == 1 else "failed")
        row = await job_row(document_id)
        assert row.ocr_attempt_count == attempt
        assert row.ocr_status == ("QUEUED" if attempt == 1 else "FAILED")
        assert row.status == "NEEDS_OCR" and row.needs_ocr
        assert row.ocr_lease_token is None
        assert "private-" not in row.ocr_last_error
    assert await claim(cfg) == []
    result = await client.get(f"/api/teacher/documents/{payload['id']}", headers=HEADERS)
    assert result.json()["ocrError"] == document_ocr.OCR_ERROR
    assert "private-" not in result.text
    retry = await client.post(f"/api/teacher/documents/{payload['id']}/ocr", headers=HEADERS)
    assert retry.json()["ocrStatus"] == "QUEUED"
    row = await job_row(payload["id"])
    assert row.ocr_attempt_count == row.ocr_pages_done == 0
    assert row.ocr_finished_at is None and row.ocr_last_error == ""


@pytest.mark.asyncio
async def test_partial_failure_restarts_pages_in_order(client, teacher_user, settings):
    payload = await queued(client)
    document_id, token = (await claim(settings))[0]
    adapter = FakeAiAdapter(responses=[json.dumps({
        "markdown": "Premiere page - contenu assez long pour etre reconnu.",
        "needs_review": False, "review_reason": None,
    }), "invalid-json"])
    assert await document_ocr.process_claimed_job(
        get_session_factory(), document_id, token, settings=settings, ai_port=adapter,
    ) == "queued"
    row = await job_row(document_id)
    assert row.ocr_pages_done == 1
    assert "Premiere" not in row.converted_markdown
    document_id, token = (await claim(settings))[0]
    assert (await job_row(document_id)).ocr_pages_done == 0
    assert await document_ocr.process_claimed_job(
        get_session_factory(), document_id, token, settings=settings,
    ) == "done"
    row = await job_row(payload["id"])
    assert row.ocr_attempt_count == 2
    assert row.converted_markdown.count("<!-- Trang 1 -->") == 1
    assert row.converted_markdown.count("<!-- Trang 2 -->") == 1


@pytest.mark.asyncio
async def test_expired_lease_reclaimed_and_old_worker_cannot_overwrite(client, teacher_user, settings):
    await queued(client, pages=1)
    document_id, old_token = (await claim(settings))[0]
    adapter = FakeAiAdapter(hold_before_generate=asyncio.Event(), release_generate=asyncio.Event())
    task = asyncio.create_task(document_ocr.process_claimed_job(
        get_session_factory(), document_id, old_token, settings=settings, ai_port=adapter,
    ))
    try:
        await asyncio.wait_for(adapter.hold_before_generate.wait(), timeout=10)
        async with get_session_factory()() as session, session.begin():
            await session.execute(update(TeacherDocument).where(TeacherDocument.id == document_id).values(
                ocr_lease_expires_at=utcnow() - timedelta(seconds=1),
            ))
        reclaimed_id, new_token = (await claim(settings))[0]
        assert reclaimed_id == document_id and new_token != old_token
        assert await document_ocr.process_claimed_job(
            get_session_factory(), document_id, new_token, settings=settings,
        ) == "done"
        adapter.release_generate.set()
        assert await asyncio.wait_for(task, timeout=10) == "stale"
        row = await job_row(document_id)
        assert row.ocr_status == "DONE" and row.ocr_attempt_count == 2
        assert row.ocr_pages_done == 1
    finally:
        adapter.release_generate.set()
        await task


@pytest.mark.asyncio
async def test_claim_skips_locked_rows(client, teacher_user, settings):
    payload = await queued(client, pages=1)
    async with get_session_factory()() as locked_session, locked_session.begin():
        await locked_session.execute(select(TeacherDocument).where(
            TeacherDocument.id == uuid.UUID(payload["id"])
        ).with_for_update())
        assert await asyncio.wait_for(claim(settings), timeout=5) == []
    assert len(await claim(settings)) == 1


@pytest.mark.asyncio
async def test_expired_final_attempt_fails_instead_of_getting_stuck(client, teacher_user, settings):
    await queued(client, pages=1)
    cfg = settings.model_copy(update={"IMPORT_OCR_MAX_ATTEMPTS": 1})
    document_id, token = (await claim(cfg))[0]
    async with get_session_factory()() as session, session.begin():
        await session.execute(update(TeacherDocument).where(TeacherDocument.id == document_id).values(
            ocr_lease_expires_at=utcnow() - timedelta(seconds=1),
        ))
    assert await document_ocr.process_claimed_job(
        get_session_factory(), document_id, token, settings=cfg,
    ) == "stale"
    assert await claim(cfg) == []
    row = await job_row(document_id)
    assert row.ocr_status == "FAILED" and row.status == "NEEDS_OCR"
    assert row.ocr_last_error == document_ocr.OCR_ERROR
    assert row.ocr_finished_at is not None and row.ocr_lease_token is None


@pytest.mark.asyncio
async def test_truncated_ocr_keeps_full_markdown_and_warns(client, teacher_user, settings):
    await queued(client)
    cfg = settings.model_copy(update={"IMPORT_MAX_MARKDOWN_CHARS": 30})
    document_id, token = (await claim(cfg))[0]
    assert await document_ocr.process_claimed_job(
        get_session_factory(), document_id, token, settings=cfg,
    ) == "done"
    row = await job_row(document_id)
    assert row.truncated
    assert len(row.converted_markdown) > cfg.IMPORT_MAX_MARKDOWN_CHARS
    assert "<!-- Trang 2 -->" in row.converted_markdown
    assert "phần đầu" in row.conversion_warning


@pytest.mark.asyncio
async def test_worker_loop_processes_queue(client, teacher_user, settings):
    payload = await queued(client, pages=1)
    stop = asyncio.Event()
    cfg = settings.model_copy(update={"IMPORT_OCR_POLL_SECONDS": 0.1})
    task = asyncio.create_task(document_ocr.run_document_ocr_worker(
        settings=cfg, session_factory=get_session_factory(), stop_event=stop,
    ))
    try:
        async with asyncio.timeout(10):
            while (await job_row(payload["id"])).ocr_status != "DONE":
                await asyncio.sleep(0.05)
    finally:
        stop.set()
        await asyncio.wait_for(task, timeout=10)


@pytest.mark.asyncio
async def test_fake_schema_uses_existing_failure_hooks():
    adapter = FakeAiAdapter()
    adapter.set_fail_next()
    with pytest.raises(AiUnavailableError):
        await adapter.generate_with_images("printed page", [], structured_output=DocumentOcrPage)
    result = await adapter.generate_with_images("printed page", [], structured_output=DocumentOcrPage)
    assert len(result.content.markdown) > 40
    assert result.content.needs_review
