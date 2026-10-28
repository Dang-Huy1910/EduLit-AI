"""Feature extension migrations on the dedicated test database, including seed 0013."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import IntegrityError

from alembic import command
from alembic.config import Config
from app.db.models import Assignment, AssessmentResult, SubmissionAttempt, TeacherDocument
from app.db.session import close_db
from tests.conftest import TEST_DB_URL, _sync_url

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REVISION_0019 = "0019_drop_material_status_enum"
REVISION_0020 = "0020_assignment_late_policy"
REVISION_0021 = "0021_teacher_document_ocr"
REVISION_0022 = "0022_revision_rounds"
LATE_COLUMNS = {"late_policy", "due_extensions"}
OCR_COLUMNS = {
    "ocr_status",
    "ocr_attempt_count",
    "ocr_lease_token",
    "ocr_lease_expires_at",
    "ocr_page_count",
    "ocr_pages_done",
    "ocr_last_error",
    "ocr_finished_at",
    "ocr_model_metadata",
}
ROUND_COLUMNS = {"max_revisions", "revision_due_at"}
NEW_COLUMNS = {
    "assignments": LATE_COLUMNS | ROUND_COLUMNS,
    "teacher_documents": OCR_COLUMNS,
    "submission_attempts": {"revision_round"},
    "assessment_results": {"superseded_at"},
}
MODELS = {
    "assignments": Assignment,
    "teacher_documents": TeacherDocument,
    "submission_attempts": SubmissionAttempt,
    "assessment_results": AssessmentResult,
}


def _columns(conn: Connection, table: str) -> set[str]:
    return {column["name"] for column in inspect(conn).get_columns(table)}


def _legacy_rows(conn: Connection) -> dict[str, list]:
    # Capture every original value so downgrade/re-upgrade cannot silently alter it.
    return {
        table: list(
            conn.execute(
                text(f"SELECT to_jsonb(t) - :columns FROM {table} AS t ORDER BY id"),
                {"columns": sorted(columns)},
            ).scalars()
        )
        for table, columns in NEW_COLUMNS.items()
    }


def _assert_schema_matches_models(conn: Connection) -> None:
    for table, names in NEW_COLUMNS.items():
        reflected = {column["name"]: column for column in inspect(conn).get_columns(table)}
        for name in names:
            column = reflected[name]
            model_column = MODELS[table].__table__.c[name]
            assert column["type"].compile(dialect=conn.dialect) == model_column.type.compile(
                dialect=conn.dialect
            )
            assert column["nullable"] == model_column.nullable
            if model_column.server_default is None:
                assert column["default"] is None
            else:
                assert column["default"] is not None
                assert (
                    conn.execute(text(f"SELECT {column['default']}")).scalar_one()
                    == conn.execute(text(f"SELECT {model_column.server_default.arg}")).scalar_one()
                )


def _assert_defaults(conn: Connection) -> None:
    assignments = conn.execute(
        text("SELECT late_policy, due_extensions, max_revisions, revision_due_at FROM assignments")
    ).all()
    attempts = conn.execute(text("SELECT revision_round FROM submission_attempts")).scalars().all()
    results = conn.execute(text("SELECT superseded_at FROM assessment_results")).scalars().all()
    documents = conn.execute(
        text(
            "SELECT ocr_status, ocr_attempt_count, ocr_lease_token, ocr_lease_expires_at, "
            "ocr_page_count, ocr_pages_done, ocr_last_error, ocr_finished_at, ocr_model_metadata "
            "FROM teacher_documents"
        )
    ).all()
    assert assignments
    assert all(row == ("ALLOW_LATE", {}, 0, None) for row in assignments)
    assert len(attempts) == 41
    assert attempts == [1] * 41
    assert len(results) == 41
    assert results == [None] * 41
    assert documents
    assert all(row == ("NONE", 0, None, None, 0, 0, "", None, {}) for row in documents)


def _assert_constraints(conn: Connection) -> None:
    for statement, constraint in (
        ("UPDATE assignments SET late_policy = 'INVALID'", "assignments_late_policy_check"),
        ("UPDATE assignments SET max_revisions = -1", "assignments_max_revisions_check"),
        ("UPDATE assignments SET max_revisions = 3", "assignments_max_revisions_check"),
        (
            "UPDATE submission_attempts SET revision_round = 0",
            "submission_attempts_revision_round_check",
        ),
        (
            "UPDATE teacher_documents SET ocr_status = 'INVALID'",
            "teacher_documents_ocr_status_check",
        ),
    ):
        with pytest.raises(IntegrityError) as error, conn.begin_nested():
            conn.execute(text(statement))
        assert error.value.orig.diag.constraint_name == constraint
    # Exercise all allowed values as well as both revision-limit boundaries.
    with conn.begin_nested() as savepoint:
        for policy in ("ALLOW_LATE", "CLOSE_AT_DUE"):
            conn.execute(text("UPDATE assignments SET late_policy = :value"), {"value": policy})
        for limit in (0, 1, 2):
            conn.execute(text("UPDATE assignments SET max_revisions = :value"), {"value": limit})
        for status in ("NONE", "QUEUED", "PROCESSING", "DONE", "FAILED"):
            conn.execute(
                text("UPDATE teacher_documents SET ocr_status = :value"), {"value": status}
            )
        conn.execute(text("UPDATE submission_attempts SET revision_round = 3"))
        savepoint.rollback()


@pytest.mark.asyncio
async def test_0020_to_0022_from_empty_database_and_stepwise_downgrade() -> None:
    await close_db()
    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", _sync_url(TEST_DB_URL))
    engine = create_engine(_sync_url(TEST_DB_URL), pool_pre_ping=True)
    try:
        command.downgrade(cfg, "base")
        with engine.connect() as conn:
            assert inspect(conn).get_table_names() == ["alembic_version"]
        command.upgrade(cfg, REVISION_0019)
        with engine.begin() as conn:
            # Seed 0013 has no teacher document. Add a legacy scan before migration 0021.
            conn.execute(
                text(
                    "INSERT INTO teacher_documents (owner_teacher_id, original_filename, mime_type, "
                    "byte_size, sha256) SELECT id, 'scan.pdf', 'application/pdf', 1, repeat('0', 64) "
                    "FROM users WHERE role = 'TEACHER' LIMIT 1"
                )
            )
            legacy_rows = _legacy_rows(conn)
        command.upgrade(cfg, REVISION_0022)
        with engine.begin() as conn:
            assert (
                conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
                == REVISION_0022
            )
            _assert_schema_matches_models(conn)
            _assert_defaults(conn)
            _assert_constraints(conn)
            index = next(
                index
                for index in inspect(conn).get_indexes("teacher_documents")
                if index["name"] == "teacher_documents_ocr_claim_idx"
            )
            assert index["column_names"] == ["ocr_status"]
            predicate = index["dialect_options"]["postgresql_where"]
            assert "QUEUED" in predicate and "PROCESSING" in predicate
            assert "NONE" not in predicate and "DONE" not in predicate and "FAILED" not in predicate
            assert _legacy_rows(conn) == legacy_rows

        for target in (REVISION_0021, REVISION_0020, REVISION_0019):
            command.downgrade(cfg, target)
            with engine.connect() as conn:
                assert (
                    conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
                    == target
                )
                assert not ROUND_COLUMNS & _columns(conn, "assignments")
                assert "revision_round" not in _columns(conn, "submission_attempts")
                assert "superseded_at" not in _columns(conn, "assessment_results")
                assert LATE_COLUMNS & _columns(conn, "assignments") == (
                    LATE_COLUMNS if target != REVISION_0019 else set()
                )
                assert OCR_COLUMNS & _columns(conn, "teacher_documents") == (
                    OCR_COLUMNS if target == REVISION_0021 else set()
                )
                constraints = {
                    constraint["name"]
                    for table in NEW_COLUMNS
                    for constraint in inspect(conn).get_check_constraints(table)
                }
                assert "assignments_max_revisions_check" not in constraints
                assert "submission_attempts_revision_round_check" not in constraints
                assert ("assignments_late_policy_check" in constraints) == (target != REVISION_0019)
                assert ("teacher_documents_ocr_status_check" in constraints) == (
                    target == REVISION_0021
                )
                indexes = {
                    index["name"] for index in inspect(conn).get_indexes("teacher_documents")
                }
                assert ("teacher_documents_ocr_claim_idx" in indexes) == (target == REVISION_0021)
                assert _legacy_rows(conn) == legacy_rows

        command.upgrade(cfg, "head")
        with engine.connect() as conn:
            assert (
                conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
                == REVISION_0022
            )
            _assert_schema_matches_models(conn)
            _assert_defaults(conn)
            assert _legacy_rows(conn) == legacy_rows
    finally:
        try:
            command.upgrade(cfg, "head")
        finally:
            engine.dispose()
            await close_db()
