from __future__ import annotations

import re
import unicodedata

from email_validator import EmailNotValidError, validate_email

from app.core.errors import ERROR_MESSAGES, ApiHttpException

LOGIN_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,63}$")
PASSWORD_MIN_NEW = 15
PASSWORD_MAX = 128
DISPLAY_NAME_MIN = 2
DISPLAY_NAME_MAX = 100


def normalize_login_id(raw: str) -> str:
    value = (raw or "").strip().lower()
    if not LOGIN_ID_RE.fullmatch(value):
        raise ApiHttpException(
            400,
            "VALIDATION",
            ERROR_MESSAGES["VALIDATION"],
            fields={
                "loginId": (
                    "Tên đăng nhập 3–64 ký tự, chỉ gồm a-z, 0-9, dấu chấm, gạch dưới, "
                    "gạch ngang, bắt đầu bằng chữ hoặc số."
                )
            },
        )
    return value


def normalize_email(raw: str) -> str:
    """Validate and normalize email.

    Policy: strip surrounding whitespace, lowercase the entire address, keep
    dots and +tags. We do not apply Gmail-specific collapsing.
    """
    candidate = (raw or "").strip()
    try:
        result = validate_email(
            candidate,
            check_deliverability=False,
            allow_smtputf8=True,
            test_environment=True,
        )
    except EmailNotValidError as exc:
        raise ApiHttpException(
            400,
            "VALIDATION",
            ERROR_MESSAGES["VALIDATION"],
            fields={"email": "Email không hợp lệ."},
        ) from exc
    return result.normalized.lower()


def normalize_display_name(raw: str) -> str:
    value = (raw or "").strip()
    if len(value) < DISPLAY_NAME_MIN or len(value) > DISPLAY_NAME_MAX:
        raise ApiHttpException(
            400,
            "VALIDATION",
            ERROR_MESSAGES["VALIDATION"],
            fields={"displayName": "Họ tên phải từ 2 đến 100 ký tự."},
        )
    if any(unicodedata.category(ch).startswith("C") for ch in value):
        raise ApiHttpException(
            400,
            "VALIDATION",
            ERROR_MESSAGES["VALIDATION"],
            fields={"displayName": "Họ tên chứa ký tự không hợp lệ."},
        )
    return value


def validate_new_password(password: str) -> str:
    if password is None:
        raise ApiHttpException(
            400,
            "VALIDATION",
            ERROR_MESSAGES["VALIDATION"],
            fields={"password": "Mật khẩu không hợp lệ."},
        )
    length = len(password)
    if length < PASSWORD_MIN_NEW or length > PASSWORD_MAX:
        raise ApiHttpException(
            400,
            "VALIDATION",
            ERROR_MESSAGES["VALIDATION"],
            fields={"password": "Mật khẩu mới phải từ 15 đến 128 ký tự."},
        )
    if any(unicodedata.category(ch) in {"Cc", "Cs"} for ch in password):
        raise ApiHttpException(
            400,
            "VALIDATION",
            ERROR_MESSAGES["VALIDATION"],
            fields={"password": "Mật khẩu chứa ký tự không hợp lệ."},
        )
    return password


def looks_like_email(raw: str) -> bool:
    return "@" in (raw or "")
