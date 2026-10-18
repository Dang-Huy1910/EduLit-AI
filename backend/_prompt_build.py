"""Copy canonical `prompts/socratic/*.md` into the installable package at build.

The official source is the repository file `prompts/socratic/`. This hook
runs during sdist/wheel/editable builds so a second copy is never edited
by hand.
"""

from __future__ import annotations

import shutil
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent
CANONICAL_DIR = BACKEND_ROOT.parent / "prompts" / "socratic"
PACKAGE_DIR = BACKEND_ROOT / "app" / "ai" / "prompts" / "socratic"


def sync_prompt_assets() -> None:
    if not CANONICAL_DIR.is_dir():
        return
    PACKAGE_DIR.mkdir(parents=True, exist_ok=True)
    for src in sorted(CANONICAL_DIR.glob("*.md")):
        shutil.copy2(src, PACKAGE_DIR / src.name)


try:
    from setuptools.command.build_py import build_py as _build_py
    from setuptools.command.sdist import sdist as _sdist

    try:
        from setuptools.command.editable_wheel import editable_wheel as _editable_wheel
    except ImportError:  # pragma: no cover
        _editable_wheel = None

    class build_py(_build_py):
        def run(self) -> None:
            sync_prompt_assets()
            super().run()

    class sdist(_sdist):
        def run(self) -> None:
            sync_prompt_assets()
            super().run()

    if _editable_wheel is not None:

        class editable_wheel(_editable_wheel):
            def run(self) -> None:
                sync_prompt_assets()
                super().run()

except ImportError:  # pragma: no cover - tests import sync without setuptools
    pass
