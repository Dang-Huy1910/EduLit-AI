from __future__ import annotations

import asyncio
from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text

from app.core.http import utcnow
from app.core.passwords import hash_password_sync, verify_password_sync
from app.core.tokens import generate_raw_token, hash_token
from app.db.models import AuthSession, AuthToken, AuthTokenPurpose, User, UserRole, UserStatus
from app.db.session import get_session_factory
from tests.conftest import CapturingEmailAdapter, auth_headers, extract_token, unique_student


async def register(client: AsyncClient, payload: dict) -> object:
    return await client.post("/api/auth/register", json=payload, headers=auth_headers())


async def legacy_student(prefix: str) -> dict[str, str]:
    """Create an account from before registration automatically verified students."""
    payload = unique_student(prefix)
    factory = get_session_factory()
    async with factory() as session:
        session.add(
            User(
                login_id=payload["loginId"],
                email=payload["email"],
                display_name=payload["displayName"],
                password_hash=hash_password_sync(payload["password"]),
                role=UserRole.STUDENT,
                status=UserStatus.ACTIVE,
                email_verified_at=None,
            )
        )
        await session.commit()
    return payload


async def request_verification(client: AsyncClient, payload: dict[str, str]) -> None:
    response = await client.post(
        "/api/auth/resend-verification", json={"email": payload["email"]}, headers=auth_headers()
    )
    assert response.status_code == 202


@pytest.mark.asyncio
async def test_register_stores_student_and_hides_token(
    client: AsyncClient, email_adapter: CapturingEmailAdapter
) -> None:
    payload = unique_student("reg")
    res = await register(client, payload)
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "success"
    assert body["user"]["loginId"] == payload["loginId"]
    assert body["user"]["emailVerified"] is True
    assert "token" not in str(body).lower()
    assert payload["password"] not in str(body)
    assert email_adapter.messages == []
    assert "httponly" in res.headers["set-cookie"].lower()
    assert "max-age=" in res.headers["set-cookie"].lower()
    raw_session = client.cookies["edulit_session"]

    factory = get_session_factory()
    async with factory() as session:
        user = (await session.execute(select(User).where(User.login_id == payload["loginId"]))).scalar_one()
        assert user.role == UserRole.STUDENT
        assert user.email_verified_at is not None
        assert user.password_hash != payload["password"]
        assert verify_password_sync(user.password_hash, payload["password"])
        tokens = (await session.execute(select(AuthToken))).scalars().all()
        assert tokens == []
        stored_session = (await session.execute(select(AuthSession))).scalar_one()
        assert stored_session.user_id == user.id
        assert stored_session.token_hash == hash_token(raw_session)
        assert raw_session not in stored_session.token_hash
    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["id"] == body["user"]["id"]


@pytest.mark.asyncio
async def test_legacy_unverified_student_can_login_and_read_me(
    client: AsyncClient, email_adapter: CapturingEmailAdapter
) -> None:
    payload = await legacy_student("uv")
    assert (await client.get("/api/auth/me")).status_code == 401
    login = await client.post(
        "/api/auth/login",
        json={"loginId": payload["loginId"], "password": payload["password"]},
        headers=auth_headers(),
    )
    assert login.status_code == 200
    assert login.json()["user"]["emailVerified"] is True
    assert email_adapter.messages == []
    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["id"] == login.json()["user"]["id"]
    factory = get_session_factory()
    async with factory() as session:
        user = (await session.execute(select(User).where(User.login_id == payload["loginId"]))).scalar_one()
        assert user.email_verified_at is not None


@pytest.mark.asyncio
async def test_verify_then_login_refresh(
    client: AsyncClient, email_adapter: CapturingEmailAdapter
) -> None:
    payload = await legacy_student("ok")
    await request_verification(client, payload)
    token = extract_token(email_adapter)
    verify = await client.post("/api/auth/verify-email", json={"token": token}, headers=auth_headers())
    assert verify.status_code == 200
    login = await client.post(
        "/api/auth/login",
        json={"loginId": payload["loginId"], "password": payload["password"], "rememberMe": True},
        headers=auth_headers(),
    )
    assert login.status_code == 200
    user = login.json()["user"]
    assert user["loginId"] == payload["loginId"]
    assert user["role"] == "STUDENT"
    assert user["emailVerified"] is True
    assert "password" not in user
    cookie = login.headers.get("set-cookie", "")
    assert "HttpOnly" in cookie or "httponly" in cookie.lower()
    assert "edulit_session=" in cookie
    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["id"] == user["id"]


