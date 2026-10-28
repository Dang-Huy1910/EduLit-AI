"""Alembic upgrade/downgrade for Socratic revisions on the test DB.

DDL runs on a dedicated sync engine after close_db so it does not deadlock
with the autouse TRUNCATE connection.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from app.ai.adapters import FakeAiAdapter
from app.db.models import User
from app.db.session import close_db, configure_engine, get_session_factory
from app.services.socratic_service import SocraticService
from tests.conftest import TEST_DB_URL, _async_url, _sync_url

BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _alembic_cfg() -> Config:
    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", _sync_url(TEST_DB_URL))
    return cfg


@pytest.mark.asyncio
async def test_upgrade_and_downgrade_0003() -> None:
    await close_db()
    cfg = _alembic_cfg()
    engine = create_engine(_sync_url(TEST_DB_URL), pool_pre_ping=True)
    try:
        command.upgrade(cfg, "head")
        command.downgrade(cfg, "0002_socratic_schema")
        with engine.connect() as conn:
            cols = {
                row[0]
                for row in conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns "
                        "WHERE table_name = 'socratic_sessions'"
                    )
                )
            }
            assert "reservation_token" not in cols

        command.upgrade(cfg, "head")
        with engine.connect() as conn:
            cols = {
                row[0]
                for row in conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns "
                        "WHERE table_name = 'socratic_sessions'"
                    )
                )
            }
            tables = {
                row[0]
                for row in conn.execute(
                    text(
                        "SELECT table_name FROM information_schema.tables "
                        "WHERE table_schema = 'public'"
                    )
                )
            }
        assert "reservation_token" in cols
        assert "reservation_expires_at" in cols
        assert "outline_version" in cols
        assert "assignment_access" in tables

        command.downgrade(cfg, "0002_socratic_schema")
        command.upgrade(cfg, "head")
    finally:
        try:
            command.upgrade(cfg, "head")
        finally:
            engine.dispose()
            await close_db()


@pytest.mark.asyncio
async def test_0019_drops_unused_material_status_enum_and_restores_on_downgrade() -> None:
    await close_db()
    cfg = _alembic_cfg()
    head = ScriptDirectory.from_config(cfg).get_current_head()
    engine = create_engine(_sync_url(TEST_DB_URL), pool_pre_ping=True)
    try:
        for migrate, target, expected_labels in (
            (command.upgrade, "head", []),
            (
                command.downgrade,
                "0018_writing_profile_history",
                ["UPLOADED", "PRIVACY_REVIEW", "READY", "FAILED"],
            ),
            (command.upgrade, "head", []),
        ):
            migrate(cfg, target)
            with engine.connect() as conn:
                version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
                enum_type = conn.execute(
                    text("SELECT to_regtype('material_version_status')")
                ).scalar_one()
                labels = conn.execute(
                    text(
                        "SELECT enumlabel FROM pg_enum "
                        "WHERE enumtypid = to_regtype('material_version_status') "
                        "ORDER BY enumsortorder"
                    )
                ).scalars().all()
                status_column = conn.execute(
                    text(
                        "SELECT data_type, character_maximum_length "
                        "FROM information_schema.columns "
                        "WHERE table_schema = 'public' AND table_name = 'material_versions' "
                        "AND column_name = 'status'"
                    )
                ).one()
            assert version == (head if target == "head" else target)
            assert status_column == ("character varying", 16)
            assert enum_type == ("material_version_status" if expected_labels else None)
            assert labels == expected_labels
    finally:
        try:
            command.upgrade(cfg, "head")
        finally:
            engine.dispose()
            await close_db()


@pytest.mark.asyncio
async def test_0017_makes_classroom_term_and_join_code_required() -> None:
    await close_db()
    cfg = _alembic_cfg()
    engine = create_engine(_sync_url(TEST_DB_URL), pool_pre_ping=True)
    teacher_id = uuid.uuid4()
    classroom_id = uuid.uuid4()
    try:
        command.upgrade(cfg, "head")
        command.downgrade(cfg, "0016_writing_profile")
        with engine.begin() as conn:
            version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            assert version == "0016_writing_profile"
            conn.execute(
                text(
                    "INSERT INTO users (id, login_id, email, display_name, password_hash, role, status) "
                    "VALUES (:id, :login, :email, 'Legacy Teacher', 'x', 'TEACHER', 'ACTIVE')"
                ),
                {
                    "id": teacher_id,
                    "login": f"legacy_{teacher_id.hex[:8]}",
                    "email": f"legacy_{teacher_id.hex[:8]}@test.local",
                },
            )
            conn.execute(
                text(
                    "INSERT INTO classrooms (id, owner_teacher_id, code, name, grade_level) "
                    "VALUES (:id, :teacher_id, 'LEGACY', 'Legacy Classroom', 11)"
                ),
                {"id": classroom_id, "teacher_id": teacher_id},
            )
        command.upgrade(cfg, "head")
        with engine.connect() as conn:
            columns = {
                row.column_name: row.is_nullable
                for row in conn.execute(
                    text(
                        "SELECT column_name, is_nullable FROM information_schema.columns "
                        "WHERE table_name = 'classrooms'"
                    )
                )
            }
            missing_join_codes = conn.execute(
                text("SELECT count(*) FROM classrooms WHERE join_code IS NULL")
            ).scalar_one()
            legacy_classroom = conn.execute(
                text("SELECT term_id, join_code FROM classrooms WHERE id = :id"),
                {"id": classroom_id},
            ).one()
        assert columns["term_id"] == "NO"
        assert columns["join_code"] == "NO"
        assert missing_join_codes == 0
        assert legacy_classroom.term_id is not None
        assert len(legacy_classroom.join_code) == 6
    finally:
        try:
            command.upgrade(cfg, "head")
        finally:
            engine.dispose()
            await close_db()


@pytest.mark.asyncio
async def test_0004_backfills_legacy_outline_and_keeps_history() -> None:
    await close_db()
    cfg = _alembic_cfg()
    engine = create_engine(_sync_url(TEST_DB_URL), pool_pre_ping=True)
    student_id = uuid.uuid4()
    assignment_id = uuid.uuid4()
    session_id = uuid.uuid4()
    try:
        command.downgrade(cfg, "0002_socratic_schema")
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO users (
                        id, login_id, email, display_name, password_hash, role, status
                    ) VALUES (
                        :uid, :login, :email, 'Legacy Student', 'x', 'STUDENT', 'ACTIVE'
                    )
                    """
                ),
                {
                    "uid": student_id,
                    "login": f"legacy_{student_id.hex[:8]}",
                    "email": f"legacy_{student_id.hex[:8]}@test.local",
                },
            )
            conn.execute(
                text(
                    """
                    INSERT INTO assignment_revisions (
                        id, code, title, instructions, genre, rubric, context_chunks, status
                    ) VALUES (
                        :aid, :code, 'Đề cũ', '{}'::jsonb, 'NLXH', '{}'::jsonb, '[]'::jsonb, 'PUBLISHED'
                    )
                    """
                ),
                {"aid": assignment_id, "code": f"OLD_{student_id.hex[:8]}"},
            )
            conn.execute(
                text(
                    """
                    INSERT INTO socratic_sessions (
                        id, student_id, assignment_revision_id, state, version
                    ) VALUES (
                        :sid, :uid, :aid, 'OUTLINE', 1
                    )
                    """
                ),
                {"sid": session_id, "uid": student_id, "aid": assignment_id},
            )
            conn.execute(
                text(
                    """
                    INSERT INTO outline_revisions (
                        session_id, revision, content, author, review_status
                    ) VALUES
                        (:sid, 1, '{"thesis": "Ban đầu", "sections": [{"title": "Mở"}]}'::jsonb, 'STUDENT', 'SUPERSEDED'),
                        (:sid, 2, '{"thesis": "Hiện hành", "sections": [{"title": "Thân"}]}'::jsonb, 'STUDENT', 'ACCEPTED')
                    """
                ),
                {"sid": session_id},
            )

        command.upgrade(cfg, "0003_socratic_reservation_access")
        with engine.connect() as conn:
            version_after_0003 = conn.execute(
                text("SELECT outline_version FROM socratic_sessions WHERE id = :sid"),
                {"sid": session_id},
            ).scalar_one()
        assert version_after_0003 == 0

        with engine.begin() as conn:
            conn.execute(text("DROP INDEX IF EXISTS outline_revisions_one_accepted_per_session"))
            conn.execute(
                text(
                    """
                    INSERT INTO outline_revisions (
                        session_id, revision, content, author, review_status
                    ) VALUES (
                        :sid, 3, '{"thesis": "Bản trùng ACCEPTED", "sections": [{"title": "Kết"}]}'::jsonb,
                        'STUDENT', 'ACCEPTED'
                    )
                    """
                ),
                {"sid": session_id},
            )

        command.upgrade(cfg, "head")
        with engine.connect() as conn:
            version = conn.execute(
                text("SELECT outline_version FROM socratic_sessions WHERE id = :sid"),
                {"sid": session_id},
            ).scalar_one()
            rows = list(
                conn.execute(
                    text(
                        "SELECT revision, review_status, content "
                        "FROM outline_revisions WHERE session_id = :sid "
                        "ORDER BY revision"
                    ),
                    {"sid": session_id},
                )
            )
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO assignment_access (assignment_revision_id, student_id)
                    VALUES (:aid, :uid)
                    """
                ),
                {"aid": assignment_id, "uid": student_id},
            )
        assert version == 3
        assert [r[0] for r in rows] == [1, 2, 3]
        statuses = {r[0]: r[1] for r in rows}
        assert statuses[1] == "SUPERSEDED"
        assert statuses[2] == "SUPERSEDED"
        assert statuses[3] == "ACCEPTED"
        assert rows[0][2]["thesis"] == "Ban đầu"
        assert rows[1][2]["thesis"] == "Hiện hành"
        assert rows[2][2]["thesis"] == "Bản trùng ACCEPTED"

        configure_engine(_async_url(TEST_DB_URL), null_pool=True)
        factory = get_session_factory()
        async with factory() as db:
            user = await db.get(User, student_id)
            assert user is not None
            svc = SocraticService(db, ai_port=FakeAiAdapter())
            current = await svc.get_current_outline(session_id, user)
            assert current is not None
            assert current.revision == 3
            assert current.content["thesis"] == "Bản trùng ACCEPTED"
            updated = await svc.update_outline(
                session_id,
                user,
                {"thesis": "Sửa tiếp sau nâng cấp", "sections": [{"title": "Thân"}]},
                expected_version=3,
            )
            assert updated.revision == 4
            assert updated.content["thesis"] == "Sửa tiếp sau nâng cấp"
    finally:
        await close_db()
        command.upgrade(cfg, "head")
        engine.dispose()
        await close_db()
