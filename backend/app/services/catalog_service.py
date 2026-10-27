"""Teacher catalog: chuyên đề, ngữ liệu, đề nguồn, barem, lớp."""

from __future__ import annotations

import re
import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import DomainError, ERROR_MESSAGES
from app.core.http import utcnow
from app.db.models import (
    ClassMembership,
    Classroom,
    Material,
    MaterialChunk,
    MaterialVersion,
    Rubric,
    RubricVersion,
    SourcePrompt,
    SourcePromptMaterial,
    Topic,
    User,
    UserRole,
)
from app.services.catalog_errors import CatalogError
from app.services.rubric import validate_rubric_payload

ALLOWED_GENRES = {"NLVH", "NLXH"}
ALLOWED_GRADES = {10, 11, 12}
MATERIAL_CONTENT_MAX = 80_000
TITLE_MAX = 255


def _now():
    return utcnow()


def _require_teacher(user: User) -> None:
    if user.role != UserRole.TEACHER:
        raise CatalogError(403, "TEACHER_REQUIRED", ERROR_MESSAGES["TEACHER_REQUIRED"])


def _text(value: Any, field: str, *, required: bool = True, max_len: int = TITLE_MAX) -> str:
    if value is None:
        text = ""
    elif isinstance(value, str):
        text = value.strip()
    else:
        raise CatalogError(400, "VALIDATION", ERROR_MESSAGES["VALIDATION"], {field: "Giá trị không hợp lệ."})
    if required and not text:
        raise CatalogError(400, "VALIDATION", ERROR_MESSAGES["VALIDATION"], {field: "Không được để trống."})
    if len(text) > max_len:
        raise CatalogError(400, "VALIDATION", ERROR_MESSAGES["VALIDATION"], {field: "Vượt quá độ dài cho phép."})
    return text


def _grade(value: Any) -> int:
    try:
        grade = int(value)
    except (TypeError, ValueError) as exc:
        raise CatalogError(400, "GRADE_LEVEL", "Khối lớp phải là 10, 11 hoặc 12.") from exc
    if grade not in ALLOWED_GRADES:
        raise CatalogError(400, "GRADE_LEVEL", "Khối lớp phải là 10, 11 hoặc 12.")
    return grade


def _genre(value: Any, default: str = "NLVH") -> str:
    raw = str(value or default).strip().upper()
    if raw not in ALLOWED_GENRES:
        raise CatalogError(400, "VALIDATION", "Dạng bài phải là NLVH hoặc NLXH.", {"genre": "Không hợp lệ."})
    return raw


def _as_uuid_list(values: Any, field: str) -> list[uuid.UUID]:
    if values is None:
        return []
    if not isinstance(values, list):
        raise CatalogError(400, "VALIDATION", ERROR_MESSAGES["VALIDATION"], {field: "Phải là danh sách."})
    out: list[uuid.UUID] = []
    for item in values:
        try:
            out.append(uuid.UUID(str(item)))
        except (TypeError, ValueError) as exc:
            raise CatalogError(400, "VALIDATION", ERROR_MESSAGES["VALIDATION"], {field: "ID không hợp lệ."}) from exc
    return out


def unique_chunk_id(material_id: uuid.UUID | str | None, chunk_key: str) -> str:
    """Stable chunk id unique across materials in an assignment snapshot."""
    key = str(chunk_key or "").strip() or "chunk-1"
    mid = str(material_id).strip() if material_id is not None else ""
    if mid and (key.startswith(f"{mid}:") or key.startswith(f"{mid}-")):
        return key[:64]
    if mid:
        return f"{mid}:{key}"[:64]
    return key[:64]


def chunk_pasted_content(
    content: str, title: str, *, material_id: uuid.UUID | str | None = None
) -> list[dict[str, Any]]:
    text = content.strip()
    if not text:
        return []
    parts = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if not parts:
        parts = [text]
    chunks = []
    for index, part in enumerate(parts, start=1):
        chunks.append(
            {
                "chunk_id": unique_chunk_id(material_id, f"chunk-{index}"),
                "title": title if index == 1 else f"{title} ({index})",
                "text": part,
                "sort_order": index,
            }
        )
    return chunks


