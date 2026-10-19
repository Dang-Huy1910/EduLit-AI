"""Integration tests for Socratic REST API."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.core.http import utcnow
from app.core.passwords import hash_password_sync
from app.core.tokens import generate_raw_token, hash_token
from app.db.models import AuthSession, User, UserRole, UserStatus
from tests.conftest import auth_headers, grant_assignment_access


async def create_authenticated_student(
    db_session: AsyncSession,
    settings: Settings,
    client: AsyncClient,
) -> tuple[User, str]:
    login_id = f"hs_{uuid.uuid4().hex[:8]}"
    email = f"{login_id}@thptdanphuong.edu.vn"
    raw_pw = "HocSinh@2024"
    user = User(
        login_id=login_id,
        email=email,
        display_name="Test Student",
        password_hash=hash_password_sync(raw_pw),
        role=UserRole.STUDENT,
        status=UserStatus.ACTIVE,
        email_verified_at=utcnow(),
    )
    db_session.add(user)
    await db_session.flush()
    raw_token = generate_raw_token()
    session = AuthSession(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        expires_at=utcnow() + __import__("datetime").timedelta(
            seconds=settings.SESSION_TTL_SECONDS_LONG
        ),
        ip_address="127.0.0.1",
        user_agent="pytest-agent",
    )
    db_session.add(session)
    await db_session.commit()
    await db_session.refresh(user)
    client.cookies.set(settings.SESSION_COOKIE_NAME, raw_token)
    return user, raw_token


@pytest.mark.asyncio
async def test_create_session_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/socratic-sessions",
        json={"assignmentCode": "SOME_CODE"},
        headers=auth_headers(),
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_session_requires_mutation_guards_before_service(
    client: AsyncClient,
    db_session: AsyncSession,
    settings: Settings,
    app,
) -> None:
    await create_authenticated_student(db_session, settings, client)
    calls = {"n": 0}

    async def spy_service():
        calls["n"] += 1
        raise AssertionError("socratic service must not run when CSRF fails")

    from app.api.routers.socratic import get_socratic_service

    app.dependency_overrides[get_socratic_service] = spy_service
    try:
        resp = await client.post(
            "/api/socratic-sessions",
            json={"assignmentCode": "SOME_CODE"},
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 403
        assert calls["n"] == 0
        body = resp.json()
        assert body["error"]["code"] in {"CSRF_ORIGIN", "CSRF_HEADER"}
    finally:
        app.dependency_overrides.pop(get_socratic_service, None)


@pytest.mark.asyncio
async def test_disallowed_origin_rejected_before_service(
    client: AsyncClient,
    db_session: AsyncSession,
    settings: Settings,
    app,
) -> None:
    await create_authenticated_student(db_session, settings, client)
    calls = {"n": 0}

    async def spy_service():
        calls["n"] += 1
        raise AssertionError("socratic service must not run when Origin is rejected")

    from app.api.routers.socratic import get_socratic_service

    app.dependency_overrides[get_socratic_service] = spy_service
    try:
        resp = await client.post(
            "/api/socratic-sessions",
            json={"assignmentCode": "SOME_CODE"},
            headers={
                "Content-Type": "application/json",
                "Origin": "https://evil.example",
                "X-Edulit-CSRF": "1",
            },
        )
        assert resp.status_code == 403
        assert calls["n"] == 0
        assert resp.json()["error"]["code"] == "CSRF_ORIGIN"
    finally:
        app.dependency_overrides.pop(get_socratic_service, None)


@pytest.mark.asyncio
async def test_get_sessions_works_without_csrf(
    client: AsyncClient,
    db_session: AsyncSession,
    settings: Settings,
) -> None:
    await create_authenticated_student(db_session, settings, client)
    resp = await client.get("/api/socratic-sessions")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_session_draft_assignment_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
    settings: Settings,
    draft_assignment: dict,
) -> None:
    user, _ = await create_authenticated_student(db_session, settings, client)
    await grant_assignment_access(db_session, draft_assignment["id"], user.id)
    resp = await client.post(
        "/api/socratic-sessions",
        json={"assignmentCode": draft_assignment["code"]},
        headers=auth_headers(),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_and_get_socratic_session(
    client: AsyncClient,
    db_session: AsyncSession,
    settings: Settings,
    published_assignment: dict,
) -> None:
    user, _ = await create_authenticated_student(db_session, settings, client)
    await grant_assignment_access(db_session, published_assignment["id"], user.id)
    resp = await client.post(
        "/api/socratic-sessions",
        json={"assignmentCode": published_assignment["code"]},
        headers=auth_headers(),
    )
    assert resp.status_code == 201
    data = resp.json()
    session_id = data["id"]
    assert data["studentId"] == str(user.id)
    assert data["assignmentRevisionId"] == str(published_assignment["id"])
    assert data["state"] == "INIT"

    get_resp = await client.get(
        f"/api/socratic-sessions/{session_id}",
        headers=auth_headers(),
    )
    assert get_resp.status_code == 200
    get_data = get_resp.json()
    assert get_data["id"] == session_id
    assert get_data["state"] == "INIT"
    assert "outlineVersion" in get_data
    assert "readiness" in get_data


@pytest.mark.asyncio
async def test_other_student_cannot_access_session(
    client: AsyncClient,
    db_session: AsyncSession,
    settings: Settings,
    published_assignment: dict,
) -> None:
    user1, _ = await create_authenticated_student(db_session, settings, client)
    await grant_assignment_access(db_session, published_assignment["id"], user1.id)
    resp = await client.post(
        "/api/socratic-sessions",
        json={"assignmentCode": published_assignment["code"]},
        headers=auth_headers(),
    )
    assert resp.status_code == 201
    session_id = resp.json()["id"]
    await create_authenticated_student(db_session, settings, client)
    get_resp = await client.get(
        f"/api/socratic-sessions/{session_id}",
        headers=auth_headers(),
    )
    assert get_resp.status_code in (403, 404)


@pytest.mark.asyncio
async def test_update_outline_via_api_requires_expected_version(
    client: AsyncClient,
    db_session: AsyncSession,
    settings: Settings,
    published_assignment: dict,
) -> None:
    user, _ = await create_authenticated_student(db_session, settings, client)
    await grant_assignment_access(db_session, published_assignment["id"], user.id)
    resp = await client.post(
        "/api/socratic-sessions",
        json={"assignmentCode": published_assignment["code"]},
        headers=auth_headers(),
    )
    session_id = resp.json()["id"]
    missing = await client.put(
        f"/api/socratic-sessions/{session_id}/outline",
        json={"content": {"thesis": "x"}},
        headers=auth_headers(),
    )
    assert missing.status_code == 400

    outline_data = {
        "content": {
            "thesis": "Bản lĩnh là kim chỉ nam giúp người trẻ định hướng trong thời đại số.",
            "sections": [{"title": "Mở bài"}],
        },
        "expectedVersion": 0,
    }
    put_resp = await client.put(
        f"/api/socratic-sessions/{session_id}/outline",
        json=outline_data,
        headers=auth_headers(),
    )
    assert put_resp.status_code == 200
    body = put_resp.json()
    assert body["revision"] == 1
    assert body["content"]["thesis"] == outline_data["content"]["thesis"]

    get_outline = await client.get(
        f"/api/socratic-sessions/{session_id}/outline",
        headers=auth_headers(),
    )
    assert get_outline.status_code == 200
    assert get_outline.json()["revision"] == 1


@pytest.mark.asyncio
async def test_send_message_and_reload_history(
    client: AsyncClient,
    db_session: AsyncSession,
    settings: Settings,
    published_assignment: dict,
) -> None:
    user, _ = await create_authenticated_student(db_session, settings, client)
    await grant_assignment_access(db_session, published_assignment["id"], user.id)
    created = await client.post(
        "/api/socratic-sessions",
        json={"assignmentCode": published_assignment["code"]},
        headers=auth_headers(),
    )
    session_id = created.json()["id"]
    send = await client.post(
        f"/api/socratic-sessions/{session_id}/messages",
        json={"content": "Em muốn hỏi về luận điểm trung tâm"},
        headers={**auth_headers(), "Idempotency-Key": "msg-1"},
    )
    assert send.status_code == 200
    assert send.json()["role"] == "ASSISTANT"
    replay = await client.post(
        f"/api/socratic-sessions/{session_id}/messages",
        json={"content": "Em muốn hỏi về luận điểm trung tâm"},
        headers={**auth_headers(), "Idempotency-Key": "msg-1"},
    )
    assert replay.status_code == 200
    assert replay.json()["id"] == send.json()["id"]
    history = await client.get(
        f"/api/socratic-sessions/{session_id}/messages",
        headers=auth_headers(),
    )
    assert history.status_code == 200
    roles = [m["role"] for m in history.json()["messages"]]
    assert "STUDENT" in roles
    assert "ASSISTANT" in roles


@pytest.mark.asyncio
async def test_ai_unavailable_maps_to_503(
    client: AsyncClient,
    db_session: AsyncSession,
    settings: Settings,
    published_assignment: dict,
    app,
) -> None:
    from app.api.routers.socratic import get_socratic_service
    from app.services.socratic_service import AiUnavailableServiceError

    user, _ = await create_authenticated_student(db_session, settings, client)
    await grant_assignment_access(db_session, published_assignment["id"], user.id)
    created = await client.post(
        "/api/socratic-sessions",
        json={"assignmentCode": published_assignment["code"]},
        headers=auth_headers(),
    )
    session_id = created.json()["id"]

    class BoomService:
        async def process_turn(self, *args, **kwargs):
            raise AiUnavailableServiceError("AI provider is unavailable")

    async def boom():
        return BoomService()

    app.dependency_overrides[get_socratic_service] = boom
    try:
        resp = await client.post(
            f"/api/socratic-sessions/{session_id}/messages",
            json={"content": "Em muốn hỏi về đề"},
            headers=auth_headers(),
        )
        assert resp.status_code == 503
        assert resp.json()["error"]["code"] == "AI_UNAVAILABLE"
        assert "OpenAI" not in resp.text
        assert "Traceback" not in resp.text
    finally:
        app.dependency_overrides.pop(get_socratic_service, None)


@pytest.mark.asyncio
async def test_outline_init_endpoint_saves_revision(
    client: AsyncClient,
    db_session: AsyncSession,
    settings: Settings,
    published_assignment: dict,
) -> None:
    user, _ = await create_authenticated_student(db_session, settings, client)
    await grant_assignment_access(db_session, published_assignment["id"], user.id)
    created = await client.post(
        "/api/socratic-sessions",
        json={"assignmentCode": published_assignment["code"]},
        headers=auth_headers(),
    )
    assert created.status_code == 201
    session_id = created.json()["id"]
    init = await client.post(
        f"/api/socratic-sessions/{session_id}/outline-init",
        headers=auth_headers(),
    )
    assert init.status_code == 200
    body = init.json()
    assert body["status"] == "COMPLETED"
    assert body["outline"] is not None
    assert body["outline"]["revision"] == 1
    assert body["outlineVersion"] == 1
    assert body["sessionState"] == "OUTLINE"
    again = await client.post(
        f"/api/socratic-sessions/{session_id}/outline-init?retry=true",
        headers=auth_headers(),
    )
    assert again.status_code == 200
    assert again.json()["outline"]["id"] == body["outline"]["id"]
    session = await client.get(
        f"/api/socratic-sessions/{session_id}",
        headers=auth_headers(),
    )
    assert session.status_code == 200
    assert session.json()["outlineInitStatus"] == "COMPLETED"
    assert session.json()["currentOutline"]["revision"] == 1
