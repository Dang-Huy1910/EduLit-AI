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

# AI settings for Socratic tests
os.environ["AI_PROVIDER"] = "fake"
os.environ["AI_MODEL"] = "fake-model"
os.environ["OPENAI_API_KEY"] = "test-key-for-fake"
os.environ["GEMINI_API_KEY"] = "test-key-for-fake"

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
                "TRUNCATE rate_limit_buckets, auth_tokens, auth_sessions, users, "
                "idempotency_records, outline_revisions, chat_messages, socratic_sessions, "
                "assignment_access, assignment_revisions RESTART IDENTITY CASCADE"
            )
        )
        await session.commit()
    yield
    await close_db()


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    """Provide a database session for Socratic tests."""
    factory = get_session_factory()
    async with factory() as session:
        yield session
        await session.rollback()


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


# ─────────────────────────────────────────────────────────────────────────
# Socratic Test Fixtures
# ─────────────────────────────────────────────────────────────────────────

import uuid
from app.ai.adapters import FakeAiAdapter
from app.core.passwords import hash_password_sync
from app.db.models.socratic import AssignmentAccess, AssignmentRevision


async def grant_assignment_access(
    db_session: AsyncSession, assignment_id, student_id
) -> AssignmentAccess:
    access = AssignmentAccess(
        assignment_revision_id=assignment_id,
        student_id=student_id,
    )
    db_session.add(access)
    await db_session.commit()
    await db_session.refresh(access)
    return access


@pytest_asyncio.fixture
async def fake_ai() -> FakeAiAdapter:
    """Provide a Fake AI adapter for testing."""
    return FakeAiAdapter()


@pytest_asyncio.fixture
async def student_user(db_session: AsyncSession) -> dict:
    """Create a student user in the database."""
    from app.db.models import User, UserRole

    user = User(
        login_id=f"hs_{uuid.uuid4().hex[:8]}",
        email=f"hs_{uuid.uuid4().hex[:8]}@test.local",
        display_name="Test Student",
        password_hash=hash_password_sync("testpassword123"),
        role=UserRole.STUDENT,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return {
        "user": user,
        "id": user.id,
        "email": user.email,
        "login_id": user.login_id,
    }


@pytest_asyncio.fixture
async def published_assignment(db_session: AsyncSession, student_user: dict) -> dict:
    """Create a published assignment and grant the default student access."""
    assignment = AssignmentRevision(
        code=f"TEST_{uuid.uuid4().hex[:8]}",
        title="Test Nghị luận xã hội",
        genre="nghi_luan_xa_hoi",
        instructions={"task": "Viết bài nghị luận 600-700 từ"},
        rubric={
            "criteria": [
                {"id": "C1", "name": "Bố cục", "weight": 2.0},
                {"id": "C2", "name": "Luận điểm", "weight": 4.0},
            ]
        },
        context_chunks=[
            {"chunk_id": "chunk_1", "text": "Nội dung mẫu về ý chí vượt khó..."}
        ],
        status="PUBLISHED",
        readiness_policy={
            "requiredContentKeys": ["thesis"],
            "minSections": 1,
        },
    )
    db_session.add(assignment)
    await db_session.commit()
    await db_session.refresh(assignment)
    await grant_assignment_access(db_session, assignment.id, student_user["id"])
    return {
        "assignment": assignment,
        "id": assignment.id,
        "code": assignment.code,
    }


@pytest_asyncio.fixture
async def closed_assignment(db_session: AsyncSession, student_user: dict) -> dict:
    assignment = AssignmentRevision(
        code=f"CLOSED_{uuid.uuid4().hex[:8]}",
        title="Closed Assignment",
        genre="nghi_luan_xa_hoi",
        instructions={"task": "Test"},
        rubric={},
        context_chunks=[],
        status="CLOSED",
        readiness_policy={},
    )
    db_session.add(assignment)
    await db_session.commit()
    await db_session.refresh(assignment)
    await grant_assignment_access(db_session, assignment.id, student_user["id"])
    return {
        "assignment": assignment,
        "id": assignment.id,
        "code": assignment.code,
    }


@pytest_asyncio.fixture
async def draft_assignment(db_session: AsyncSession) -> dict:
    """Create a draft assignment for testing."""
    from app.db.models import AssignmentRevision

    assignment = AssignmentRevision(
        code=f"DRAFT_{uuid.uuid4().hex[:8]}",
        title="Draft Assignment",
        genre="nghi_luan_xa_hoi",
        instructions={"task": "Test"},
        rubric={},
        context_chunks=[],
        status="DRAFT",
    )
    db_session.add(assignment)
    await db_session.commit()
    await db_session.refresh(assignment)
    return {
        "assignment": assignment,
        "id": assignment.id,
        "code": assignment.code,
    }
