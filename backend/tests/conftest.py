from __future__ import annotations

import os
import sys
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
os.chdir(BACKEND_ROOT)

TEST_DB_URL = os.environ.get("DATABASE_URL_TEST", "").strip()
if not TEST_DB_URL:
    raise RuntimeError(
        "DATABASE_URL_TEST is required for pytest. Refusing to use DATABASE_URL."
    )

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL_TEST"] = TEST_DB_URL
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["APP_ORIGIN"] = "http://localhost:3000"
os.environ["SMTP_HOST"] = "127.0.0.1"
os.environ["SMTP_PORT"] = os.environ.get("SMTP_PORT", "1025")
os.environ["BOOTSTRAP_TEACHER_PASSWORD"] = "DanPhuong@2024"
os.environ["ALLOW_DEMO_LOGIN"] = "false"
os.environ["RATE_LIMIT_LOGIN_ACCOUNT_MAX"] = "5"
os.environ["RATE_LIMIT_LOGIN_IP_MAX"] = "30"
os.environ["RATE_LIMIT_REGISTER_IP_MAX"] = "30"
os.environ["RATE_LIMIT_EMAIL_IP_MAX"] = "20"
os.environ["RATE_LIMIT_EMAIL_ACCOUNT_MAX"] = "10"

from alembic import command
from alembic.config import Config

from app.config import Settings, clear_settings_cache, get_settings
from app.core.tokens import generate_raw_token, hash_token
from app.db.session import close_db, configure_engine, get_session_factory
from app.email.adapter import EmailAdapter
from app.email.templates import EmailMessage
from app.main import create_app


class CapturingEmailAdapter(EmailAdapter):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.messages: list[tuple[str, EmailMessage]] = []
        self.fail = False

    async def send(self, to_address: str, message: EmailMessage) -> None:
        if self.fail:
            raise TimeoutError("smtp_timeout")
        self.messages.append((to_address, message))


def _sync_url(url: str) -> str:
    if url.startswith("postgresql+asyncpg://"):
        return "postgresql+psycopg2://" + url[len("postgresql+asyncpg://") :]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg2://" + url[len("postgresql://") :]
    return url


def _async_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://") :]
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://") :]
    return url


@pytest.fixture(scope="session")
def settings() -> Settings:
    clear_settings_cache()
    return get_settings()


@pytest.fixture(scope="session", autouse=True)
def migrate_test_db(settings: Settings) -> Iterator[None]:
    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", _sync_url(TEST_DB_URL))
    command.upgrade(cfg, "head")
    yield


@pytest_asyncio.fixture(autouse=True)
async def db_engine() -> AsyncIterator[None]:
    await close_db()
    configure_engine(_async_url(TEST_DB_URL), null_pool=True)
    factory = get_session_factory()
    async with factory() as session:
        await session.execute(
            text(
                "TRUNCATE rate_limit_buckets, auth_tokens, auth_sessions, users "
                "RESTART IDENTITY CASCADE"
            )
        )
        await session.commit()
    yield
    await close_db()


@pytest.fixture
def email_adapter(settings: Settings) -> CapturingEmailAdapter:
    return CapturingEmailAdapter(settings)


@pytest.fixture
def app(settings: Settings, email_adapter: CapturingEmailAdapter):
    application = create_app()

    async def _settings() -> Settings:
        return settings

    async def _email() -> CapturingEmailAdapter:
        return email_adapter

    from app.config import get_settings as gs
    from app.identity.deps import get_email_adapter

    application.dependency_overrides[gs] = _settings
    application.dependency_overrides[get_email_adapter] = _email
    return application


@pytest_asyncio.fixture
async def client(app) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://localhost:3000") as ac:
        yield ac


def auth_headers() -> dict[str, str]:
    return {
        "Origin": "http://localhost:3000",
        "X-Edulit-CSRF": "1",
        "Content-Type": "application/json",
    }


def unique_student(prefix: str = "hs") -> dict[str, str]:
    token = generate_raw_token()[:12].lower().replace("-", "a").replace("_", "b")
    login = f"{prefix}{token}"[:20]
    return {
        "loginId": login,
        "email": f"{login}@students.example.test",
        "displayName": "Nguyễn Văn An",
        "password": "hoc-sinh-mat-khau-15",
    }


def extract_token(email_adapter: CapturingEmailAdapter) -> str:
    assert email_adapter.messages, "expected an outbound email"
    body = email_adapter.messages[-1][1].text_body
    marker = "#token="
    assert marker in body
    return body.split(marker, 1)[1].split()[0].strip()
