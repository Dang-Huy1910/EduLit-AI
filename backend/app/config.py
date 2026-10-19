from __future__ import annotations

from functools import lru_cache
from urllib.parse import parse_qsl, urlencode, urlparse, urlsplit, urlunsplit

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
    RESEND_API_KEY: str = ""
    BREVO_API_KEY: str = ""
    GMAIL_WEBHOOK_URL: str = ""
    AUTO_VERIFY_STUDENT: bool = True

    # ── AI Configuration ───────────────────────────────────────────────────────
    # Provider: openai | gemini | fake
    AI_PROVIDER: str = "openai"
    # Model name (must be set by user for the selected provider)
    AI_MODEL: str = ""
    OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    AI_TIMEOUT_SECONDS: float = 30.0
    AI_MAX_OUTPUT_TOKENS: int = 512
    AI_MAX_RETRIES: int = 2
    # Prompt version for Socratic agent
    SOCRATIC_PROMPT_VERSION: str = "v1"
    OUTLINE_PREP_CONCURRENCY: int = 2
    OUTLINE_PREP_LEASE_SECONDS: int = 300
    OUTLINE_PREP_POLL_SECONDS: float = 2.0
    OUTLINE_PREP_MAX_ATTEMPTS: int = 3
    OUTLINE_PREP_WORKER_ENABLED: bool = True
    IMPORT_PROMPT_VERSION: str = "v1"
    IMPORT_MAX_BYTES: int = 8_000_000
    IMPORT_MAX_MARKDOWN_CHARS: int = 100_000
    IMPORT_MIN_TEXT_CHARS: int = 40
    IMPORT_CONVERT_TIMEOUT_SECONDS: float = 30.0
    IMPORT_AI_TIMEOUT_SECONDS: float = 90.0
    IMPORT_AI_MAX_OUTPUT_TOKENS: int = 4096
    IMPORT_AI_MAX_INPUT_CHARS: int = 80_000
    IMPORT_STALE_SECONDS: int = 300
    OCR_MODEL: str = ""
    OCR_PROMPT_VERSION: str = "v1"
    OCR_TIMEOUT_SECONDS: float = 90.0
    OCR_MAX_OUTPUT_TOKENS: int = 4096
    OCR_CONCURRENCY: int = 1
    OCR_LEASE_SECONDS: int = 600
    OCR_POLL_SECONDS: float = 2.0
    OCR_MAX_ATTEMPTS: int = 3
    OCR_WORKER_ENABLED: bool = True
    OCR_MAX_PAGES: int = 4
    OCR_MAX_PAGE_BYTES: int = 8_000_000
    OCR_MIN_EDGE: int = 200
    OCR_MAX_EDGE: int = 8000
    OCR_PROCESS_MAX_EDGE: int = 2400
    ASSESSMENT_MODEL: str = ""
    ASSESSMENT_PROMPT_VERSION: str = "v1"
    ASSESSMENT_TIMEOUT_SECONDS: float = 90.0
    ASSESSMENT_MAX_OUTPUT_TOKENS: int = 4096
    ASSESSMENT_CONCURRENCY: int = 1
    ASSESSMENT_LEASE_SECONDS: int = 600
    ASSESSMENT_POLL_SECONDS: float = 2.0
    ASSESSMENT_MAX_ATTEMPTS: int = 3
    ASSESSMENT_WORKER_ENABLED: bool = True
    INSIGHT_PROMPT_VERSION: str = "v1"
    INSIGHT_TIMEOUT_SECONDS: float = 90.0
    INSIGHT_MAX_OUTPUT_TOKENS: int = 2048

    BOOTSTRAP_TEACHER_LOGIN_ID: str = "dang.loan"
    BOOTSTRAP_TEACHER_EMAIL: str = "dang.loan@thptdanphuong.edu.vn"
    BOOTSTRAP_TEACHER_DISPLAY_NAME: str = "Cô Đặng Loan"
    BOOTSTRAP_TEACHER_PASSWORD: str = ""
    BOOTSTRAP_TEACHER_EMAIL_ALIASES: str = ""

    ALLOW_DEMO_LOGIN: bool = False
    RUN_MIGRATIONS: bool | None = None

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
    def should_run_migrations(self) -> bool:
        if self.RUN_MIGRATIONS is not None:
            return bool(self.RUN_MIGRATIONS)
        return self.is_production

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
    def allowed_origins(self) -> list[str]:
        raw_list = [part.strip().rstrip("/") for part in self.APP_ORIGIN.split(",") if part.strip()]
        cleaned: list[str] = []
        for raw in raw_list:
            parsed = urlparse(raw)
            if parsed.scheme and parsed.netloc:
                cleaned.append(f"{parsed.scheme}://{parsed.netloc}")
            else:
                cleaned.append(raw)
        return cleaned or ["http://localhost:3000"]

    @property
    def normalized_origin(self) -> str:
        for origin in self.allowed_origins:
            if origin.startswith("https://"):
                return origin
        return self.allowed_origins[0]

    def is_origin_allowed(self, origin: str) -> bool:
        if not origin or origin == "null":
            return False
        cleaned = origin.strip().rstrip("/")
        if cleaned in self.allowed_origins:
            return True
        parsed = urlparse(cleaned)
        if parsed.scheme == "https" and parsed.netloc and (
            parsed.netloc == "vercel.app" or parsed.netloc.endswith(".vercel.app")
        ):
            return True
        if parsed.hostname in {"localhost", "127.0.0.1"}:
            return True
        return False

    def _to_async_url(self, url: str) -> str:
        parts = urlsplit(url)
        scheme = parts.scheme
        if scheme in ("postgresql", "postgres"):
            scheme = "postgresql+asyncpg"
        elif scheme == "postgresql+asyncpg":
            pass
        elif scheme.startswith("postgresql+"):
            scheme = "postgresql+asyncpg"

        query_params = parse_qsl(parts.query)
        cleaned_params = []
        for k, v in query_params:
            if k in ("channel_binding", "gssencmode"):
                continue
            if k == "sslmode":
                cleaned_params.append(("ssl", "require" if v != "disable" else "disable"))
            elif k == "ssl":
                cleaned_params.append((k, v))
            else:
                cleaned_params.append((k, v))

        new_query = urlencode(cleaned_params)
        return urlunsplit((scheme, parts.netloc, parts.path, new_query, parts.fragment))

    def _to_sync_url(self, url: str) -> str:
        parts = urlsplit(url)
        scheme = parts.scheme
        if scheme in ("postgresql", "postgres", "postgresql+asyncpg"):
            scheme = "postgresql+psycopg2"
        elif scheme.startswith("postgresql+"):
            scheme = "postgresql+psycopg2"

        query_params = parse_qsl(parts.query)
        cleaned_params = []
        for k, v in query_params:
            if k == "ssl" and "sslmode" not in [pk for pk, _ in query_params]:
                cleaned_params.append(("sslmode", v))
            else:
                cleaned_params.append((k, v))

        new_query = urlencode(cleaned_params)
        return urlunsplit((scheme, parts.netloc, parts.path, new_query, parts.fragment))

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
        if (
            not self.RESEND_API_KEY
            and not self.BREVO_API_KEY
            and not self.GMAIL_WEBHOOK_URL
            and not self.AUTO_VERIFY_STUDENT
        ):
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
