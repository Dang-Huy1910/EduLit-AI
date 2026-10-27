from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text

from app.core.passwords import verify_password_sync
from app.db.models import AuthToken, AuthTokenPurpose, User
from app.db.session import get_session_factory
from tests.conftest import CapturingEmailAdapter, auth_headers, extract_token, unique_student


async def registered_student(client: AsyncClient) -> dict[str, str]:
    payload = unique_student("st")
    response = await client.post("/api/auth/register", json=payload, headers=auth_headers())
    assert response.status_code == 200
    assert response.json()["user"]["emailVerified"] is True
    return payload


@pytest.mark.asyncio
async def test_remember_me_cookie_flags(
    client: AsyncClient, email_adapter: CapturingEmailAdapter
) -> None:
    payload = await registered_student(client)
    session_login = await client.post(
        "/api/auth/login",
        json={"loginId": payload["loginId"], "password": payload["password"], "rememberMe": False},
        headers=auth_headers(),
    )
    cookie = session_login.headers.get("set-cookie", "")
    assert "edulit_session=" in cookie
    assert "httponly" in cookie.lower()
    assert "samesite=lax" in cookie.lower()
    assert "max-age" not in cookie.lower()

    persistent = await client.post(
        "/api/auth/login",
        json={"loginId": payload["loginId"], "password": payload["password"], "rememberMe": True},
        headers=auth_headers(),
    )
    cookie2 = persistent.headers.get("set-cookie", "")
    assert "max-age=" in cookie2.lower()


@pytest.mark.asyncio
async def test_forgot_reset_revokes_sessions_and_old_password(
    client: AsyncClient, email_adapter: CapturingEmailAdapter
) -> None:
    payload = await registered_student(client)
    login = await client.post(
        "/api/auth/login",
        json={"loginId": payload["loginId"], "password": payload["password"], "rememberMe": True},
        headers=auth_headers(),
    )
    assert login.status_code == 200
    forgot = await client.post(
        "/api/auth/forgot-password",
        json={"email": payload["email"]},
        headers=auth_headers(),
    )
    assert forgot.status_code == 202
    unknown = await client.post(
        "/api/auth/forgot-password",
        json={"email": "missing@example.test"},
        headers=auth_headers(),
    )
    assert unknown.status_code == 202
    assert unknown.json() == forgot.json()
    reset_token = extract_token(email_adapter)
    new_password = "mat-khau-moi-hop-le"
    reset = await client.post(
        "/api/auth/reset-password",
        json={"token": reset_token, "newPassword": new_password},
        headers=auth_headers(),
    )
    assert reset.status_code == 200
    me = await client.get("/api/auth/me")
    assert me.status_code == 401
    old = await client.post(
        "/api/auth/login",
        json={"loginId": payload["loginId"], "password": payload["password"]},
        headers=auth_headers(),
    )
    assert old.status_code == 401
    new_login = await client.post(
        "/api/auth/login",
        json={"loginId": payload["loginId"], "password": new_password},
        headers=auth_headers(),
    )
    assert new_login.status_code == 200
    replay = await client.post(
        "/api/auth/reset-password",
        json={"token": reset_token, "newPassword": "another-password-15"},
        headers=auth_headers(),
    )
    assert replay.status_code == 400


@pytest.mark.asyncio
async def test_change_password_revokes_and_requires_relogin(
    client: AsyncClient, email_adapter: CapturingEmailAdapter
) -> None:
    payload = await registered_student(client)
    await client.post(
        "/api/auth/login",
        json={"loginId": payload["loginId"], "password": payload["password"]},
        headers=auth_headers(),
    )
    wrong = await client.post(
        "/api/auth/change-password",
        json={"currentPassword": "sai-mat-khau-cu-15", "newPassword": "mat-khau-doi-thanh-cong"},
        headers=auth_headers(),
    )
    assert wrong.status_code == 401
    ok = await client.post(
        "/api/auth/change-password",
        json={"currentPassword": payload["password"], "newPassword": "mat-khau-doi-thanh-cong"},
        headers=auth_headers(),
    )
    assert ok.status_code == 200
    me = await client.get("/api/auth/me")
    assert me.status_code == 401
    relogin = await client.post(
        "/api/auth/login",
        json={"loginId": payload["loginId"], "password": "mat-khau-doi-thanh-cong"},
        headers=auth_headers(),
    )
    assert relogin.status_code == 200


@pytest.mark.asyncio
async def test_sessions_list_revoke_logout_all(
    client: AsyncClient, email_adapter: CapturingEmailAdapter
) -> None:
    payload = await registered_student(client)
    first = await client.post(
        "/api/auth/login",
        json={"loginId": payload["loginId"], "password": payload["password"], "rememberMe": True},
        headers=auth_headers(),
    )
    assert first.status_code == 200
    listed = await client.get("/api/auth/sessions")
    assert listed.status_code == 200
    sessions = listed.json()["sessions"]
    assert len(sessions) >= 1
    assert sessions[0]["isCurrent"] is True
    assert "token" not in str(sessions).lower() or "tokenHash" not in str(sessions)

    other = AsyncClient(transport=ASGITransport(app=client._transport.app), base_url="http://localhost:3000")
    second = await other.post(
        "/api/auth/login",
        json={"loginId": payload["loginId"], "password": payload["password"]},
        headers=auth_headers(),
    )
    assert second.status_code == 200
    listed2 = await client.get("/api/auth/sessions")
    ids = [s["id"] for s in listed2.json()["sessions"]]
    assert len(ids) == 2
    other_id = next(s["id"] for s in listed2.json()["sessions"] if not s["isCurrent"])
    revoked = await client.delete(f"/api/auth/sessions/{other_id}", headers=auth_headers())
    assert revoked.status_code == 200
    other_me = await other.get("/api/auth/me")
    assert other_me.status_code == 401
    await other.aclose()

    logout_all = await client.post("/api/auth/logout-all", json={}, headers=auth_headers())
    assert logout_all.status_code == 200
    me = await client.get("/api/auth/me")
    assert me.status_code == 401


