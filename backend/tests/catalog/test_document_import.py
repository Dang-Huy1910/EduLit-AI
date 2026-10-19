"""Teacher document import: original BYTEA, MarkItDown, mocked AI, catalog, snapshots."""

from __future__ import annotations

import hashlib
import uuid
from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.adapters import AiUnavailableError, FakeAiAdapter
from app.ai.fake_document_extract import fake_document_analysis_json
from app.ai.schemas import DOCUMENT_EXTRACT_MARKER
from app.config import Settings
from app.core.http import utcnow
from app.db.models import SourcePrompt, TeacherDocument, TeacherDocumentBlob, User, UserRole
from app.db.session import get_session_factory
from app.services.document_convert import sha256_text
from app.services.document_import import DocumentImportService
from tests.catalog.conftest import HEADERS, create_user, login_as, seed_classroom_with_student
from tests.catalog.fixtures import (
    FACTORY_MATERIAL,
    WRITING_TASK_FULL,
    corrupt_docx_bytes,
    mixed_markdown_bytes,
    poetry_rubric_docx_bytes,
    scanned_pdf_bytes,
)

MULTIPART = {"Origin": "http://localhost:3000", "X-Edulit-CSRF": "1"}


async def _upload(
    client: AsyncClient,
    data: bytes,
    filename: str,
    *,
    intent: str = "MIXED",
    mime: str = "application/octet-stream",
) -> dict:
    response = await client.post(
        "/api/teacher/documents",
        headers=MULTIPART,
        files={"file": (filename, data, mime)},
        data={"intent": intent, "gradeLevel": "11", "genre": "NLXH"},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_original_bytes_roundtrip(client: AsyncClient, teacher_user: User) -> None:
    data = poetry_rubric_docx_bytes()
    digest = hashlib.sha256(data).hexdigest()
    created = await _upload(client, data, "tho-barem.docx")
    assert created["sha256"] == digest
    assert created["byteSize"] == len(data)
    assert "originalBytes" not in created
    listed = await client.get("/api/teacher/documents", headers=HEADERS)
    assert listed.status_code == 200
    item = listed.json()["items"][0]
    assert item["id"] == created["id"]
    assert "originalBytes" not in item
    assert "convertedMarkdown" not in item
    assert "markdown" not in item
    downloaded = await client.get(f"/api/teacher/documents/{created['id']}/original", headers=HEADERS)
    assert downloaded.status_code == 200
    assert downloaded.content == data
    assert hashlib.sha256(downloaded.content).hexdigest() == digest


@pytest.mark.asyncio
async def test_original_survives_conversion_failure(client: AsyncClient, teacher_user: User) -> None:
    data = corrupt_docx_bytes()
    created = await _upload(client, data, "hong.docx")
    assert created["status"] in {"FAILED", "NEEDS_OCR"}
    downloaded = await client.get(f"/api/teacher/documents/{created['id']}/original", headers=HEADERS)
    assert downloaded.content == data


@pytest.mark.asyncio
async def test_scanned_pdf_stays_needs_ocr(client: AsyncClient, teacher_user: User) -> None:
    created = await _upload(client, scanned_pdf_bytes(), "scan.pdf")
    assert created["status"] == "NEEDS_OCR"
    assert created["needsOcr"] is True
    assert created["analysis"] in (None, {})
    retry = await client.post(
        f"/api/teacher/documents/{created['id']}/analyze",
        headers=HEADERS,
        json={},
    )
    assert retry.status_code == 422
    assert retry.json()["error"]["code"] == "IMPORT_NEEDS_OCR"
    downloaded = await client.get(f"/api/teacher/documents/{created['id']}/original", headers=HEADERS)
    assert downloaded.content == scanned_pdf_bytes()


@pytest.mark.asyncio
async def test_original_survives_ai_failure(
    db_session: AsyncSession, teacher_user: User, settings: Settings
) -> None:
    adapter = FakeAiAdapter(model="fake-model")
    adapter.fail_next = True
    adapter.fail_with = AiUnavailableError("boom")
    service = DocumentImportService(db_session, settings=settings, ai_port=adapter)
    data = mixed_markdown_bytes()
    payload = await service.upload(teacher_user, filename="tong-hop.md", data=data)
    assert payload["status"] == "FAILED"
    result = await db_session.execute(
        select(TeacherDocumentBlob.original_bytes).where(
            TeacherDocumentBlob.document_id == uuid.UUID(payload["id"])
        )
    )
    assert result.scalar_one() == data


def test_fake_extract_keeps_full_writing_task() -> None:
    markdown = mixed_markdown_bytes().decode("utf-8")
    prompt = f"Intent giáo viên: MIXED\n{DOCUMENT_EXTRACT_MARKER}\n<<<\n{markdown}\n>>>\n"
    payload = fake_document_analysis_json(prompt)
    import json

    data = json.loads(payload)
    task = data["prompts"][0]["writing_task"]
    summary = data["prompts"][0]["writing_task_summary"]
    assert "600 chữ" in task
    assert "so sánh" in task.lower()
    assert "dẫn chứng" in task.lower()
    assert FACTORY_MATERIAL in data["materials"][0]["content"]
    assert data["materials"][0]["content"] != summary
    assert task != summary or "600 chữ" in task


def test_xlsx_style_scores_keep_zero_and_decimal_comma() -> None:
    from app.ai.fake_document_extract import fake_document_analysis_json as extract
    import json

    markdown = "| Tiêu chí | Điểm |\n| --- | --- |\n| Nội dung | 2,5 |\n| Hình thức | 7,5 |\n"
    data = json.loads(extract(f"{DOCUMENT_EXTRACT_MARKER}\n{markdown}"))
    rubric = data["rubrics"][0]
    weights = [item["weight"] for item in rubric["criteria"]]
    assert 2.5 in weights
    assert 7.5 in weights
    assert rubric["max_score"] == 10
    assert any(level["score"] == 0 for item in rubric["criteria"] for level in item["levels"])


@pytest.mark.asyncio
async def test_refresh_keeps_draft_and_reanalyze_does_not_clobber(
    client: AsyncClient, teacher_user: User
) -> None:
    created = await _upload(client, mixed_markdown_bytes(), "tong-hop.md", mime="text/markdown")
    assert created["status"] == "REVIEW"
    doc_id = created["id"]
    draft = created["draft"]
    draft["prompts"][0]["title"] = "Tiêu đề giáo viên sửa"
    saved = await client.post(
        f"/api/teacher/documents/{doc_id}/draft",
        headers=HEADERS,
        json={"draft": draft, "markdown": created["markdown"], "selectedItemIds": created["selectedItemIds"]},
    )
    assert saved.status_code == 200, saved.text
    refreshed = await client.get(f"/api/teacher/documents/{doc_id}", headers=HEADERS)
    assert refreshed.json()["draft"]["prompts"][0]["title"] == "Tiêu đề giáo viên sửa"
    again = await client.post(
        f"/api/teacher/documents/{doc_id}/analyze",
        headers=HEADERS,
        json={"expectedMarkdownSha256": refreshed.json()["markdownSha256"]},
    )
    assert again.status_code == 200, again.text
    assert again.json()["draft"]["prompts"][0]["title"] == "Tiêu đề giáo viên sửa"
    edited_md = created["markdown"] + "\n\nGhi chú giáo viên thêm một câu."
    overwritten = await client.post(
        f"/api/teacher/documents/{doc_id}/analyze",
        headers=HEADERS,
        json={"markdown": edited_md, "expectedMarkdownSha256": sha256_text(edited_md)},
    )
    assert overwritten.status_code == 200, overwritten.text
    assert overwritten.json()["draft"]["prompts"][0]["title"] != "Tiêu đề giáo viên sửa"


@pytest.mark.asyncio
async def test_confirm_twice_does_not_duplicate(client: AsyncClient, teacher_user: User) -> None:
    created = await _upload(client, mixed_markdown_bytes(), "tong-hop.md", mime="text/markdown")
    first = await client.post(
        f"/api/teacher/documents/{created['id']}/confirm",
        headers=HEADERS,
        json={"selectedItemIds": created["selectedItemIds"]},
    )
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "CONFIRMED"
    second = await client.post(
        f"/api/teacher/documents/{created['id']}/confirm",
        headers=HEADERS,
        json={"selectedItemIds": created["selectedItemIds"]},
    )
    assert second.status_code == 200
    assert first.json()["createdPromptIds"] == second.json()["createdPromptIds"]
    assert first.json()["createdMaterialIds"] == second.json()["createdMaterialIds"]
    assert first.json()["createdRubricIds"] == second.json()["createdRubricIds"]
    factory = get_session_factory()
    async with factory() as session:
        count = await session.scalar(select(func.count()).select_from(SourcePrompt))
    assert count == len(first.json()["createdPromptIds"])


@pytest.mark.asyncio
async def test_cannot_download_another_teacher_document(
    client: AsyncClient,
    teacher_user: User,
    db_session: AsyncSession,
    settings: Settings,
) -> None:
    created = await _upload(client, mixed_markdown_bytes(), "tong-hop.md", mime="text/markdown")
    other = await create_user(db_session, settings, client, role=UserRole.TEACHER, prefix="gv2")
    await login_as(client, settings, db_session, other)
    denied = await client.get(f"/api/teacher/documents/{created['id']}/original", headers=HEADERS)
    assert denied.status_code == 403
    listed = await client.get("/api/teacher/documents", headers=HEADERS)
    assert listed.json()["items"] == []


@pytest.mark.asyncio
async def test_stale_processing_recovers_after_restart(
    db_session: AsyncSession, teacher_user: User, settings: Settings
) -> None:
    document = TeacherDocument(
        owner_teacher_id=teacher_user.id,
        original_filename="treo.md",
        mime_type="text/markdown",
        byte_size=12,
        sha256="a" * 64,
        status="ANALYZING",
        processing_started_at=utcnow() - timedelta(seconds=settings.IMPORT_STALE_SECONDS + 10),
        converted_markdown="# treo",
        updated_at=utcnow(),
    )
    db_session.add(document)
    await db_session.commit()
    service = DocumentImportService(db_session, settings=settings, ai_port=FakeAiAdapter())
    payload = await service.get_document(teacher_user, document.id)
    assert payload["status"] == "FAILED"
    assert payload["errorCode"] == "IMPORT_INTERRUPTED"


@pytest.mark.asyncio
async def test_import_assign_socratic_uses_full_task_and_snapshot_freezes(
    client: AsyncClient,
    teacher_user: User,
    student_user: User,
    db_session: AsyncSession,
    settings: Settings,
) -> None:
    classroom = await seed_classroom_with_student(db_session, teacher_user, student_user)
    created = await _upload(client, mixed_markdown_bytes(), "tong-hop.md", mime="text/markdown")
    confirmed = await client.post(
        f"/api/teacher/documents/{created['id']}/confirm",
        headers=HEADERS,
        json={"selectedItemIds": created["selectedItemIds"]},
    )
    assert confirmed.status_code == 200, confirmed.text
    prompt_id = confirmed.json()["createdPromptIds"][0]
    rubric_id = confirmed.json()["createdRubricIds"][0]
    prompt = await client.get(f"/api/teacher/prompts/{prompt_id}", headers=HEADERS)
    assert prompt.status_code == 200
    body = prompt.json()
    assert "600 chữ" in body["writingTask"]
    assert "so sánh" in body["writingTask"].lower()
    assert body["writingTaskSummary"]
    assert FACTORY_MATERIAL in body["materials"][0]["content"]
    assert body["sourceDocumentId"] == created["id"]
    rubric = await client.get(f"/api/teacher/rubrics/{rubric_id}", headers=HEADERS)
    assert rubric.json()["maxScore"] == 10

    assignment = await client.post(
        "/api/teacher/assignments",
        headers=HEADERS,
        json={
            "sourcePromptId": prompt_id,
            "rubricId": rubric_id,
            "classroomId": str(classroom.id),
            "assignToWholeClass": True,
            "title": "Khói nhà máy — import",
        },
    )
    assert assignment.status_code == 201, assignment.text
    published = await client.post(
        f"/api/teacher/assignments/{assignment.json()['id']}/publish",
        headers=HEADERS,
        json={},
    )
    assert published.status_code == 200, published.text
    code = published.json()["code"]

    await client.patch(
        f"/api/teacher/prompts/{prompt_id}",
        headers=HEADERS,
        json={"writingTask": "Đề đã sửa sau khi giao, không được lọt vào snapshot."},
    )
    material_id = confirmed.json()["createdMaterialIds"][0]
    await client.patch(
        f"/api/teacher/materials/{material_id}",
        headers=HEADERS,
        json={"content": "Ngữ liệu đã sửa sau phát hành."},
    )

    await login_as(client, settings, db_session, student_user)
    detail = await client.get(f"/api/assignments/{code}", headers=HEADERS)
    assert detail.status_code == 200, detail.text
    payload = detail.json()
    assert "600 chữ" in payload["writingTask"]
    assert "Đề đã sửa sau khi giao" not in payload["writingTask"]
    assert FACTORY_MATERIAL in payload["materials"][0]["content"]
    assert "Ngữ liệu đã sửa sau phát hành" not in payload["materials"][0]["content"]
    assert payload["rubric"]["maxScore"] == 10

    session_resp = await client.post(
        "/api/socratic-sessions",
        headers=HEADERS,
        json={"assignmentCode": code},
    )
    assert session_resp.status_code == 201, session_resp.text
    outline = await client.post(
        f"/api/socratic-sessions/{session_resp.json()['id']}/outline-init",
        headers=HEADERS,
        json={},
    )
    assert outline.status_code in {200, 201}, outline.text


@pytest.mark.asyncio
async def test_student_cannot_import(client: AsyncClient, student_user: User, settings: Settings, db_session: AsyncSession) -> None:
    await login_as(client, settings, db_session, student_user)
    response = await client.post(
        "/api/teacher/documents",
        headers=MULTIPART,
        files={"file": ("a.md", b"# hi", "text/markdown")},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_import_uses_larger_output_budget(
    db_session: AsyncSession, teacher_user: User, settings: Settings
) -> None:
    adapter = FakeAiAdapter(model="fake-model")
    service = DocumentImportService(db_session, settings=settings, ai_port=adapter)
    await service.upload(teacher_user, filename="tong-hop.md", data=mixed_markdown_bytes())
    assert adapter.last_max_tokens == settings.IMPORT_AI_MAX_OUTPUT_TOKENS
    assert adapter.last_max_tokens >= 2048
