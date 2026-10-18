from __future__ import annotations

from functools import lru_cache
from urllib.parse import urlparse

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


LOCAL_PROTOTYPE_TEACHER_PASSWORD = "DanPhuong@2024"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_ENV: str = "development"
    PORT: int = 4000
    APP_ORIGIN: str = "http://localhost:3000"

    DATABASE_URL: str = "postgresql://edulit:edulit_dev@localhost:5433/edulit_auth"
    DATABASE_URL_TEST: str | None = None

    SESSION_COOKIE_NAME: str = "edulit_session"
    SESSION_TTL_SECONDS_SHORT: int = 1800
    SESSION_TTL_SECONDS_LONG: int = 1_209_600
    COOKIE_SECURE: bool | None = None

    EMAIL_VERIFICATION_TTL_SECONDS: int = 86_400
    PASSWORD_RESET_TTL_SECONDS: int = 3_600

    RATE_LIMIT_WINDOW_SECONDS: int = 900
    RATE_LIMIT_LOGIN_IP_MAX: int = 20
    RATE_LIMIT_LOGIN_ACCOUNT_MAX: int = 8
    RATE_LIMIT_REGISTER_IP_MAX: int = 10
    RATE_LIMIT_EMAIL_IP_MAX: int = 8
    RATE_LIMIT_EMAIL_ACCOUNT_MAX: int = 3
    RATE_LIMIT_VERIFY_IP_MAX: int = 20
    RATE_LIMIT_RESET_IP_MAX: int = 10

    TRUSTED_PROXY_IPS: str = ""

    SMTP_HOST: str = "127.0.0.1"
    SMTP_PORT: int = 1025
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_TLS_MODE: str = "none"
    SMTP_FROM: str = "EduLit-AI <noreply@localhost>"
    SMTP_TIMEOUT_SECONDS: float = 8.0
    SMTP_RETRIES: int = 1

    BOOTSTRAP_TEACHER_LOGIN_ID: str = "dang.loan"
    BOOTSTRAP_TEACHER_EMAIL: str = "dang.loan@thptdanphuong.edu.vn"
    BOOTSTRAP_TEACHER_DISPLAY_NAME: str = "Cô Đặng Loan"
    BOOTSTRAP_TEACHER_PASSWORD: str = ""
    BOOTSTRAP_TEACHER_EMAIL_ALIASES: str = ""

    ALLOW_DEMO_LOGIN: bool = False

    @field_validator("APP_ENV")
    @classmethod
    def _normalize_env(cls, value: str) -> str:
        normalized = (value or "development").strip().lower()
        if normalized not in {"development", "test", "production"}:
            raise ValueError("APP_ENV must be development, test, or production")
        return normalized

    @field_validator("SMTP_TLS_MODE")
    @classmethod
    def _normalize_tls(cls, value: str) -> str:
        normalized = (value or "none").strip().lower()
        if normalized not in {"none", "starttls", "tls"}:
            raise ValueError("SMTP_TLS_MODE must be none, starttls, or tls")
        return normalized

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def is_test(self) -> bool:
        return self.APP_ENV == "test"

    @property
    def is_cookie_secure(self) -> bool:
        if self.COOKIE_SECURE is not None:
            return self.COOKIE_SECURE
        return self.is_production

    @property
    def trusted_proxy_ips(self) -> frozenset[str]:
        return frozenset(
            part.strip() for part in self.TRUSTED_PROXY_IPS.split(",") if part.strip()
        )

    @property
    def teacher_email_aliases(self) -> frozenset[str]:
        values = {self.BOOTSTRAP_TEACHER_EMAIL.strip().lower()}
        for part in self.BOOTSTRAP_TEACHER_EMAIL_ALIASES.split(","):
            cleaned = part.strip().lower()
            if cleaned:
                values.add(cleaned)
        return frozenset(values)

    @property
    def normalized_origin(self) -> str:
        origin = self.APP_ORIGIN.strip().rstrip("/")
        parsed = urlparse(origin)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError("APP_ORIGIN must be an absolute origin such as http://localhost:3000")
        rebuilt = f"{parsed.scheme}://{parsed.netloc}"
        if rebuilt != origin:
            raise ValueError("APP_ORIGIN must be an exact origin without path or trailing slash")
        return origin

    def _to_async_url(self, url: str) -> str:
        if url.startswith("postgresql+asyncpg://"):
            res = url
        elif url.startswith("postgresql://"):
            res = "postgresql+asyncpg://" + url[len("postgresql://") :]
        elif url.startswith("postgres://"):
            res = "postgresql+asyncpg://" + url[len("postgres://") :]
        else:
            res = url
        if "sslmode=" in res:
            res = res.replace("sslmode=", "ssl=")
        return res

    def _to_sync_url(self, url: str) -> str:
        if url.startswith("postgresql+psycopg2://"):
            res = url
        elif url.startswith("postgresql+asyncpg://"):
            res = "postgresql+psycopg2://" + url[len("postgresql+asyncpg://") :]
        elif url.startswith("postgresql://"):
            res = "postgresql+psycopg2://" + url[len("postgresql://") :]
        elif url.startswith("postgres://"):
            res = "postgresql+psycopg2://" + url[len("postgres://") :]
        else:
            res = url
        if "ssl=" in res and "sslmode=" not in res:
            res = res.replace("ssl=", "sslmode=")
        return res

    @property
    def async_database_url(self) -> str:
        return self._to_async_url(self.DATABASE_URL)

    @property
    def sync_database_url(self) -> str:
        return self._to_sync_url(self.DATABASE_URL)

    def require_test_database_url(self) -> str:
        url = (self.DATABASE_URL_TEST or "").strip()
        if not url:
            raise RuntimeError(
                "DATABASE_URL_TEST is required for tests. "
                "Refusing to fall back to DATABASE_URL."
            )
        return url

    @property
    def test_async_database_url(self) -> str:
        return self._to_async_url(self.require_test_database_url())

    @property
    def test_sync_database_url(self) -> str:
        return self._to_sync_url(self.require_test_database_url())

    def validate_runtime(self) -> None:
        self.normalized_origin
        if self.ALLOW_DEMO_LOGIN and self.is_production:
            raise RuntimeError("ALLOW_DEMO_LOGIN cannot be enabled when APP_ENV=production")
        if not self.is_production:
            return
        if not self.DATABASE_URL.strip():
            raise RuntimeError("DATABASE_URL is required in production")
        origin = self.normalized_origin
        if not origin.startswith("https://"):
            raise RuntimeError("APP_ORIGIN must use https in production")
        if not self.is_cookie_secure:
            raise RuntimeError("COOKIE_SECURE must be true in production")
        if not self.SMTP_HOST.strip() or self.SMTP_HOST.strip() in {"127.0.0.1", "localhost"}:
            raise RuntimeError("Production SMTP_HOST must be a real provider, not a local sink")
        if not self.SMTP_FROM.strip() or "localhost" in self.SMTP_FROM.lower():
            raise RuntimeError("Production SMTP_FROM must be a real mailbox")
        password = self.BOOTSTRAP_TEACHER_PASSWORD
        if not password or password == LOCAL_PROTOTYPE_TEACHER_PASSWORD:
            raise RuntimeError(
                "BOOTSTRAP_TEACHER_PASSWORD must be a unique operator secret in production"
            )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.validate_runtime()
    return settings


def clear_settings_cache() -> None:
    get_settings.cache_clear()