@pytest.mark.asyncio
async def test_verify_rejects_bad_expired_used_and_wrong_purpose(
    client: AsyncClient, email_adapter: CapturingEmailAdapter
) -> None:
    payload = await legacy_student("tok")
    await request_verification(client, payload)
    good = extract_token(email_adapter)
    assert email_adapter.messages[-1][0] == payload["email"]
    factory = get_session_factory()
    async with factory() as session:
        stored_token = (await session.execute(select(AuthToken))).scalar_one()
        assert stored_token.purpose == AuthTokenPurpose.EMAIL_VERIFICATION
        assert stored_token.token_hash == hash_token(good)
        assert good not in stored_token.token_hash
    bad = await client.post("/api/auth/verify-email", json={"token": "not-a-real-token"}, headers=auth_headers())
    assert bad.status_code == 400

    factory = get_session_factory()
    async with factory() as session:
        user = (await session.execute(select(User).where(User.login_id == payload["loginId"]))).scalar_one()
        expired_raw = generate_raw_token()
        session.add(
            AuthToken(
                user_id=user.id,
                purpose=AuthTokenPurpose.EMAIL_VERIFICATION,
                token_hash=hash_token(expired_raw),
                expires_at=utcnow() - timedelta(hours=1),
            )
        )
        reset_raw = generate_raw_token()
        session.add(
            AuthToken(
                user_id=user.id,
                purpose=AuthTokenPurpose.PASSWORD_RESET,
                token_hash=hash_token(reset_raw),
                expires_at=utcnow() + timedelta(hours=1),
            )
        )
        await session.commit()

    expired = await client.post(
        "/api/auth/verify-email", json={"token": expired_raw}, headers=auth_headers()
    )
    assert expired.status_code == 400
    wrong = await client.post(
        "/api/auth/verify-email", json={"token": reset_raw}, headers=auth_headers()
    )
    assert wrong.status_code == 400
    first = await client.post("/api/auth/verify-email", json={"token": good}, headers=auth_headers())
    assert first.status_code == 200
    replay = await client.post("/api/auth/verify-email", json={"token": good}, headers=auth_headers())
    assert replay.status_code == 400


@pytest.mark.asyncio
async def test_concurrent_verify_uses_token_once(
    client: AsyncClient, email_adapter: CapturingEmailAdapter
) -> None:
    payload = await legacy_student("race")
    await request_verification(client, payload)
    token = extract_token(email_adapter)
    results = await asyncio.gather(
        *[
            client.post("/api/auth/verify-email", json={"token": token}, headers=auth_headers())
            for _ in range(2)
        ]
    )
    codes = sorted(r.status_code for r in results)
    assert codes == [200, 400]


@pytest.mark.asyncio
async def test_duplicate_username_and_email_policy(
    client: AsyncClient, email_adapter: CapturingEmailAdapter
) -> None:
    first = unique_student("dup")
    await register(client, first)
    same_user = await register(client, first)
    assert same_user.status_code == 409
    assert same_user.json()["error"]["code"] == "USERNAME_TAKEN"
    other = unique_student("dup2")
    other["loginId"] = first["loginId"].upper()
    case = await register(client, other)
    assert case.status_code == 409
    assert case.json()["error"]["code"] == "USERNAME_TAKEN"
    email_taken = unique_student("dup3")
    email_taken["email"] = first["email"]
    duplicate_email = await register(client, email_taken)
    assert duplicate_email.status_code == 409
    assert duplicate_email.json()["error"]["code"] == "EMAIL_TAKEN"
    factory = get_session_factory()
    async with factory() as session:
        rows = (
            await session.execute(select(User).where(User.email == first["email"].lower()))
        ).scalars().all()
        assert len(rows) == 1
        assert verify_password_sync(rows[0].password_hash, first["password"])


