"""Load versioned Socratic prompt assets from one official source.

Canonical authoring copies live in repository `prompts/socratic/`.
Build copies those files into package data (`app.ai.prompts.socratic`).
Runtime prefers the canonical file when the source tree is present, and
falls back to importlib.resources so a wheel works outside the repo cwd.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from importlib import resources
from pathlib import Path

PROMPT_PACKAGE = "app.ai.prompts.socratic"
SOCRATIC_SCHEMA_VERSION = "socratic_output.v1"
CANONICAL_DIRNAME = Path("prompts") / "socratic"

_VERSION_RE = re.compile(r"^v?\d+(\.\d+)*$")


class PromptAssetError(Exception):
    """Raised when a configured prompt version cannot be loaded."""

    def __init__(self, version: str, reason: str):
        self.version = version
        self.reason = reason
        super().__init__(f"Prompt asset error for version '{version}': {reason}")


@dataclass(frozen=True)
class PromptAsset:
    version: str
    filename: str
    text: str
    sha256: str
    schema_version: str = SOCRATIC_SCHEMA_VERSION


def _normalize_version(version: str) -> str:
    raw = (version or "").strip()
    if not raw:
        raise PromptAssetError(version, "SOCRATIC_PROMPT_VERSION is empty")
    if not _VERSION_RE.match(raw):
        raise PromptAssetError(
            version,
            "SOCRATIC_PROMPT_VERSION must look like v1 or 1.0",
        )
    if not raw.startswith("v"):
        return f"v{raw}"
    return raw


def _filename_for(version: str) -> str:
    return f"system.{version}.md"


def _canonical_file(filename: str) -> Path | None:
    """Return the repo canonical prompt when this module lives in a checkout.

    `backend/app/ai/prompt_assets.py` → repo root is parents[3].
    A wheel install has no `prompts/socratic` next to that path.
    """
    repo_root = Path(__file__).resolve().parents[3]
    candidate = repo_root / CANONICAL_DIRNAME / filename
    if candidate.is_file():
        return candidate
    return None


def _packaged_bytes(filename: str) -> bytes | None:
    try:
        package = resources.files(PROMPT_PACKAGE)
        asset = package.joinpath(filename)
        if asset.is_file():
            return asset.read_bytes()
    except (FileNotFoundError, ModuleNotFoundError, NotADirectoryError, OSError):
        return None
    return None


def load_socratic_prompt(version: str) -> PromptAsset:
    """Load the Socratic system prompt for the configured version.

    The configured version selects the file. A missing v2 file is an
    error; v1 is never silently substituted.
    """
    normalized = _normalize_version(version)
    filename = _filename_for(normalized)
    canonical = _canonical_file(filename)
    if canonical is not None:
        data = canonical.read_bytes()
    else:
        data = _packaged_bytes(filename)
    if data is None:
        raise PromptAssetError(
            version,
            f"asset {filename} is not packaged; available versions must match SOCRATIC_PROMPT_VERSION",
        )

    text = data.decode("utf-8")
    digest = hashlib.sha256(data).hexdigest()
    return PromptAsset(
        version=normalized,
        filename=filename,
        text=text,
        sha256=digest,
        schema_version=SOCRATIC_SCHEMA_VERSION,
    )
