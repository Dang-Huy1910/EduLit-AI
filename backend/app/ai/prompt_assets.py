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
OUTLINE_INIT_SCHEMA_VERSION = "socratic_outline_init.v1"
DOCUMENT_ANALYSIS_SCHEMA_VERSION = "document_analysis.v1"
OCR_PAGE_SCHEMA_VERSION = "ocr_page.v1"
ASSESSMENT_OUTPUT_SCHEMA_VERSION = "assessment_output.v1"
CLASS_INSIGHT_SCHEMA_VERSION = "class_insight.v1"
WRITING_PROFILE_SCHEMA_VERSION = "writing_profile.v1"
CANONICAL_DIRNAME = Path("prompts") / "socratic"
ALLOWED_FAMILIES = {"socratic", "catalog", "ocr", "assessment"}
ALLOWED_KINDS = {"system", "outline-init"}
KIND_SCHEMA_VERSION = {
    "system": SOCRATIC_SCHEMA_VERSION,
    "outline-init": OUTLINE_INIT_SCHEMA_VERSION,
}
FAMILY_KIND_SCHEMA = {
    ("socratic", "system"): SOCRATIC_SCHEMA_VERSION,
    ("socratic", "outline-init"): OUTLINE_INIT_SCHEMA_VERSION,
    ("catalog", "document-extract"): DOCUMENT_ANALYSIS_SCHEMA_VERSION,
    ("catalog", "ocr-printed-page"): "document_ocr_page.v1",
    ("ocr", "transcribe-page"): OCR_PAGE_SCHEMA_VERSION,
    ("assessment", "grade-essay"): ASSESSMENT_OUTPUT_SCHEMA_VERSION,
    ("assessment", "class-insight"): CLASS_INSIGHT_SCHEMA_VERSION,
    ("assessment", "writing-profile"): WRITING_PROFILE_SCHEMA_VERSION,
}
FAMILY_ALLOWED_KINDS = {
    "socratic": {"system", "outline-init"},
    "catalog": {"document-extract", "ocr-printed-page"},
    "ocr": {"transcribe-page"},
    "assessment": {"grade-essay", "class-insight", "writing-profile"},
}

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
        raise PromptAssetError(version, "prompt version is empty")
    if not _VERSION_RE.match(raw):
        raise PromptAssetError(
            version,
            "prompt version must look like v1 or 1.0",
        )
    if not raw.startswith("v"):
        return f"v{raw}"
    return raw


def _filename_for(version: str, kind: str = "system") -> str:
    return f"{kind}.{version}.md"


def _canonical_file(filename: str, family: str = "socratic") -> Path | None:
    """Return the repo canonical prompt when this module lives in a checkout.

    `backend/app/ai/prompt_assets.py` → repo root is parents[3].
    A wheel install has no `prompts/<family>` next to that path.
    """
    repo_root = Path(__file__).resolve().parents[3]
    candidate = repo_root / "prompts" / family / filename
    if candidate.is_file():
        return candidate
    return None


def _packaged_bytes(filename: str, family: str = "socratic") -> bytes | None:
    package_name = f"app.ai.prompts.{family}"
    try:
        package = resources.files(package_name)
        asset = package.joinpath(filename)
        if asset.is_file():
            return asset.read_bytes()
    except (FileNotFoundError, ModuleNotFoundError, NotADirectoryError, OSError):
        return None
    return None


def load_prompt_asset(family: str, version: str, kind: str) -> PromptAsset:
    """Load a versioned prompt for a family (`socratic` or `catalog`)."""
    family_key = (family or "").strip().lower()
    if family_key not in ALLOWED_FAMILIES:
        raise PromptAssetError(version, f"unknown prompt family '{family}'")
    kind_key = (kind or "").strip().lower()
    allowed = FAMILY_ALLOWED_KINDS.get(family_key, set())
    if kind_key not in allowed:
        raise PromptAssetError(version, f"unknown prompt kind '{kind}' for family '{family_key}'")
    normalized = _normalize_version(version)
    filename = _filename_for(normalized, kind_key)
    canonical = _canonical_file(filename, family_key)
    if canonical is not None:
        data = canonical.read_bytes()
    else:
        data = _packaged_bytes(filename, family_key)
    if data is None:
        raise PromptAssetError(
            version,
            f"asset {family_key}/{filename} is not packaged",
        )
    text = data.decode("utf-8")
    digest = hashlib.sha256(data).hexdigest()
    return PromptAsset(
        version=normalized,
        filename=filename,
        text=text,
        sha256=digest,
        schema_version=FAMILY_KIND_SCHEMA[(family_key, kind_key)],
    )


def load_socratic_prompt(version: str, kind: str = "system") -> PromptAsset:
    """Load a Socratic prompt asset for the configured version.

    `kind` is `system` (conversation) or `outline-init`. A missing v2 file
    is an error; v1 is never silently substituted.
    """
    return load_prompt_asset("socratic", version, kind)
