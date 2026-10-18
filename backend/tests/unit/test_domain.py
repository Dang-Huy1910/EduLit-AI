from __future__ import annotations

import pytest

from app.config import LOCAL_PROTOTYPE_TEACHER_PASSWORD, Settings
from app.core.errors import ApiHttpException
from app.core.passwords import hash_password_sync, verify_password_sync
from app.identity.domain import (
    normalize_display_name,
    normalize_email,
    normalize_login_id,
    validate_new_password,
)


def test_login_id_normalized_and_validated() -> None:
    assert normalize_login_id("  Dang.Loan ") == "dang.loan"
    with pytest.raises(ApiHttpException) as exc:
        normalize_login_id("ab")
    assert exc.value.status_code == 400
    with pytest.raises(ApiHttpException):
        normalize_login_id("-starts-wrong")


def test_email_keeps_dots_and_plus_tags() -> None:
    assert normalize_email("  A.B+tag@Gmail.COM ") == "a.b+tag@gmail.com"


def test_display_name_vietnamese() -> None:
    assert normalize_display_name("  Nguyễn Thị Ánh  ") == "Nguyễn Thị Ánh"
    with pytest.raises(ApiHttpException):
        normalize_display_name("A")


def test_new_password_length_and_no_strip() -> None:
    raw = "  fifteen-charsX"
    assert len(raw) >= 15
    assert validate_new_password(raw) == raw
    with pytest.raises(ApiHttpException):
        validate_new_password("12345")


def test_password_hash_roundtrip() -> None:
    hashed = hash_password_sync("unicode mật khẩu 15+")
    assert hashed != "unicode mật khẩu 15+"
    assert verify_password_sync(hashed, "unicode mật khẩu 15+")
    assert not verify_password_sync(hashed, "unicode mật khẩu 15+ ")


def test_production_rejects_prototype_password_and_demo_flag() -> None:
    with pytest.raises(RuntimeError):
        Settings(
            APP_ENV="production",
            APP_ORIGIN="https://edulit.example",
            DATABASE_URL="postgresql://u:p@db/edulit",
            SMTP_HOST="smtp.example",
            SMTP_FROM="EduLit <noreply@example.com>",
            COOKIE_SECURE=True,
            BOOTSTRAP_TEACHER_PASSWORD=LOCAL_PROTOTYPE_TEACHER_PASSWORD,
        ).validate_runtime()
    with pytest.raises(RuntimeError):
        Settings(
            APP_ENV="production",
            APP_ORIGIN="https://edulit.example",
            DATABASE_URL="postgresql://u:p@db/edulit",
            SMTP_HOST="smtp.example",
            SMTP_FROM="EduLit <noreply@example.com>",
            COOKIE_SECURE=True,
            BOOTSTRAP_TEACHER_PASSWORD="a-unique-operator-secret-99",
            ALLOW_DEMO_LOGIN=True,
        ).validate_runtime()


def test_test_database_url_required() -> None:
    s = Settings(APP_ENV="test", DATABASE_URL_TEST=None, DATABASE_URL="postgresql://x")
    with pytest.raises(RuntimeError, match="DATABASE_URL_TEST"):
        s.require_test_database_url()


def test_origin_allowed() -> None:
    s = Settings(
        APP_ENV="production",
        APP_ORIGIN="https://edulit-ai.vercel.app,http://localhost:3000",
        DATABASE_URL="postgresql://u:p@db/edulit",
        SMTP_HOST="smtp.example",
        SMTP_FROM="EduLit <noreply@example.com>",
        COOKIE_SECURE=True,
        BOOTSTRAP_TEACHER_PASSWORD="a-unique-operator-secret-99",
    )
    assert s.is_origin_allowed("https://edulit-ai.vercel.app")
    assert s.is_origin_allowed("https://edulit-ai-git-main-danghuys-projects.vercel.app")
    assert s.is_origin_allowed("https://my-preview-app.vercel.app")
    assert s.is_origin_allowed("http://localhost:3000")
    assert not s.is_origin_allowed("https://evil.com")
    assert not s.is_origin_allowed("null")
    assert not s.is_origin_allowed("")