def material_readiness(content: str, title: str) -> tuple[str, list[str]]:
    missing: list[str] = []
    if not title.strip():
        missing.append("title")
    if not content.strip():
        missing.append("content")
    return ("READY" if not missing else "INCOMPLETE", missing)


def prompt_readiness(writing_task: str, material_ready_count: int) -> tuple[str, list[str]]:
    missing: list[str] = []
    if not writing_task.strip():
        missing.append("writingTask")
    if material_ready_count < 1:
        missing.append("materials")
    return ("READY" if not missing else "INCOMPLETE", missing)


class CatalogService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def _owned_topic(self, teacher: User, topic_id: uuid.UUID | None) -> Topic | None:
        if topic_id is None:
            return None
        topic = await self.session.get(Topic, topic_id)
        if topic is None or topic.owner_teacher_id != teacher.id:
            raise CatalogError(404, "NOT_FOUND", "Không tìm thấy chuyên đề.")
        return topic

    async def _owned_material(self, teacher: User, material_id: uuid.UUID) -> Material:
        result = await self.session.execute(
            select(Material)
            .options(selectinload(Material.versions).selectinload(MaterialVersion.chunks))
            .where(Material.id == material_id)
        )
        material = result.scalar_one_or_none()
        if material is None or material.owner_teacher_id != teacher.id:
            raise CatalogError(404, "NOT_FOUND", "Không tìm thấy ngữ liệu.")
        return material

    async def _owned_prompt(
        self, teacher: User, prompt_id: uuid.UUID, *, for_update: bool = False
    ) -> SourcePrompt:
        stmt = (
            select(SourcePrompt)
            .options(selectinload(SourcePrompt.links))
            .where(SourcePrompt.id == prompt_id)
        )
        if for_update:
            stmt = stmt.with_for_update().execution_options(populate_existing=True)
        result = await self.session.execute(stmt)
        prompt = result.scalar_one_or_none()
        if prompt is None or prompt.owner_teacher_id != teacher.id or prompt.status == "DELETED":
            raise CatalogError(404, "NOT_FOUND", "Không tìm thấy đề nguồn.")
        return prompt

    async def _owned_rubric(self, teacher: User, rubric_id: uuid.UUID) -> Rubric:
        result = await self.session.execute(
            select(Rubric)
            .options(selectinload(Rubric.versions))
            .where(Rubric.id == rubric_id)
        )
        rubric = result.scalar_one_or_none()
        if rubric is None or rubric.owner_teacher_id != teacher.id:
            raise CatalogError(404, "NOT_FOUND", "Không tìm thấy barem.")
        return rubric

    async def _owned_classroom(self, teacher: User, classroom_id: uuid.UUID) -> Classroom:
        classroom = await self.session.get(Classroom, classroom_id)
        if classroom is None or classroom.owner_teacher_id != teacher.id:
            raise CatalogError(404, "NOT_FOUND", "Không tìm thấy lớp.")
        return classroom

    async def _prompt_links(self, prompt_id: uuid.UUID) -> list[SourcePromptMaterial]:
        result = await self.session.execute(
            select(SourcePromptMaterial)
            .where(SourcePromptMaterial.source_prompt_id == prompt_id)
            .order_by(SourcePromptMaterial.sort_order)
        )
        return list(result.scalars().all())

    async def _latest_version(self, material: Material) -> MaterialVersion | None:
        result = await self.session.execute(
            select(MaterialVersion)
            .options(selectinload(MaterialVersion.chunks))
            .where(MaterialVersion.material_id == material.id)
            .order_by(MaterialVersion.version.desc())
            .limit(1)
        )
        return result.scalars().first()

    async def _version_chunks(self, version: MaterialVersion) -> list[MaterialChunk]:
        result = await self.session.execute(
            select(MaterialChunk)
            .where(MaterialChunk.material_version_id == version.id)
            .order_by(MaterialChunk.sort_order)
        )
        return list(result.scalars().all())

    async def _latest_rubric_version(self, rubric_id: uuid.UUID) -> RubricVersion | None:
        result = await self.session.execute(
            select(RubricVersion)
            .where(RubricVersion.rubric_id == rubric_id)
            .order_by(RubricVersion.version.desc())
            .limit(1)
        )
        return result.scalars().first()

    async def _ready_material_count(self, prompt: SourcePrompt) -> int:
        links = await self._prompt_links(prompt.id)
        count = 0
        for link in links:
            material = await self.session.get(Material, link.material_id)
            if material is None:
                continue
            version = await self._latest_version(material)
            if version and version.content.strip() and material.status == "READY":
                count += 1
        return count

    async def list_topics(self, teacher: User) -> list[dict[str, Any]]:
        _require_teacher(teacher)
        result = await self.session.execute(
            select(Topic)
            .where(Topic.owner_teacher_id == teacher.id)
            .order_by(Topic.updated_at.desc())
        )
        return [self._topic_dict(row) for row in result.scalars().all()]

    async def create_topic(self, teacher: User, body: dict[str, Any]) -> dict[str, Any]:
        _require_teacher(teacher)
        topic = Topic(
            owner_teacher_id=teacher.id,
            title=_text(body.get("title"), "title"),
            description=_text(body.get("description"), "description", required=False, max_len=4000),
            grade_level=_grade(body.get("gradeLevel", 11)),
            genre=_genre(body.get("genre")),
            status="ACTIVE",
            updated_at=_now(),
        )
        self.session.add(topic)
        await self.session.commit()
        await self.session.refresh(topic)
        return self._topic_dict(topic)

    async def list_materials(
        self,
        teacher: User,
        *,
        query: str | None = None,
        topic_id: uuid.UUID | None = None,
        grade_level: int | None = None,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        _require_teacher(teacher)
        stmt = (
            select(Material)
            .options(selectinload(Material.versions).selectinload(MaterialVersion.chunks))
            .where(Material.owner_teacher_id == teacher.id)
        )
        if topic_id:
            stmt = stmt.where(Material.topic_id == topic_id)
        if grade_level:
            stmt = stmt.where(Material.grade_level == grade_level)
        if status:
            stmt = stmt.where(Material.status == status.upper())
        result = await self.session.execute(stmt.order_by(Material.updated_at.desc()))
        items = []
        needle = (query or "").strip().lower()
        for material in result.scalars().unique().all():
            payload = await self._material_dict(material)
            if needle and needle not in payload["title"].lower() and needle not in (payload.get("author") or "").lower():
                continue
            items.append(payload)
        return items

    async def get_material(self, teacher: User, material_id: uuid.UUID) -> dict[str, Any]:
        _require_teacher(teacher)
        material = await self._owned_material(teacher, material_id)
        return await self._material_dict(material, full=True)

    # ── Student read-only materials ──────────────────────────────────────────
    # A student reads the ready materials of the teachers who own a class the
    # student is an active member of. There is no write path for students.

    async def _student_teacher_ids(self, student: User) -> list[uuid.UUID]:
        if student.role != UserRole.STUDENT:
            raise CatalogError(403, "STUDENT_REQUIRED", ERROR_MESSAGES["STUDENT_REQUIRED"])
        result = await self.session.execute(
            select(Classroom.owner_teacher_id)
            .join(ClassMembership, ClassMembership.classroom_id == Classroom.id)
            .where(
                ClassMembership.user_id == student.id,
                ClassMembership.membership_role == "STUDENT",
                ClassMembership.status == "ACTIVE",
            )
            .distinct()
        )
        return [row[0] for row in result.all()]

    async def _student_material_view(
        self, material: Material, topics: dict[uuid.UUID, Topic], *, full: bool = False
    ) -> dict[str, Any] | None:
        payload = await self._material_dict(material, full=full)
        if payload["status"] != "READY":
            return None
        topic = topics.get(material.topic_id) if material.topic_id else None
        view: dict[str, Any] = {
            "id": payload["id"],
            "title": payload["title"],
            "author": payload["author"],
            "sourceInfo": payload["sourceInfo"],
            "gradeLevel": payload["gradeLevel"],
            "topicTitle": topic.title if topic else None,
            "genre": topic.genre if topic else None,
            "excerpt": payload["excerpt"],
            "updatedAt": payload["updatedAt"],
        }
        if full:
            view["content"] = payload.get("content") or ""
            view["sourceNotes"] = payload.get("sourceNotes") or []
        return view

    async def _topics_by_id(self, topic_ids: set[uuid.UUID]) -> dict[uuid.UUID, Topic]:
        if not topic_ids:
            return {}
        result = await self.session.execute(select(Topic).where(Topic.id.in_(topic_ids)))
        return {topic.id: topic for topic in result.scalars().all()}

    async def list_student_materials(
        self, student: User, *, query: str | None = None, grade_level: int | None = None
    ) -> list[dict[str, Any]]:
        teacher_ids = await self._student_teacher_ids(student)
        if not teacher_ids:
            return []
        stmt = (
            select(Material)
            .options(selectinload(Material.versions).selectinload(MaterialVersion.chunks))
            .where(Material.owner_teacher_id.in_(teacher_ids), Material.status == "READY")
        )
        if grade_level:
            stmt = stmt.where(Material.grade_level == grade_level)
        materials = (
            await self.session.execute(stmt.order_by(Material.updated_at.desc()))
        ).scalars().unique().all()
        topics = await self._topics_by_id({m.topic_id for m in materials if m.topic_id})
        needle = (query or "").strip().lower()
        items: list[dict[str, Any]] = []
        for material in materials:
            view = await self._student_material_view(material, topics)
            if view is None:
                continue
            if needle and needle not in view["title"].lower() and needle not in (view["author"] or "").lower():
                continue
            items.append(view)
        return items

    async def get_student_material(self, student: User, material_id: uuid.UUID) -> dict[str, Any]:
        teacher_ids = await self._student_teacher_ids(student)
        result = await self.session.execute(
            select(Material)
            .options(selectinload(Material.versions).selectinload(MaterialVersion.chunks))
            .where(Material.id == material_id)
        )
        material = result.scalar_one_or_none()
        not_found = CatalogError(404, "NOT_FOUND", "Không tìm thấy ngữ liệu.")
        if material is None or material.owner_teacher_id not in teacher_ids or material.status != "READY":
            raise not_found
        topics = await self._topics_by_id({material.topic_id} if material.topic_id else set())
        view = await self._student_material_view(material, topics, full=True)
        if view is None:
            raise not_found
        return view

    async def create_material(
        self, teacher: User, body: dict[str, Any], *, commit: bool = True
    ) -> dict[str, Any]:
        _require_teacher(teacher)
        topic = await self._owned_topic(teacher, _optional_uuid(body.get("topicId")))
        title = _text(body.get("title"), "title")
        content = _text(body.get("content"), "content", required=False, max_len=MATERIAL_CONTENT_MAX)
        notes = body.get("sourceNotes") or body.get("source_notes") or []
        if notes and not isinstance(notes, list):
            raise CatalogError(400, "VALIDATION", ERROR_MESSAGES["VALIDATION"], {"sourceNotes": "Phải là mảng."})
        source_notes = [str(n).strip() for n in notes if str(n).strip()]
        status, missing = material_readiness(content, title)
        material = Material(
            owner_teacher_id=teacher.id,
            topic_id=topic.id if topic else None,
            title=title,
            author=_text(body.get("author"), "author", required=False),
            source_info=_text(body.get("sourceInfo") or body.get("source_info"), "sourceInfo", required=False, max_len=4000),
            grade_level=_grade(body.get("gradeLevel", 11)),
            status=status,
            source_document_id=_optional_uuid(body.get("sourceDocumentId")),
            updated_at=_now(),
        )
        self.session.add(material)
        await self.session.flush()
        version = MaterialVersion(
            material_id=material.id,
            version=1,
            content=content,
            source_notes=source_notes,
            status="READY" if content else "DRAFT",
        )
        self.session.add(version)
        await self.session.flush()
        for chunk in chunk_pasted_content(content, title, material_id=material.id):
            self.session.add(
                MaterialChunk(
                    material_version_id=version.id,
                    chunk_id=chunk["chunk_id"],
                    title=chunk["title"],
                    text=chunk["text"],
                    sort_order=chunk["sort_order"],
                )
            )
        if commit:
            await self.session.commit()
            return await self.get_material(teacher, material.id)
        await self.session.flush()
        return await self._material_dict(material, full=True)

    async def update_material(
        self, teacher: User, material_id: uuid.UUID, body: dict[str, Any]
    ) -> dict[str, Any]:
        _require_teacher(teacher)
        material = await self._owned_material(teacher, material_id)
        if "title" in body:
            material.title = _text(body.get("title"), "title")
        if "author" in body:
            material.author = _text(body.get("author"), "author", required=False)
        if "sourceInfo" in body or "source_info" in body:
            material.source_info = _text(
                body.get("sourceInfo") or body.get("source_info"),
                "sourceInfo",
                required=False,
                max_len=4000,
            )
        if "gradeLevel" in body:
            material.grade_level = _grade(body.get("gradeLevel"))
        if "topicId" in body:
            topic = await self._owned_topic(teacher, _optional_uuid(body.get("topicId")))
            material.topic_id = topic.id if topic else None

        latest = await self._latest_version(material)
        content = latest.content if latest else ""
        source_notes = list(latest.source_notes) if latest else []
        replace_content = "content" in body or "sourceNotes" in body or "source_notes" in body
        if "content" in body:
            content = _text(body.get("content"), "content", required=False, max_len=MATERIAL_CONTENT_MAX)
        if "sourceNotes" in body or "source_notes" in body:
            notes = body.get("sourceNotes") or body.get("source_notes") or []
            if not isinstance(notes, list):
                raise CatalogError(400, "VALIDATION", ERROR_MESSAGES["VALIDATION"], {"sourceNotes": "Phải là mảng."})
            source_notes = [str(n).strip() for n in notes if str(n).strip()]

        if replace_content:
            next_version_no = (latest.version + 1) if latest else 1
            version = MaterialVersion(
                material_id=material.id,
                version=next_version_no,
                content=content,
                source_notes=source_notes,
                status="READY" if content.strip() else "DRAFT",
            )
            self.session.add(version)
            await self.session.flush()
            for chunk in chunk_pasted_content(content, material.title, material_id=material.id):
                self.session.add(
                    MaterialChunk(
                        material_version_id=version.id,
                        chunk_id=chunk["chunk_id"],
                        title=chunk["title"],
                        text=chunk["text"],
                        sort_order=chunk["sort_order"],
                    )
                )
        status, _missing = material_readiness(content, material.title)
        material.status = status
        material.updated_at = _now()
        await self.session.commit()
        return await self.get_material(teacher, material.id)

    async def list_prompts(
        self,
        teacher: User,
        *,
        query: str | None = None,
        topic_id: uuid.UUID | None = None,
        grade_level: int | None = None,
        genre: str | None = None,
        status: str | None = None,
        ready_only: bool = False,
    ) -> list[dict[str, Any]]:
        _require_teacher(teacher)
        stmt = (
            select(SourcePrompt)
            .options(selectinload(SourcePrompt.links))
            .where(SourcePrompt.owner_teacher_id == teacher.id, SourcePrompt.status != "DELETED")
        )
        if topic_id:
            stmt = stmt.where(SourcePrompt.topic_id == topic_id)
        if grade_level:
            stmt = stmt.where(SourcePrompt.grade_level == grade_level)
        if genre:
            stmt = stmt.where(SourcePrompt.genre == genre.upper())
        if status:
            stmt = stmt.where(SourcePrompt.status == status.upper())
        result = await self.session.execute(stmt.order_by(SourcePrompt.updated_at.desc()))
        needle = (query or "").strip().lower()
        items = []
        for prompt in result.scalars().unique().all():
            payload = await self._prompt_dict(prompt)
            if ready_only and not payload["ready"]:
                continue
            if needle and needle not in payload["title"].lower() and needle not in payload["writingTask"].lower():
                continue
            items.append(payload)
        return items

    async def get_prompt(self, teacher: User, prompt_id: uuid.UUID) -> dict[str, Any]:
        _require_teacher(teacher)
        prompt = await self._owned_prompt(teacher, prompt_id)
        return await self._prompt_dict(prompt, full=True)

    async def delete_prompt(self, teacher: User, prompt_id: uuid.UUID) -> None:
        _require_teacher(teacher)
        result = await self.session.execute(
            select(SourcePrompt)
            .where(SourcePrompt.id == prompt_id, SourcePrompt.owner_teacher_id == teacher.id)
            .with_for_update()
        )
        prompt = result.scalar_one_or_none()
        if prompt is None:
            raise CatalogError(404, "NOT_FOUND", "Không tìm thấy đề nguồn.")
        # Keep references and published snapshots intact when removing a reusable source.
        prompt.status = "DELETED"
        prompt.updated_at = _now()
        await self.session.commit()

    async def create_prompt(
        self, teacher: User, body: dict[str, Any], *, commit: bool = True
    ) -> dict[str, Any]:
        _require_teacher(teacher)
        topic = await self._owned_topic(teacher, _optional_uuid(body.get("topicId")))
        material_ids = _as_uuid_list(body.get("materialIds"), "materialIds")
        prompt = SourcePrompt(
            owner_teacher_id=teacher.id,
            topic_id=topic.id if topic else None,
            title=_text(body.get("title"), "title"),
            writing_task=_text(body.get("writingTask"), "writingTask", required=False, max_len=MATERIAL_CONTENT_MAX),
            writing_task_summary=_text(
                body.get("writingTaskSummary"), "writingTaskSummary", required=False, max_len=2000
            ),
            extra_guidance=_text(body.get("extraGuidance"), "extraGuidance", required=False, max_len=8000),
            genre=_genre(body.get("genre")),
            grade_level=_grade(body.get("gradeLevel", 11)),
            status="DRAFT",
            source_document_id=_optional_uuid(body.get("sourceDocumentId")),
            updated_at=_now(),
        )
        self.session.add(prompt)
        await self.session.flush()
        await self._replace_prompt_materials(teacher, prompt, material_ids)
        ready_count = await self._ready_material_count(prompt)
        status, _missing = prompt_readiness(prompt.writing_task, ready_count)
        prompt.status = status
        if commit:
            await self.session.commit()
            return await self.get_prompt(teacher, prompt.id)
        await self.session.flush()
        return await self._prompt_dict(prompt, full=True)

    async def update_prompt(
        self, teacher: User, prompt_id: uuid.UUID, body: dict[str, Any]
    ) -> dict[str, Any]:
        _require_teacher(teacher)
        prompt = await self._owned_prompt(teacher, prompt_id, for_update=True)
        if "title" in body:
            prompt.title = _text(body.get("title"), "title")
        if "writingTask" in body:
            prompt.writing_task = _text(
                body.get("writingTask"), "writingTask", required=False, max_len=MATERIAL_CONTENT_MAX
            )
        if "extraGuidance" in body:
            prompt.extra_guidance = _text(
                body.get("extraGuidance"), "extraGuidance", required=False, max_len=8000
            )
        if "writingTaskSummary" in body:
            prompt.writing_task_summary = _text(
                body.get("writingTaskSummary"), "writingTaskSummary", required=False, max_len=2000
            )
        if "genre" in body:
            prompt.genre = _genre(body.get("genre"))
        if "gradeLevel" in body:
            prompt.grade_level = _grade(body.get("gradeLevel"))
        if "topicId" in body:
            topic = await self._owned_topic(teacher, _optional_uuid(body.get("topicId")))
            prompt.topic_id = topic.id if topic else None
        if "materialIds" in body:
            await self._replace_prompt_materials(
                teacher, prompt, _as_uuid_list(body.get("materialIds"), "materialIds")
            )
        ready_count = await self._ready_material_count(prompt)
        status, _missing = prompt_readiness(prompt.writing_task, ready_count)
        prompt.status = status
        prompt.updated_at = _now()
        await self.session.commit()
        return await self.get_prompt(teacher, prompt.id)

    async def _replace_prompt_materials(
        self, teacher: User, prompt: SourcePrompt, material_ids: list[uuid.UUID]
    ) -> None:
        await self.session.execute(
            delete(SourcePromptMaterial).where(SourcePromptMaterial.source_prompt_id == prompt.id)
        )
        await self.session.flush()
        seen: set[uuid.UUID] = set()
        for order, material_id in enumerate(material_ids):
            if material_id in seen:
                continue
            seen.add(material_id)
            material = await self._owned_material(teacher, material_id)
            self.session.add(
                SourcePromptMaterial(
                    source_prompt_id=prompt.id,
                    material_id=material.id,
                    sort_order=order,
                )
            )
        await self.session.flush()
        self.session.expire(prompt, ["links"])

    async def list_rubrics(self, teacher: User) -> list[dict[str, Any]]:
        _require_teacher(teacher)
        result = await self.session.execute(
            select(Rubric)
            .options(selectinload(Rubric.versions))
            .where(Rubric.owner_teacher_id == teacher.id)
            .order_by(Rubric.updated_at.desc())
        )
        return [await self._rubric_dict(row) for row in result.scalars().unique().all()]

    async def get_rubric(self, teacher: User, rubric_id: uuid.UUID) -> dict[str, Any]:
        _require_teacher(teacher)
        return await self._rubric_dict(await self._owned_rubric(teacher, rubric_id), full=True)

    async def create_rubric(
        self, teacher: User, body: dict[str, Any], *, commit: bool = True
    ) -> dict[str, Any]:
        _require_teacher(teacher)
        try:
            canonical = validate_rubric_payload(body)
        except DomainError as exc:
            raise CatalogError(400, exc.code, exc.message) from exc
        rubric = Rubric(
            owner_teacher_id=teacher.id,
            title=canonical["title"],
            short_title=canonical["shortTitle"],
            description=canonical["description"],
            status="READY",
            source_document_id=_optional_uuid(body.get("sourceDocumentId")),
            updated_at=_now(),
        )
        self.session.add(rubric)
        await self.session.flush()
        version = RubricVersion(
            rubric_id=rubric.id,
            version=1,
            max_score=canonical["maxScore"],
            score_step=canonical["scoreStep"],
            criteria=canonical["criteria"],
            status="APPROVED",
        )
        self.session.add(version)
        if commit:
            await self.session.commit()
            return await self.get_rubric(teacher, rubric.id)
        await self.session.flush()
        return await self._rubric_dict(rubric, full=True)

    async def update_rubric(
        self, teacher: User, rubric_id: uuid.UUID, body: dict[str, Any]
    ) -> dict[str, Any]:
        """Edit catalog rubric by inserting a new version. Does not mutate published assignments."""
        _require_teacher(teacher)
        rubric = await self._owned_rubric(teacher, rubric_id)
        latest = await self._latest_rubric_version(rubric.id)
        base = {
            "title": body.get("title", rubric.title),
            "shortTitle": body.get("shortTitle", rubric.short_title),
            "description": body.get("description", rubric.description),
            "version": body.get("version", f"v{(latest.version + 1) if latest else 1}"),
            "gradeLevel": body.get("gradeLevel", 11),
            "maxScore": body.get("maxScore", float(latest.max_score) if latest else 4),
            "scoreStep": body.get("scoreStep", float(latest.score_step) if latest else 0.25),
            "criteria": body.get("criteria", latest.criteria if latest else []),
        }
        try:
            canonical = validate_rubric_payload(base)
        except DomainError as exc:
            raise CatalogError(400, exc.code, exc.message) from exc
        rubric.title = canonical["title"]
        rubric.short_title = canonical["shortTitle"]
        rubric.description = canonical["description"]
        rubric.updated_at = _now()
        version = RubricVersion(
            rubric_id=rubric.id,
            version=(latest.version + 1) if latest else 1,
            max_score=canonical["maxScore"],
            score_step=canonical["scoreStep"],
            criteria=canonical["criteria"],
            status="APPROVED",
        )
        self.session.add(version)
        await self.session.commit()
        return await self.get_rubric(teacher, rubric.id)

    def _topic_dict(self, topic: Topic) -> dict[str, Any]:
        return {
            "id": str(topic.id),
            "title": topic.title,
            "description": topic.description,
            "gradeLevel": topic.grade_level,
            "genre": topic.genre,
            "status": topic.status,
            "updatedAt": topic.updated_at.isoformat() if topic.updated_at else None,
        }

    async def _material_dict(self, material: Material, *, full: bool = False) -> dict[str, Any]:
        latest = await self._latest_version(material)
        content = latest.content if latest else ""
        status, missing = material_readiness(content, material.title)
        payload: dict[str, Any] = {
            "id": str(material.id),
            "kind": "material",
            "title": material.title,
            "author": material.author,
            "sourceInfo": material.source_info,
            "gradeLevel": material.grade_level,
            "sourceDocumentId": str(material.source_document_id) if material.source_document_id else None,
            "topicId": str(material.topic_id) if material.topic_id else None,
            "status": status,
            "missing": missing,
            "version": latest.version if latest else 0,
            "excerpt": (content[:280] + ("…" if len(content) > 280 else "")) if content else "",
            "updatedAt": material.updated_at.isoformat() if material.updated_at else None,
        }
        if full:
            payload["content"] = content
            payload["sourceNotes"] = list(latest.source_notes) if latest else []
            chunks = await self._version_chunks(latest) if latest else []
            payload["chunks"] = [
                {
                    "chunkId": chunk.chunk_id,
                    "title": chunk.title,
                    "text": chunk.text,
                    "sortOrder": chunk.sort_order,
                }
                for chunk in chunks
            ]
        return payload

    async def _prompt_dict(self, prompt: SourcePrompt, *, full: bool = False) -> dict[str, Any]:
        ready_count = await self._ready_material_count(prompt)
        status, missing = prompt_readiness(prompt.writing_task, ready_count)
        if prompt.status == "DELETED":
            status = "DELETED"
        materials = []
        for link in await self._prompt_links(prompt.id):
            material = await self.session.get(Material, link.material_id)
            if material is None:
                continue
            materials.append(await self._material_dict(material, full=full))
        payload: dict[str, Any] = {
            "id": str(prompt.id),
            "kind": "prompt",
            "title": prompt.title,
            "writingTask": prompt.writing_task,
            "writingTaskSummary": prompt.writing_task_summary,
            "extraGuidance": prompt.extra_guidance,
            "sourceDocumentId": str(prompt.source_document_id) if prompt.source_document_id else None,
            "genre": prompt.genre,
            "gradeLevel": prompt.grade_level,
            "topicId": str(prompt.topic_id) if prompt.topic_id else None,
            "status": status,
            "ready": status == "READY",
            "missing": missing,
            "materialCount": len(materials),
            "materials": materials,
            "updatedAt": prompt.updated_at.isoformat() if prompt.updated_at else None,
        }
        return payload

    async def _rubric_dict(self, rubric: Rubric, *, full: bool = True) -> dict[str, Any]:
        latest = await self._latest_rubric_version(rubric.id)
        payload: dict[str, Any] = {
            "id": str(rubric.id),
            "kind": "rubric",
            "title": rubric.title,
            "shortTitle": rubric.short_title or rubric.title,
            "description": rubric.description,
            "status": rubric.status,
            "sourceDocumentId": str(rubric.source_document_id) if rubric.source_document_id else None,
            "version": latest.version if latest else 0,
            "maxScore": float(latest.max_score) if latest else 0,
            "scoreStep": float(latest.score_step) if latest else 0.25,
            "criteriaCount": len(latest.criteria) if latest else 0,
            "updatedAt": rubric.updated_at.isoformat() if rubric.updated_at else None,
        }
        if full and latest:
            payload["criteria"] = latest.criteria
            payload["rubricVersionId"] = str(latest.id)
        return payload


def _optional_uuid(value: Any) -> uuid.UUID | None:
    if value in (None, "", "null"):
        return None
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise CatalogError(400, "VALIDATION", ERROR_MESSAGES["VALIDATION"], {"id": "ID không hợp lệ."}) from exc
