"""Load 11A14 classroom demo roster, papers, and published grades.

Revision ID: 0013_classroom_demo_seed
Revises: 0012_teaching_insights
Create Date: 2026-10-19

Idempotent data migration. Does not drop existing rows. Images come from
frontend mock files copied into the API image as DEMO_FRONTEND_ROOT.

The seed uses asyncio. Always run it on a worker thread so this revision
works both from `alembic upgrade head` (sync) and from FastAPI lifespan
(already has a running event loop).
"""

from __future__ import annotations

import asyncio
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Sequence, Union

revision: str = "0013_classroom_demo_seed"
down_revision: Union[str, Sequence[str], None] = "0012_teaching_insights"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _run_seed() -> None:
    os.environ["SEED_CLASSROOM_DEMO"] = "1"
    scripts = Path(__file__).resolve().parents[2] / "scripts"
    if str(scripts) not in sys.path:
        sys.path.insert(0, str(scripts))
    from seed_classroom_demo import MOCK_DIR, PUBLIC_ROOT, run

    roster = MOCK_DIR / "roster_11a14.json"
    manifest = MOCK_DIR / "submissionsManifest.ts"
    scans = PUBLIC_ROOT / "submissions"
    if not roster.is_file() or not manifest.is_file() or not scans.is_dir():
        raise RuntimeError(
            "Classroom demo mock files are missing. "
            f"roster={roster.is_file()} manifest={manifest.is_file()} scans={scans} "
            "Set DEMO_FRONTEND_ROOT or copy roster/manifest/scans into the API image."
        )
    asyncio.run(run(apply=True, allow_remote=True))


def upgrade() -> None:
    with ThreadPoolExecutor(max_workers=1) as pool:
        pool.submit(_run_seed).result()


def downgrade() -> None:
    # Keep demo students and papers; this revision is additive.
    return
