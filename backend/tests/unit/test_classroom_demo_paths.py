from pathlib import Path

import pytest

from scripts import seed_classroom_demo as seed


def test_default_demo_paths_and_assets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DEMO_DATA_ROOT", raising=False)
    monkeypatch.delenv("DEMO_FRONTEND_ROOT", raising=False)

    mock_dir, public_root = seed.resolve_demo_paths()

    assert mock_dir == public_root == Path(__file__).resolve().parents[2] / "demo"
    assert (mock_dir / "roster_11a14.json").is_file()
    assert (mock_dir / "submissionsManifest.ts").is_file()
    assert (public_root / "submissions").is_dir()

    manifest = seed.load_json_export(mock_dir / "submissionsManifest.ts", "SUBMISSION_MANIFEST")
    pages = [page for submission in manifest.values() for page in submission["pages"]]
    assert pages
    for page in pages:
        assert (public_root / page["localPath"].lstrip("/")).is_file()


def test_legacy_frontend_demo_paths(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.delenv("DEMO_DATA_ROOT", raising=False)
    monkeypatch.setenv("DEMO_FRONTEND_ROOT", str(tmp_path))

    assert seed.resolve_demo_paths() == (tmp_path / "src" / "lib" / "mock", tmp_path / "public")


def test_flat_demo_root_takes_precedence(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    data_root = tmp_path / "demo"
    monkeypatch.setenv("DEMO_DATA_ROOT", str(data_root))
    monkeypatch.setenv("DEMO_FRONTEND_ROOT", str(tmp_path / "frontend"))

    assert seed.resolve_demo_paths() == (data_root, data_root)


def test_blank_demo_overrides_use_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEMO_DATA_ROOT", "  ")
    monkeypatch.setenv("DEMO_FRONTEND_ROOT", "  ")

    assert seed.resolve_demo_paths() == (seed.BACKEND_DIR / "demo", seed.BACKEND_DIR / "demo")
