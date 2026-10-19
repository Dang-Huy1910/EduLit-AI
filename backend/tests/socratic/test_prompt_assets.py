"""Prompt assets load from the official source and from a built wheel."""

from __future__ import annotations

import os
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

from app.ai.prompt_assets import PromptAssetError, load_prompt_asset, load_socratic_prompt
from _prompt_build import PACKAGE_DIR, sync_prompt_assets

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent
CANONICAL = REPO_ROOT / "prompts" / "socratic" / "system.v1.md"


def test_load_v1_from_package_not_cwd(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / "prompts").mkdir()
    (tmp_path / "prompts" / "socratic").mkdir()
    (tmp_path / "prompts" / "socratic" / "system.v1.md").write_text(
        "WRONG CWD COPY", encoding="utf-8"
    )
    asset = load_socratic_prompt("v1")
    assert asset.version == "v1"
    assert "Không viết hoàn chỉnh" in asset.text
    assert "WRONG CWD COPY" not in asset.text
    assert len(asset.sha256) == 64
    assert asset.schema_version == "socratic_output.v1"


def test_unknown_version_does_not_silently_use_v1() -> None:
    with pytest.raises(PromptAssetError):
        load_socratic_prompt("v2")


def test_canonical_repo_copy_is_the_official_source() -> None:
    assert CANONICAL.is_file()
    asset = load_socratic_prompt("v1")
    assert CANONICAL.read_text(encoding="utf-8") == asset.text


def test_outline_init_prompt_is_a_separate_asset() -> None:
    asset = load_socratic_prompt("v1", kind="outline-init")
    assert asset.filename == "outline-init.v1.md"
    assert "tạo dàn ý gợi ý ban đầu" in asset.text.lower() or "Tạo dàn ý" in asset.text
    assert asset.schema_version == "socratic_outline_init.v1"
    system = load_socratic_prompt("v1")
    assert system.sha256 != asset.sha256


def test_catalog_extract_prompt_loads_outside_cwd(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / "prompts").mkdir()
    (tmp_path / "prompts" / "catalog").mkdir()
    (tmp_path / "prompts" / "catalog" / "document-extract.v1.md").write_text(
        "WRONG CWD COPY", encoding="utf-8"
    )
    asset = load_prompt_asset("catalog", "v1", "document-extract")
    assert asset.filename == "document-extract.v1.md"
    assert "WRONG CWD COPY" not in asset.text
    assert "dữ liệu không đáng tin" in asset.text.lower()
    assert asset.schema_version == "document_analysis.v1"


def test_build_hook_copies_catalog_prompt_into_package_dir() -> None:
    sync_prompt_assets()
    canonical = REPO_ROOT / "prompts" / "catalog" / "document-extract.v1.md"
    packaged = BACKEND_ROOT / "app" / "ai" / "prompts" / "catalog" / "document-extract.v1.md"
    assert canonical.is_file()
    assert packaged.is_file()
    assert packaged.read_text(encoding="utf-8") == canonical.read_text(encoding="utf-8")


def test_build_hook_copies_canonical_into_package_dir() -> None:
    sync_prompt_assets()
    packaged = PACKAGE_DIR / "system.v1.md"
    assert packaged.is_file()
    assert packaged.read_text(encoding="utf-8") == CANONICAL.read_text(encoding="utf-8")


def test_wheel_contains_canonical_prompt_and_loads_outside_repo(tmp_path: Path) -> None:
    package_copy = PACKAGE_DIR / "system.v1.md"
    previous = package_copy.read_text(encoding="utf-8") if package_copy.is_file() else None
    dist = tmp_path / "dist"
    dist.mkdir()
    try:
        PACKAGE_DIR.mkdir(parents=True, exist_ok=True)
        package_copy.write_text("STALE PACKAGE COPY", encoding="utf-8")
        built = subprocess.run(
            ["uv", "build", "--wheel", "--out-dir", str(dist)],
            cwd=BACKEND_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        assert built.returncode == 0, built.stderr
    finally:
        if previous is None:
            package_copy.unlink(missing_ok=True)
        else:
            package_copy.write_text(previous, encoding="utf-8")
    wheels = list(dist.glob("*.whl"))
    assert wheels, "expected a wheel from uv build"
    extract = tmp_path / "extracted"
    extract.mkdir()
    with zipfile.ZipFile(wheels[0]) as zf:
        zf.extractall(extract)
    packaged = extract / "app" / "ai" / "prompts" / "socratic" / "system.v1.md"
    assert packaged.is_file()
    assert "STALE PACKAGE COPY" not in packaged.read_text(encoding="utf-8")
    assert packaged.read_text(encoding="utf-8") == CANONICAL.read_text(encoding="utf-8")

    work = tmp_path / "outside"
    work.mkdir()
    (work / "prompts").mkdir()
    (work / "prompts" / "socratic").mkdir()
    (work / "prompts" / "socratic" / "system.v1.md").write_text(
        "WRONG CWD COPY", encoding="utf-8"
    )
    env = os.environ.copy()
    env["PYTHONPATH"] = str(extract)
    script = (
        "from app.ai.prompt_assets import load_socratic_prompt\n"
        "asset = load_socratic_prompt('v1')\n"
        "assert 'Không viết hoàn chỉnh' in asset.text\n"
        "assert 'WRONG CWD COPY' not in asset.text\n"
        "print('ok')\n"
    )
    loaded = subprocess.run(
        [sys.executable, "-c", script],
        cwd=work,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )
    assert loaded.returncode == 0, loaded.stderr or loaded.stdout
    assert "ok" in loaded.stdout