@pytest.mark.asyncio
async def test_concurrent_register_same_username() -> None:
    from httpx import ASGITransport

    from app.main import create_app
    from tests.conftest import get_settings

    settings = get_settings()
    payload = unique_student("con")

    async def one() -> int:
        app = create_app()
        adapter = CapturingEmailAdapter(settings)
        from app.config import get_settings as gs
        from app.identity.deps import get_email_adapter

        app.dependency_overrides[gs] = lambda: settings
        app.dependency_overrides[get_email_adapter] = lambda: adapter
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost:3000") as ac:
            res = await ac.post("/api/auth/register", json=payload, headers=auth_headers())
            return res.status_code

    codes = sorted(await asyncio.gather(one(), one()))
    assert codes == [200, 409]
    factory = get_session_factory()
    async with factory() as session:
        users = (
            await session.execute(select(User).where(User.login_id == payload["loginId"]))
        ).scalars().all()
        assert len(users) == 1


@pytest.mark.asyncio
async def test_resend_does_not_change_password(
    client: AsyncClient, email_adapter: CapturingEmailAdapter
) -> None:
    payload = await legacy_student("rs")
    resend = await client.post(
        "/api/auth/resend-verification",
        json={"email": payload["email"]},
        headers=auth_headers(),
    )
    assert resend.status_code == 202
    missing = await client.post(
        "/api/auth/resend-verification",
        json={"email": "nobody@example.test"},
        headers=auth_headers(),
    )
    assert missing.status_code == 202
    assert missing.json() == resend.json()
    assert len(email_adapter.messages) == 1
    token = extract_token(email_adapter)
    factory = get_session_factory()
    async with factory() as session:
        user = (await session.execute(select(User).where(User.login_id == payload["loginId"]))).scalar_one()
        assert user.email_verified_at is None
        assert verify_password_sync(user.password_hash, payload["password"])
    verify = await client.post("/api/auth/verify-email", json={"token": token}, headers=auth_headers())
    assert verify.status_code == 200
    assert (await client.post(
        "/api/auth/resend-verification", json={"email": payload["email"]}, headers=auth_headers()
    )).status_code == 202
    assert len(email_adapter.messages) == 1


@pytest.mark.asyncio
async def test_register_injection_cannot_set_role_or_id(client: AsyncClient) -> None:
    payload = unique_student("inj")
    payload["role"] = "TEACHER"
    payload["status"] = "ACTIVE"
    payload["id"] = "00000000-0000-0000-0000-000000000001"
    res = await client.post("/api/auth/register", json=payload, headers=auth_headers())
    assert res.status_code == 400
    clean = unique_student("inj2")
    await register(client, clean)
    factory = get_session_factory()
    async with factory() as session:
        user = (await session.execute(select(User).where(User.login_id == clean["loginId"]))).scalar_one()
        assert user.role == UserRole.STUDENT


@pytest.mark.asyncio
async def test_wrong_password_and_nonexistent_and_no_trim(
    client: AsyncClient, email_adapter: CapturingEmailAdapter
) -> None:
    payload = unique_student("pw")
    payload["password"] = "  leading-space-15"
    await register(client, payload)
    trimmed = await client.post(
        "/api/auth/login",
        json={"loginId": payload["loginId"], "password": payload["password"].strip()},
        headers=auth_headers(),
    )
    assert trimmed.status_code == 401
    ok = await client.post(
        "/api/auth/login",
        json={"loginId": payload["loginId"], "password": payload["password"]},
        headers=auth_headers(),
    )
    assert ok.status_code == 200
    missing = await client.post(
        "/api/auth/login",
        json={"loginId": "no.such.user", "password": payload["password"]},
        headers=auth_headers(),
    )
    assert missing.status_code == 401
    assert missing.json()["error"]["code"] == "AUTH_CREDENTIALS"


@pytest.mark.asyncio
async def test_inactive_after_verified_password(
    client: AsyncClient, email_adapter: CapturingEmailAdapter
) -> None:
    payload = unique_student("inact")
    await register(client, payload)
    factory = get_session_factory()
    async with factory() as session:
        await session.execute(
            text("UPDATE users SET status = 'INACTIVE' WHERE login_id = :lid"),
            {"lid": payload["loginId"]},
        )
        await session.commit()
    res = await client.post(
        "/api/auth/login",
        json={"loginId": payload["loginId"], "password": payload["password"]},
        headers=auth_headers(),
    )
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "ACCOUNT_INACTIVE"
    wrong = await client.post(
        "/api/auth/login",
        json={"loginId": payload["loginId"], "password": "totally-wrong-pass1"},
        headers=auth_headers(),
    )
    assert wrong.status_code == 401
