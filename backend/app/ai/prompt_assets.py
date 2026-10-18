"""Load versioned Socratic prompt assets from the installed package.

Canonical authoring copies live in repository `prompts/socratic/`.
Runtime loading uses package data (`app.ai.prompts`) via importlib.resources
so prompts work after install, outside the repository cwd.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from importlib import resources

PROMPT_PACKAGE = "app.ai.prompts.socratic"
SOCRATIC_SCHEMA_VERSION = "socratic_output.v1"

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


def load_socratic_prompt(version: str) -> PromptAsset:
    """Load the Socratic system prompt for the configured version.

    The configured version selects the packaged file. A missing v2 file is
    an error; v1 is never silently substituted.
    """
    normalized = _normalize_version(version)
    filename = _filename_for(normalized)
    try:
        package = resources.files(PROMPT_PACKAGE)
        asset = package.joinpath(filename)
        if not asset.is_file():
            raise PromptAssetError(
                version,
                f"asset {filename} is not packaged; available versions must match SOCRATIC_PROMPT_VERSION",
            )
        data = asset.read_bytes()
    except PromptAssetError:
        raise
    except Exception as exc:
        raise PromptAssetError(
            version,
            f"cannot load packaged prompt {filename} via importlib.resources",
        ) from exc

    text = data.decode("utf-8")
    digest = hashlib.sha256(data).hexdigest()
    return PromptAsset(
        version=normalized,
        filename=filename,
        text=text,
        sha256=digest,
        schema_version=SOCRATIC_SCHEMA_VERSION,
    )
