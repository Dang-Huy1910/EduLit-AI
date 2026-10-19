"""Set dang.loan password from BOOTSTRAP_TEACHER_PASSWORD.

Revision ID: 0014_teacher_env_password
Revises: 0013_classroom_demo_seed
Create Date: 2026-10-20

0013 seeded the teacher with the shared demo password. This revision
applies the operator secret already present in the environment.
Students stay on the demo password.
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Sequence, Union

revision: str = "0014_teacher_env_password"
down_revision: Union[str, Sequence[str], None] = "0013_classroom_demo_seed"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _reset_teacher() -> None:
    from app.cli import bootstrap_teacher
    from app.config import get_settings

    asyncio.run(bootstrap_teacher(get_settings(), reset_password=True))


def upgrade() -> None:
    with ThreadPoolExecutor(max_workers=1) as pool:
        pool.submit(_reset_teacher).result()


def downgrade() -> None:
    return
