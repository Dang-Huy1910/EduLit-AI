"""Alembic upgrade/downgrade for the Socratic reservation revision on the test DB."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

from alembic import command
from alembic.config import Config
from app.db.session import close_db
from tests.conftest import TEST_DB_URL, _sync_url

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
        engine.dispose()
        await close_db()