@pytest.mark.asyncio
async def test_logout_is_idempotent_and_revokes(
    client: AsyncClient, email_adapter: CapturingEmailAdapter
) -> None:
    payload = await registered_student(client)
    await client.post(
        "/api/auth/login",
        json={"loginId": payload["loginId"], "password": payload["password"]},
        headers=auth_headers(),
    )
    first = await client.post("/api/auth/logout", json={}, headers=auth_headers())
    assert first.status_code == 200
    me = await client.get("/api/auth/me")
    assert me.status_code == 401
    second = await client.post("/api/auth/logout", json={}, headers=auth_headers())
    assert second.status_code == 200


@pytest.mark.asyncio
async def test_expired_session_rejected(
    client: AsyncClient, email_adapter: CapturingEmailAdapter
) -> None:
    payload = await registered_student(client)
    await client.post(
        "/api/auth/login",
        json={"loginId": payload["loginId"], "password": payload["password"]},
        headers=auth_headers(),
    )
    factory = get_session_factory()
    async with factory() as session:
        await session.execute(
            text("UPDATE auth_sessions SET expires_at = now() - interval '1 minute'")
        )
        await session.commit()
    me = await client.get("/api/auth/me")
    assert me.status_code == 401


@pytest.mark.asyncio
async def test_csrf_and_wrong_origin(
    client: AsyncClient, email_adapter: CapturingEmailAdapter
) -> None:
    payload = unique_student("csrf")
    missing = await client.post("/api/auth/register", json=payload)
    assert missing.status_code == 403
    bad_origin = await client.post(
        "/api/auth/register",
        json=payload,
        headers={"Origin": "http://evil.test", "X-Edulit-CSRF": "1", "Content-Type": "application/json"},
    )
    assert bad_origin.status_code == 403
    form = await client.post(
        "/api/auth/register",
        content="loginId=x",
        headers={"Origin": "http://localhost:3000", "X-Edulit-CSRF": "1", "Content-Type": "text/plain"},
    )
    assert form.status_code in {400, 403}


@pytest.mark.asyncio
async def test_demo_login_absent_and_response_has_no_secrets(
    client: AsyncClient, email_adapter: CapturingEmailAdapter
) -> None:
    demo = await client.post(
        "/api/auth/demo-login",
        json={"loginId": "dang.loan"},
        headers=auth_headers(),
    )
    assert demo.status_code == 404
    payload = unique_student("sec")
    res = await register_and_dump(client, payload)
    dumped = res.text.lower()
    assert payload["password"].lower() not in dumped
    assert "argon2" not in dumped


async def register_and_dump(client: AsyncClient, payload: dict):
    return await client.post("/api/auth/register", json=payload, headers=auth_headers())


@pytest.mark.asyncio
async def test_email_failure_does_not_change_password_or_revoke_sessions(
    client: AsyncClient, email_adapter: CapturingEmailAdapter, monkeypatch: pytest.MonkeyPatch
) -> None:
    email_adapter.fail = True
    send = AsyncMock(wraps=email_adapter.send)
    monkeypatch.setattr(email_adapter, "send", send)
    payload = unique_student("smtp")
    res = await client.post("/api/auth/register", json=payload, headers=auth_headers())
    assert res.status_code == 200
    send.assert_not_awaited()
    assert email_adapter.messages == []
    assert (await client.get("/api/auth/me")).status_code == 200
    forgot = await client.post(
        "/api/auth/forgot-password", json={"email": payload["email"]}, headers=auth_headers()
    )
    assert forgot.status_code == 202
    send.assert_awaited_once()
    assert send.await_args.args[0] == payload["email"]
    assert email_adapter.messages == []
    assert (await client.get("/api/auth/me")).status_code == 200
    factory = get_session_factory()
    async with factory() as session:
        user = (await session.execute(select(User).where(User.login_id == payload["loginId"]))).scalar_one()
        assert user.email_verified_at is not None
        assert verify_password_sync(user.password_hash, payload["password"])
        reset_token = (await session.execute(select(AuthToken))).scalar_one()
        assert reset_token.purpose == AuthTokenPurpose.PASSWORD_RESET
    login = await client.post(
        "/api/auth/login",
        json={"loginId": payload["loginId"], "password": payload["password"]},
        headers=auth_headers(),
    )
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_rate_limit_login_across_two_apps(email_adapter: CapturingEmailAdapter) -> None:
    from app.config import get_settings
    from app.main import create_app

    settings = get_settings()
    payload = unique_student("rl")

    async def make_client() -> AsyncClient:
        app = create_app()
        from app.config import get_settings as gs
        from app.identity.deps import get_email_adapter

        app.dependency_overrides[gs] = lambda: settings
        app.dependency_overrides[get_email_adapter] = lambda: email_adapter
        return AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost:3000")

    c1 = await make_client()
    registered = await c1.post("/api/auth/register", json=payload, headers=auth_headers())
    assert registered.status_code == 200
    c2 = await make_client()
    codes = []
    for i in range(8):
        target = c1 if i % 2 == 0 else c2
        res = await target.post(
            "/api/auth/login",
            json={"loginId": payload["loginId"], "password": "wrong-password-xx"},
            headers=auth_headers(),
        )
        codes.append(res.status_code)
        if res.status_code == 429:
            assert "Retry-After" in res.headers or "retry-after" in {k.lower() for k in res.headers}
            break
    await c1.aclose()
    await c2.aclose()
    assert 429 in codes
