"""Prompt assets load from the installed package, not from cwd."""

from __future__ import annotations

from importlib import resources
from pathlib import Path

import pytest

from app.ai.prompt_assets import (
    PROMPT_PACKAGE,
    PromptAssetError,
    load_socratic_prompt,
)


def test_load_v1_from_package_not_cwd(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / "prompts").mkdir()
    asset = load_socratic_prompt("v1")
    assert asset.version == "v1"
    assert "Không viết hoàn chỉnh" in asset.text
    assert len(asset.sha256) == 64
    assert asset.schema_version == "socratic_output.v1"
    packaged = resources.files(PROMPT_PACKAGE).joinpath("system.v1.md")
    assert packaged.is_file()
    assert not (tmp_path / "prompts" / "socratic" / "system.v1.md").exists()


def test_unknown_version_does_not_silently_use_v1() -> None:
    with pytest.raises(PromptAssetError):
        load_socratic_prompt("v2")


def test_canonical_repo_copy_matches_packaged_when_present() -> None:
    repo_copy = (
        Path(__file__).resolve().parents[3] / "prompts" / "socratic" / "system.v1.md"
    )
    if not repo_copy.is_file():
        pytest.skip("canonical prompts/socratic not in this checkout")
    asset = load_socratic_prompt("v1")
    assert repo_copy.read_text(encoding="utf-8") == asset.text
