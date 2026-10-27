from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.cli import bootstrap_teacher
from app.config import get_settings
from app.db.models import User, UserRole
from app.db.session import get_session_factory
from tests.conftest import auth_headers, unique_student


@pytest.mark.asyncio
async def test_bootstrap_teacher_idempotent_and_login(client: AsyncClient) -> None:
    settings = get_settings()
    await bootstrap_teacher(settings, reset_password=False)
    await bootstrap_teacher(settings, reset_password=False)

    factory = get_session_factory()
    async with factory() as session:
        users = (
            await session.execute(select(User).where(User.login_id == "dang.loan"))
        ).scalars().all()
        assert len(users) == 1
        teacher = users[0]
        assert teacher.role == UserRole.TEACHER
        assert teacher.email_verified_at is not None
        first_hash = teacher.password_hash
        first_id = teacher.id

    await bootstrap_teacher(settings, reset_password=False)
    async with factory() as session:
        teacher = (
            await session.execute(select(User).where(User.login_id == "dang.loan"))
        ).scalar_one()
        assert teacher.id == first_id
        assert teacher.password_hash == first_hash

    login = await client.post(
        "/api/auth/login",
        json={"loginId": "dang.loan", "password": settings.BOOTSTRAP_TEACHER_PASSWORD},
        headers=auth_headers(),
    )
    assert login.status_code == 200
    assert login.json()["user"]["role"] == "TEACHER"
    assert login.json()["user"]["displayName"] == "Cô Đặng Loan"

    email_login = await client.post(
        "/api/auth/login",
        json={
            "loginId": "dang.loan@thptdanphuong.edu.vn",
            "password": settings.BOOTSTRAP_TEACHER_PASSWORD,
        },
        headers=auth_headers(),
    )
    assert email_login.status_code == 200
    assert email_login.json()["user"]["id"] == login.json()["user"]["id"]


@pytest.mark.asyncio
async def test_register_cannot_claim_teacher_username(client: AsyncClient) -> None:
    await bootstrap_teacher(get_settings(), reset_password=False)
    payload = unique_student("gv")
    payload["loginId"] = "dang.loan"
    res = await client.post("/api/auth/register", json=payload, headers=auth_headers())
    assert res.status_code == 409
    factory = get_session_factory()
    async with factory() as session:
        user = (await session.execute(select(User).where(User.login_id == "dang.loan"))).scalar_one()
        assert user.role == UserRole.TEACHER
