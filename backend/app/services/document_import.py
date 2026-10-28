"""Upload original files, convert, analyze, review, and confirm into catalog."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.adapters import (
    AiConfigurationError,
    AiError,
    AiInvalidOutputError,
    AiPort,
    AiRefusalError,
    AiTimeoutError,
    AiUnavailableError,
    create_ai_adapter,
)
from app.ai.prompt_assets import PromptAssetError, load_prompt_asset
from app.ai.schemas import DOCUMENT_EXTRACT_MARKER, DocumentAnalysisResult
from app.config import Settings, get_settings
from app.core.errors import ERROR_MESSAGES
from app.core.http import utcnow
from app.db.models import TeacherDocument, TeacherDocumentBlob, User
from app.services.catalog_errors import CatalogError
from app.services.catalog_service import CatalogService, _genre, _grade, _optional_uuid, _text
from app.services.document_convert import (
    MIME_PDF,
    convert_upload,
    pdf_page_count,
    safe_filename,
    sha256_bytes,
    sha256_text,
    sniff_upload,
)
from app.services.rubric import validate_rubric_payload
from app.core.errors import DomainError

logger = logging.getLogger("edulit.import")

ALLOWED_INTENTS = {"MATERIAL", "PROMPT", "RUBRIC", "MIXED"}
ACTIVE_PROCESSING = {"CONVERTING", "ANALYZING"}


def _pick(item: dict[str, Any], *keys: str, default: Any = "") -> Any:
    for key in keys:
        if key in item and item[key] not in (None, ""):
            return item[key]
    return default


def _public_material(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(_pick(item, "id", default="")),
        "title": _pick(item, "title"),
        "author": _pick(item, "author"),
        "sourceInfo": _pick(item, "sourceInfo", "source_info"),
        "content": _pick(item, "content"),
        "warnings": list(item.get("warnings") or []),
    }


def _public_prompt(item: dict[str, Any]) -> dict[str, Any]:
    constraints = []
    for raw in item.get("constraints") or []:
        if not isinstance(raw, dict):
            continue
        constraints.append(
            {
                "kind": raw.get("kind") or "other",
                "text": raw.get("text") or "",
                "missing": bool(raw.get("missing")),
            }
        )
    return {
        "id": str(_pick(item, "id", default="")),
        "title": _pick(item, "title"),
        "writingTask": _pick(item, "writingTask", "writing_task"),
        "writingTaskSummary": _pick(item, "writingTaskSummary", "writing_task_summary"),
        "extraGuidance": _pick(item, "extraGuidance", "extra_guidance"),
        "genre": _pick(item, "genre", default="NLVH") or "NLVH",
        "gradeLevel": item.get("gradeLevel") if item.get("gradeLevel") is not None else item.get("grade_level", 11),
        "constraints": constraints,
        "linkedMaterialIds": [
            str(value)
            for value in (item.get("linkedMaterialIds") or item.get("linked_material_ids") or [])
        ],
        "warnings": list(item.get("warnings") or []),
    }


def _public_rubric(item: dict[str, Any]) -> dict[str, Any]:
    criteria = []
    for criterion in item.get("criteria") or []:
        if not isinstance(criterion, dict):
            continue
        criteria.append(
            {
                "id": criterion.get("id"),
                "name": criterion.get("name"),
                "weight": criterion.get("weight"),
                "guideNote": criterion.get("guideNote") or criterion.get("guide_note") or "",
                "levels": criterion.get("levels") or [],
                "requiredElements": criterion.get("requiredElements") or criterion.get("required_elements") or [],
                "penaltyPerError": criterion.get("penaltyPerError")
                if criterion.get("penaltyPerError") is not None
                else criterion.get("penalty_per_error"),
                "antiPatterns": criterion.get("antiPatterns") or criterion.get("anti_patterns") or [],
                "ambiguous": bool(criterion.get("ambiguous")),
            }
        )
    return {
        "id": str(_pick(item, "id", default="")),
        "title": _pick(item, "title"),
        "shortTitle": _pick(item, "shortTitle", "short_title"),
        "description": _pick(item, "description"),
        "maxScore": item.get("maxScore") if item.get("maxScore") is not None else item.get("max_score"),
        "scoreStep": item.get("scoreStep") if item.get("scoreStep") is not None else item.get("score_step", 0.25),
        "gradeLevel": item.get("gradeLevel") if item.get("gradeLevel") is not None else item.get("grade_level", 11),
        "criteria": criteria,
        "warnings": list(item.get("warnings") or []),
        "ambiguous": bool(item.get("ambiguous")),
    }


def public_analysis(raw: dict[str, Any] | None) -> dict[str, Any] | None:
    if not raw:
        return None
    return {
        "documentKind": raw.get("documentKind") or raw.get("document_kind") or "MIXED",
        "materials": [_public_material(item) for item in (raw.get("materials") or []) if isinstance(item, dict)],
        "prompts": [_public_prompt(item) for item in (raw.get("prompts") or []) if isinstance(item, dict)],
        "rubrics": [_public_rubric(item) for item in (raw.get("rubrics") or []) if isinstance(item, dict)],
        "warnings": list(raw.get("warnings") or []),
        "missing": list(raw.get("missing") or []),
    }


class DocumentImportService:
    def __init__(
        self,
        session: AsyncSession,
        settings: Settings | None = None,
        ai_port: AiPort | None = None,
    ) -> None:
        self.session = session
        self.settings = settings or get_settings()
        self._ai_port = ai_port
        self.catalog = CatalogService(session)

    def _ai(self) -> AiPort:
        if self._ai_port is None:
            try:
                self._ai_port = create_ai_adapter(self.settings)
            except AiConfigurationError as exc:
                raise CatalogError(503, "AI_UNAVAILABLE", ERROR_MESSAGES["AI_UNAVAILABLE"]) from exc
        return self._ai_port

    async def _owned(self, teacher: User, document_id: uuid.UUID) -> TeacherDocument:
        document = await self.session.get(TeacherDocument, document_id)
        if document is None:
            raise CatalogError(404, "NOT_FOUND", ERROR_MESSAGES["NOT_FOUND"])
        if document.owner_teacher_id != teacher.id:
            raise CatalogError(403, "ACCESS_DENIED", ERROR_MESSAGES["ACCESS_DENIED"])
        return document

    async def _recover_stale(self, document: TeacherDocument) -> TeacherDocument:
        if document.status not in ACTIVE_PROCESSING or document.processing_started_at is None:
            return document
        age = utcnow() - document.processing_started_at
        if age < timedelta(seconds=self.settings.IMPORT_STALE_SECONDS):
            return document
        document.status = "FAILED"
        document.error_code = "IMPORT_INTERRUPTED"
        document.error_message = "Xử lý bị gián đoạn. File gốc vẫn còn; thầy/cô hãy thử lại."
        document.processing_started_at = None
        document.updated_at = utcnow()
        await self.session.commit()
        return document

    def current_markdown(self, document: TeacherDocument) -> str:
        if document.teacher_markdown is not None and document.teacher_markdown != "":
            return document.teacher_markdown
        return document.converted_markdown or ""

    def current_markdown_sha(self, document: TeacherDocument) -> str:
        return sha256_text(self.current_markdown(document))

    def _dict(self, document: TeacherDocument, *, full: bool = False) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "id": str(document.id),
            "originalFilename": document.original_filename,
            "mimeType": document.mime_type,
            "byteSize": document.byte_size,
            "sha256": document.sha256,
            "status": document.status,
            "intent": document.intent,
            "needsOcr": document.needs_ocr,
            "ocrStatus": document.ocr_status,
            "ocrPageCount": document.ocr_page_count,
            "ocrPagesDone": document.ocr_pages_done,
            "ocrError": document.ocr_last_error or None,
            "ocrMaxPages": self.settings.IMPORT_OCR_MAX_PAGES,
            "truncated": document.truncated,
            "conversionWarning": document.conversion_warning,
            "errorCode": document.error_code or None,
            "errorMessage": document.error_message or None,
            "gradeLevel": document.grade_level,
            "genre": document.genre,
            "topicId": str(document.topic_id) if document.topic_id else None,
            "createdMaterialIds": list(document.created_material_ids or []),
            "createdPromptIds": list(document.created_prompt_ids or []),
            "createdRubricIds": list(document.created_rubric_ids or []),
            "updatedAt": document.updated_at.isoformat() if document.updated_at else None,
            "confirmedAt": document.confirmed_at.isoformat() if document.confirmed_at else None,
        }
        if full:
            markdown = self.current_markdown(document)
            payload["convertedMarkdown"] = document.converted_markdown
            payload["teacherMarkdown"] = document.teacher_markdown
            payload["markdown"] = markdown
            payload["markdownSha256"] = self.current_markdown_sha(document)
            payload["analysis"] = public_analysis(document.analysis_json)
            payload["analysisMarkdownSha256"] = document.analysis_markdown_sha256 or None
            payload["draft"] = public_analysis(document.teacher_draft_json)
            payload["selectedItemIds"] = list(document.selected_item_ids or [])
        return payload

    async def list_documents(self, teacher: User) -> list[dict[str, Any]]:
        result = await self.session.execute(
            select(TeacherDocument)
            .where(TeacherDocument.owner_teacher_id == teacher.id)
            .order_by(TeacherDocument.updated_at.desc())
        )
        items = []
        for document in result.scalars().all():
            document = await self._recover_stale(document)
            items.append(self._dict(document, full=False))
        return items

    async def get_document(self, teacher: User, document_id: uuid.UUID) -> dict[str, Any]:
        document = await self._recover_stale(await self._owned(teacher, document_id))
        return self._dict(document, full=True)

    async def original_bytes(
        self, teacher: User, document_id: uuid.UUID
    ) -> tuple[bytes, str, str]:
        document = await self._owned(teacher, document_id)
        result = await self.session.execute(
            select(TeacherDocumentBlob.original_bytes).where(
                TeacherDocumentBlob.document_id == document.id
            )
        )
        blob = result.scalar_one_or_none()
        if blob is None:
            raise CatalogError(404, "NOT_FOUND", "Không tìm thấy file gốc.")
        return blob, document.original_filename, document.mime_type

    async def upload(
        self,
        teacher: User,
        *,
        filename: str,
        data: bytes,
        intent: str = "MIXED",
        topic_id: Any = None,
        grade_level: Any = 11,
        genre: Any = "NLVH",
    ) -> dict[str, Any]:
        if len(data) > self.settings.IMPORT_MAX_BYTES:
            raise CatalogError(400, "IMPORT_TOO_LARGE", ERROR_MESSAGES["IMPORT_TOO_LARGE"])
        if not data:
            raise CatalogError(400, "IMPORT_TYPE", "File trống.")
        safe_name = safe_filename(filename)
        extension, mime_type = sniff_upload(safe_name, data)
        intent_key = str(intent or "MIXED").strip().upper()
        if intent_key not in ALLOWED_INTENTS:
            raise CatalogError(400, "VALIDATION", "Loại tài liệu phải là ngữ liệu, đề nguồn, barem hoặc tổng hợp.")

        document = TeacherDocument(
            owner_teacher_id=teacher.id,
            original_filename=safe_name,
            mime_type=mime_type,
            byte_size=len(data),
            sha256=sha256_bytes(data),
            status="UPLOADED",
            intent=intent_key,
            grade_level=_grade(grade_level),
            genre=_genre(genre),
            topic_id=_optional_uuid(topic_id),
            updated_at=utcnow(),
        )
        self.session.add(document)
        await self.session.flush()
        self.session.add(TeacherDocumentBlob(document_id=document.id, original_bytes=data))
        await self.session.commit()

        document.status = "CONVERTING"
        document.processing_started_at = utcnow()
        document.updated_at = utcnow()
        await self.session.commit()

        try:
            outcome = await asyncio.wait_for(
                asyncio.to_thread(convert_upload, data, safe_name, settings=self.settings),
                timeout=self.settings.IMPORT_CONVERT_TIMEOUT_SECONDS,
            )
        except TimeoutError:
            document.status = "FAILED"
            document.error_code = "IMPORT_TIMEOUT"
            document.error_message = ERROR_MESSAGES["IMPORT_TIMEOUT"]
            document.processing_started_at = None
            document.updated_at = utcnow()
            await self.session.commit()
            return self._dict(document, full=True)
        except CatalogError as exc:
            document.status = "NEEDS_OCR" if exc.code == "IMPORT_NEEDS_OCR" else "FAILED"
            document.needs_ocr = exc.code == "IMPORT_NEEDS_OCR"
            document.error_code = exc.code
            document.error_message = exc.message
            document.processing_started_at = None
            document.updated_at = utcnow()
            await self.session.commit()
            return self._dict(document, full=True)

        document.converted_markdown = outcome.markdown
        document.converted_markdown_sha256 = sha256_text(outcome.markdown)
        document.truncated = outcome.truncated
        document.conversion_warning = outcome.warning
        document.needs_ocr = outcome.needs_ocr
        document.converted_at = utcnow()
        document.processing_started_at = None
        document.updated_at = utcnow()
        if outcome.needs_ocr:
            document.status = "NEEDS_OCR"
            document.error_code = "IMPORT_NEEDS_OCR"
            document.error_message = ERROR_MESSAGES["IMPORT_NEEDS_OCR"]
            await self.session.commit()
            return self._dict(document, full=True)

        document.status = "CONVERTED"
        await self.session.commit()
        try:
            return await self.analyze(teacher, document.id)
        except CatalogError:
            fresh = await self.session.get(TeacherDocument, document.id)
            return self._dict(fresh or document, full=True)

    async def queue_ocr(self, teacher: User, document_id: uuid.UUID) -> dict[str, Any]:
        # Serialize repeated requests so queueing never resets an active lease.
        document = (
            await self.session.execute(
                select(TeacherDocument)
                .where(TeacherDocument.id == document_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if document is None:
            raise CatalogError(404, "NOT_FOUND", ERROR_MESSAGES["NOT_FOUND"])
        if document.owner_teacher_id != teacher.id:
            raise CatalogError(403, "ACCESS_DENIED", ERROR_MESSAGES["ACCESS_DENIED"])
        if document.ocr_status in {"QUEUED", "PROCESSING"}:
            return self._dict(document, full=True)
        if (
            document.status != "NEEDS_OCR"
            or document.mime_type != MIME_PDF
            or document.ocr_status not in {"NONE", "FAILED"}
        ):
            raise CatalogError(409, "IMPORT_NOT_READY", "Chỉ nhận dạng được PDF đang cần OCR.")
        data, _, _ = await self.original_bytes(teacher, document_id)
        try:
            count = await asyncio.to_thread(pdf_page_count, data)
        except Exception as exc:
            raise CatalogError(400, "IMPORT_TYPE", "Không đọc được PDF. Thầy/cô hãy tải lại file hợp lệ.") from exc
        if count > self.settings.IMPORT_OCR_MAX_PAGES:
            raise CatalogError(
                400, "IMPORT_OCR_TOO_MANY_PAGES",
                f"Chỉ nhận dạng tối đa {self.settings.IMPORT_OCR_MAX_PAGES} trang. Thầy/cô hãy tách PDF.",
            )
        if count < 1:
            raise CatalogError(400, "IMPORT_TYPE", "PDF không có trang để nhận dạng.")
        document.ocr_status = "QUEUED"
        document.ocr_attempt_count = 0
        document.ocr_page_count = count
        document.ocr_pages_done = 0
        document.ocr_last_error = ""
        document.ocr_lease_token = None
        document.ocr_lease_expires_at = None
        document.ocr_finished_at = None
        document.ocr_model_metadata = {}
        document.updated_at = utcnow()
        await self.session.commit()
        return self._dict(document, full=True)

    async def analyze(
        self,
        teacher: User,
        document_id: uuid.UUID,
        *,
        expected_markdown_sha256: str | None = None,
        markdown: str | None = None,
    ) -> dict[str, Any]:
        document = await self._recover_stale(await self._owned(teacher, document_id))
        if document.status == "CONFIRMED":
            return self._dict(document, full=True)
        if document.needs_ocr or document.status == "NEEDS_OCR":
            raise CatalogError(422, "IMPORT_NEEDS_OCR", ERROR_MESSAGES["IMPORT_NEEDS_OCR"])
        if not document.converted_markdown and not markdown:
            raise CatalogError(400, "IMPORT_NOT_READY", "Chưa có Markdown để phân tích.")

        if markdown is not None:
            document.teacher_markdown = markdown
            document.teacher_markdown_sha256 = sha256_text(markdown)
            document.updated_at = utcnow()
            await self.session.commit()

        current = self.current_markdown(document)
        current_sha = sha256_text(current)
        if expected_markdown_sha256 and expected_markdown_sha256 != current_sha:
            raise CatalogError(409, "IMPORT_STALE", ERROR_MESSAGES["IMPORT_STALE"])

        document.status = "ANALYZING"
        document.processing_started_at = utcnow()
        document.error_code = ""
        document.error_message = ""
        document.updated_at = utcnow()
        await self.session.commit()

        try:
            analysis = await self._run_analysis(current, document.intent)
        except CatalogError as exc:
            document.status = "FAILED"
            document.error_code = exc.code
            document.error_message = exc.message
            document.processing_started_at = None
            document.updated_at = utcnow()
            await self.session.commit()
            raise

        fresh = await self.session.get(TeacherDocument, document.id)
        if fresh is None:
            raise CatalogError(404, "NOT_FOUND", ERROR_MESSAGES["NOT_FOUND"])
        live_sha = sha256_text(self.current_markdown(fresh))
        if live_sha != current_sha:
            fresh.status = "REVIEW" if (fresh.teacher_draft_json or fresh.analysis_json) else "CONVERTED"
            fresh.processing_started_at = None
            fresh.updated_at = utcnow()
            await self.session.commit()
            raise CatalogError(409, "IMPORT_STALE", ERROR_MESSAGES["IMPORT_STALE"])

        analysis_payload = analysis.model_dump(mode="json")
        fresh.analysis_json = analysis_payload
        fresh.analysis_markdown_sha256 = current_sha
        if fresh.teacher_draft_markdown_sha256 != current_sha or not fresh.teacher_draft_json:
            fresh.teacher_draft_json = analysis_payload
            fresh.teacher_draft_markdown_sha256 = current_sha
            selected: list[str] = []
            for group, key in (("materials", "id"), ("prompts", "id"), ("rubrics", "id")):
                for item in analysis_payload.get(group) or []:
                    if item.get(key):
                        selected.append(str(item[key]))
            if not fresh.selected_item_ids:
                fresh.selected_item_ids = selected
        fresh.status = "REVIEW"
        fresh.analyzed_at = utcnow()
        fresh.processing_started_at = None
        fresh.updated_at = utcnow()
        if fresh.truncated:
            warnings = list(fresh.teacher_draft_json.get("warnings") or [])
            note = "Phân tích chỉ dùng phần đầu Markdown; không xem là đã xử lý đầy đủ."
            if note not in warnings:
                warnings.append(note)
            fresh.teacher_draft_json["warnings"] = warnings
        await self.session.commit()
        return self._dict(fresh, full=True)

    async def _run_analysis(self, markdown: str, intent: str) -> DocumentAnalysisResult:
        try:
            asset = load_prompt_asset("catalog", self.settings.IMPORT_PROMPT_VERSION, "document-extract")
        except PromptAssetError as exc:
            logger.error("import_prompt_missing version=%s", exc.version)
            raise CatalogError(503, "AI_UNAVAILABLE", "Prompt phân tích tài liệu chưa được đóng gói.") from exc

        clipped = markdown
        extra = ""
        if len(markdown) > self.settings.IMPORT_AI_MAX_INPUT_CHARS:
            clipped = markdown[: self.settings.IMPORT_AI_MAX_INPUT_CHARS]
            extra = "\n\n[CẢNH BÁO HỆ THỐNG: tài liệu dài hơn ngân sách input; đây không phải toàn văn.]\n"

        user_prompt = (
            f"Intent giáo viên: {intent}\n"
            f"{DOCUMENT_EXTRACT_MARKER}\n<<<\n{clipped}{extra}\n>>>\n"
            "Hãy tách ngữ liệu, yêu cầu viết đầy đủ, tóm tắt yêu cầu, ràng buộc và barem nếu có."
        )
        max_tokens = max(int(self.settings.IMPORT_AI_MAX_OUTPUT_TOKENS), 2048)
        try:
            response = await asyncio.wait_for(
                self._ai().generate(
                    user_prompt,
                    system_prompt=asset.text,
                    structured_output=DocumentAnalysisResult,
                    temperature=None,
                    max_tokens=max_tokens,
                ),
                timeout=self.settings.IMPORT_AI_TIMEOUT_SECONDS,
            )
        except TimeoutError as exc:
            raise CatalogError(504, "AI_UNAVAILABLE", "Phân tích quá thời gian. File gốc và Markdown vẫn còn.") from exc
        except (AiUnavailableError, AiTimeoutError, AiConfigurationError, AiRefusalError, AiInvalidOutputError, AiError) as exc:
            logger.error("import_ai_failed code=%s", getattr(exc, "code", type(exc).__name__))
            raise CatalogError(503, "AI_UNAVAILABLE", ERROR_MESSAGES["AI_UNAVAILABLE"]) from exc

        content = response.content
        if isinstance(content, DocumentAnalysisResult):
            return content
        if isinstance(content, str):
            return DocumentAnalysisResult.model_validate_json(content)
        return DocumentAnalysisResult.model_validate(content)

    async def save_draft(self, teacher: User, document_id: uuid.UUID, body: dict[str, Any]) -> dict[str, Any]:
        document = await self._recover_stale(await self._owned(teacher, document_id))
        if document.status == "CONFIRMED":
            raise CatalogError(409, "IMPORT_NOT_READY", "Tài liệu đã xác nhận, không sửa bản nháp import.")
        if "markdown" in body:
            markdown = _text(body.get("markdown"), "markdown", required=False, max_len=self.settings.IMPORT_MAX_MARKDOWN_CHARS * 2)
            document.teacher_markdown = markdown
            document.teacher_markdown_sha256 = sha256_text(markdown)
        if "draft" in body:
            draft = body.get("draft")
            if draft is not None and not isinstance(draft, dict):
                raise CatalogError(400, "VALIDATION", ERROR_MESSAGES["VALIDATION"], {"draft": "Phải là đối tượng."})
            document.teacher_draft_json = draft
            document.teacher_draft_markdown_sha256 = self.current_markdown_sha(document)
        if "selectedItemIds" in body:
            raw = body.get("selectedItemIds") or []
            if not isinstance(raw, list):
                raise CatalogError(400, "VALIDATION", ERROR_MESSAGES["VALIDATION"], {"selectedItemIds": "Phải là mảng."})
            document.selected_item_ids = [str(item) for item in raw if str(item).strip()]
        if "intent" in body:
            intent_key = str(body.get("intent") or "").strip().upper()
            if intent_key not in ALLOWED_INTENTS:
                raise CatalogError(400, "VALIDATION", "Loại tài liệu không hợp lệ.")
            document.intent = intent_key
        if "gradeLevel" in body:
            document.grade_level = _grade(body.get("gradeLevel"))
        if "genre" in body:
            document.genre = _genre(body.get("genre"))
        if "topicId" in body:
            document.topic_id = _optional_uuid(body.get("topicId"))
        document.updated_at = utcnow()
        if document.status in {"CONVERTED", "FAILED"}:
            document.status = "REVIEW" if document.teacher_draft_json or document.analysis_json else document.status
        await self.session.commit()
        return self._dict(document, full=True)

    async def confirm(self, teacher: User, document_id: uuid.UUID, body: dict[str, Any] | None = None) -> dict[str, Any]:
        result = await self.session.execute(
            select(TeacherDocument).where(TeacherDocument.id == document_id).with_for_update()
        )
        document = result.scalar_one_or_none()
        if document is None or document.owner_teacher_id != teacher.id:
            if document is None:
                raise CatalogError(404, "NOT_FOUND", ERROR_MESSAGES["NOT_FOUND"])
            raise CatalogError(403, "ACCESS_DENIED", ERROR_MESSAGES["ACCESS_DENIED"])
        if document.status == "CONFIRMED" and (
            document.created_material_ids or document.created_prompt_ids or document.created_rubric_ids
        ):
            return self._dict(document, full=True)
        if document.needs_ocr:
            raise CatalogError(422, "IMPORT_NEEDS_OCR", ERROR_MESSAGES["IMPORT_NEEDS_OCR"])
        draft = document.teacher_draft_json or document.analysis_json
        if not draft:
            raise CatalogError(400, "IMPORT_NOT_READY", ERROR_MESSAGES["IMPORT_NOT_READY"])

        if body:
            if "selectedItemIds" in body:
                document.selected_item_ids = [str(item) for item in (body.get("selectedItemIds") or [])]
            if "draft" in body and isinstance(body.get("draft"), dict):
                document.teacher_draft_json = body["draft"]
                draft = document.teacher_draft_json
            if "gradeLevel" in body:
                document.grade_level = _grade(body.get("gradeLevel"))
            if "genre" in body:
                document.genre = _genre(body.get("genre"))
            if "topicId" in body:
                document.topic_id = _optional_uuid(body.get("topicId"))

        public = public_analysis(draft) or {}
        selected = set(str(item) for item in (document.selected_item_ids or []))
        materials = [item for item in (public.get("materials") or []) if item.get("id") in selected]
        prompts = [item for item in (public.get("prompts") or []) if item.get("id") in selected]
        rubrics = [item for item in (public.get("rubrics") or []) if item.get("id") in selected]
        if not selected:
            raise CatalogError(400, "VALIDATION", "Hãy chọn ít nhất một mục để lưu vào kho.")
        if not materials and not prompts and not rubrics:
            raise CatalogError(400, "VALIDATION", "Các mục đã chọn không còn trong bản rà soát.")

        created_materials: list[str] = []
        created_prompts: list[str] = []
        created_rubrics: list[str] = []
        material_id_map: dict[str, str] = {}
        doc_id = str(document.id)

        try:
            for item in materials:
                created = await self.catalog.create_material(
                    teacher,
                    {
                        "title": item.get("title") or "Ngữ liệu nhập",
                        "author": item.get("author") or "",
                        "sourceInfo": item.get("sourceInfo") or "",
                        "content": item.get("content") or "",
                        "gradeLevel": document.grade_level,
                        "topicId": str(document.topic_id) if document.topic_id else None,
                        "sourceDocumentId": doc_id,
                    },
                    commit=False,
                )
                created_materials.append(created["id"])
                material_id_map[str(item.get("id"))] = created["id"]

            for item in prompts:
                linked = await self._resolve_prompt_material_ids(
                    teacher, item.get("linkedMaterialIds") or [], material_id_map
                )
                created = await self.catalog.create_prompt(
                    teacher,
                    {
                        "title": item.get("title") or "Đề nguồn nhập",
                        "writingTask": item.get("writingTask") or "",
                        "writingTaskSummary": item.get("writingTaskSummary") or "",
                        "extraGuidance": item.get("extraGuidance") or "",
                        "genre": item.get("genre") or document.genre,
                        "gradeLevel": item.get("gradeLevel") or document.grade_level,
                        "topicId": str(document.topic_id) if document.topic_id else None,
                        "materialIds": linked,
                        "sourceDocumentId": doc_id,
                    },
                    commit=False,
                )
                created_prompts.append(created["id"])

            for item in rubrics:
                criteria = []
                for criterion in item.get("criteria") or []:
                    criteria.append(
                        {
                            "id": criterion.get("id"),
                            "name": criterion.get("name"),
                            "weight": criterion.get("weight"),
                            "guideNote": criterion.get("guideNote") or "",
                            "levels": criterion.get("levels") or [],
                            "requiredElements": criterion.get("requiredElements") or [],
                            "penaltyPerError": criterion.get("penaltyPerError"),
                            "antiPatterns": criterion.get("antiPatterns") or [],
                        }
                    )
                payload = {
                    "title": item.get("title") or "Barem nhập",
                    "shortTitle": item.get("shortTitle") or "",
                    "description": item.get("description") or "",
                    "maxScore": item.get("maxScore"),
                    "scoreStep": item.get("scoreStep", 0.25),
                    "gradeLevel": item.get("gradeLevel") or document.grade_level,
                    "criteria": criteria,
                    "sourceDocumentId": doc_id,
                }
                try:
                    validate_rubric_payload(payload)
                except DomainError as exc:
                    raise CatalogError(400, exc.code, exc.message) from exc
                created = await self.catalog.create_rubric(teacher, payload, commit=False)
                created_rubrics.append(created["id"])
        except CatalogError:
            await self.session.rollback()
            raise

        document.created_material_ids = created_materials
        document.created_prompt_ids = created_prompts
        document.created_rubric_ids = created_rubrics
        document.status = "CONFIRMED"
        document.confirmed_at = utcnow()
        document.updated_at = utcnow()
        await self.session.commit()
        return self._dict(document, full=True)

    async def _resolve_prompt_material_ids(
        self,
        teacher: User,
        raw_ids: list[Any],
        material_id_map: dict[str, str],
    ) -> list[str]:
        """Map extract temp ids to created UUIDs; accept owned catalog UUIDs.

        Specified ids that cannot be resolved are rejected. An empty list stays empty
        so a prompt can be saved incomplete instead of silently linking every material.
        """
        linked: list[str] = []
        seen: set[str] = set()
        invalid: list[str] = []
        for raw in raw_ids:
            key = str(raw or "").strip()
            if not key:
                continue
            mapped = material_id_map.get(key)
            if mapped:
                if mapped not in seen:
                    seen.add(mapped)
                    linked.append(mapped)
                continue
            try:
                uid = uuid.UUID(key)
            except (TypeError, ValueError):
                invalid.append(key)
                continue
            try:
                material = await self.catalog._owned_material(teacher, uid)
            except CatalogError:
                invalid.append(key)
                continue
            mid = str(material.id)
            if mid not in seen:
                seen.add(mid)
                linked.append(mid)
        if invalid:
            raise CatalogError(
                400,
                "VALIDATION",
                "Ngữ liệu liên kết không hợp lệ hoặc không thuộc quyền sở hữu của giáo viên.",
                {"materialIds": ", ".join(invalid)},
            )
        return linked
