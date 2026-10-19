from __future__ import annotations

import uuid
from datetime import timedelta

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.core.http import utcnow
from app.core.passwords import hash_password_sync
from app.core.tokens import generate_raw_token, hash_token
from app.db.models import (
    AuthSession,
    ClassMembership,
    Classroom,
    User,
    UserRole,
    UserStatus,
)
from tests.conftest import auth_headers


async def create_user(
    db_session: AsyncSession,
    settings: Settings,
    client: AsyncClient,
    *,
    role: UserRole,
    prefix: str,
) -> User:
    login_id = f"{prefix}_{uuid.uuid4().hex[:8]}"
    user = User(
        login_id=login_id,
        email=f"{login_id}@thptdanphuong.edu.vn",
        display_name=f"Test {prefix}",
        password_hash=hash_password_sync("DanPhuong@2024X"),
        role=role,
        status=UserStatus.ACTIVE,
        email_verified_at=utcnow(),
    )
    db_session.add(user)
    await db_session.flush()
    raw_token = generate_raw_token()
    session = AuthSession(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        expires_at=utcnow() + timedelta(seconds=settings.SESSION_TTL_SECONDS_LONG),
        ip_address="127.0.0.1",
        user_agent="pytest-agent",
    )
    db_session.add(session)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def teacher_user(db_session: AsyncSession, settings: Settings, client: AsyncClient) -> User:
    user = await create_user(db_session, settings, client, role=UserRole.TEACHER, prefix="gv")
    await login_as(client, settings, db_session, user)
    return user


@pytest_asyncio.fixture
async def student_user(db_session: AsyncSession, settings: Settings, client: AsyncClient) -> User:
    return await create_user(db_session, settings, client, role=UserRole.STUDENT, prefix="hs")


async def login_as(client: AsyncClient, settings: Settings, db_session: AsyncSession, user: User) -> None:
    raw_token = generate_raw_token()
    session = AuthSession(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        expires_at=utcnow() + timedelta(seconds=settings.SESSION_TTL_SECONDS_LONG),
        ip_address="127.0.0.1",
        user_agent="pytest-agent",
    )
    db_session.add(session)
    await db_session.commit()
    client.cookies.set(settings.SESSION_COOKIE_NAME, raw_token)


HEADERS = auth_headers()


VALID_RUBRIC = {
    "title": "Barem 4 tiêu chí",
    "shortTitle": "4 tiêu chí",
    "description": "Thang 4.0",
    "version": "v1",
    "gradeLevel": 11,
    "maxScore": 4,
    "scoreStep": 0.25,
    "criteria": [
        {"id": "C1", "name": "Nội dung", "weight": 2.5, "guideNote": "Bám sát ngữ liệu"},
        {"id": "C2", "name": "Lập luận", "weight": 0.75},
        {"id": "C3", "name": "Diễn đạt", "weight": 0.5},
        {"id": "C4", "name": "Bố cục", "weight": 0.25},
    ],
}

FACTORY_TEXT = (
    "Buổi sáng thành phố mở mắt trong lớp sương xám của khói nhà máy. "
    "Ống khói đứng thẳng như những cây bút chì khổng lồ."
)


async def seed_classroom_with_student(
    db_session: AsyncSession, teacher: User, student: User, code: str = "11A14"
) -> Classroom:
    classroom = Classroom(
        owner_teacher_id=teacher.id,
        code=code,
        name=f"Lớp {code}",
        grade_level=11,
        academic_year="2026-2027",
    )
    db_session.add(classroom)
    await db_session.flush()
    db_session.add(
        ClassMembership(
            classroom_id=classroom.id,
            user_id=teacher.id,
            membership_role="TEACHER",
            status="ACTIVE",
        )
    )
    db_session.add(
        ClassMembership(
            classroom_id=classroom.id,
            user_id=student.id,
            membership_role="STUDENT",
            status="ACTIVE",
        )
    )
    await db_session.commit()
    await db_session.refresh(classroom)
    return classroom
