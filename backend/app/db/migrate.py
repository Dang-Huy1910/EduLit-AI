"""Run Alembic upgrades from the API process."""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger("edulit.migrate")


def upgrade_head() -> None:
    from alembic import command
    from alembic.config import Config

    root = Path(__file__).resolve().parents[2]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    logger.info("Running alembic upgrade head from %s", root)
    command.upgrade(cfg, "head")
