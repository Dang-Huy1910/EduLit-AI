from __future__ import annotations

import uuid
from typing import Sequence

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.http import utcnow
from app.db.models import AuthSession, AuthToken, AuthTokenPurpose, User, UserRole, UserStatus


class IdentityRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_user_by_id(self, user_id: uuid.UUID) -> User | None:
        result = await self.session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_user_by_login_id(self, login_id: str) -> User | None:
        result = await self.session.execute(select(User).where(User.login_id == login_id))
        return result.scalar_one_or_none()

    async def get_user_by_email(self, email: str) -> User | None:
        result = await self.session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def add_user(self, user: User) -> User:
        self.session.add(user)
        await self.session.flush()
        return user

    async def get_session_by_token_hash(self, token_hash: str) -> AuthSession | None:
        result = await self.session.execute(
            select(AuthSession).where(AuthSession.token_hash == token_hash)
        )
        return result.scalar_one_or_none()

    async def add_session(self, session_row: AuthSession) -> AuthSession:
        self.session.add(session_row)
        await self.session.flush()
        return session_row

    async def list_sessions(self, user_id: uuid.UUID) -> Sequence[AuthSession]:
        now = utcnow()
        result = await self.session.execute(
            select(AuthSession)
            .where(
                AuthSession.user_id == user_id,
                AuthSession.revoked_at.is_(None),
                AuthSession.expires_at > now,
            )
            .order_by(AuthSession.created_at.desc())
        )
        return result.scalars().all()

    async def revoke_session(self, session_id: uuid.UUID, user_id: uuid.UUID) -> AuthSession | None:
        now = utcnow()
        result = await self.session.execute(
            update(AuthSession)
            .where(
                AuthSession.id == session_id,
                AuthSession.user_id == user_id,
                AuthSession.revoked_at.is_(None),
            )
            .values(revoked_at=now)
            .returning(AuthSession)
        )
        return result.scalar_one_or_none()

    async def revoke_session_by_hash(self, token_hash: str) -> None:
        now = utcnow()
        await self.session.execute(
            update(AuthSession)
            .where(AuthSession.token_hash == token_hash, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )

    async def revoke_all_sessions(self, user_id: uuid.UUID) -> None:
        now = utcnow()
        await self.session.execute(
            update(AuthSession)
            .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )

    async def touch_session(self, session_id: uuid.UUID) -> None:
        await self.session.execute(
            update(AuthSession)
            .where(AuthSession.id == session_id)
            .values(last_seen_at=utcnow())
        )

    async def add_token(self, token: AuthToken) -> AuthToken:
        self.session.add(token)
        await self.session.flush()
        return token

    async def revoke_unused_tokens(self, user_id: uuid.UUID, purpose: AuthTokenPurpose) -> None:
        now = utcnow()
        await self.session.execute(
            update(AuthToken)
            .where(
                AuthToken.user_id == user_id,
                AuthToken.purpose == purpose,
                AuthToken.used_at.is_(None),
                AuthToken.revoked_at.is_(None),
            )
            .values(revoked_at=now)
        )

    async def consume_token(
        self,
        token_hash: str,
        purpose: AuthTokenPurpose,
    ) -> AuthToken | None:
        now = utcnow()
        result = await self.session.execute(
            update(AuthToken)
            .where(
                AuthToken.token_hash == token_hash,
                AuthToken.purpose == purpose,
                AuthToken.used_at.is_(None),
                AuthToken.revoked_at.is_(None),
                AuthToken.expires_at > now,
            )
            .values(used_at=now)
            .returning(AuthToken)
        )
        return result.scalar_one_or_none()

    async def increment_credentials_version(self, user_id: uuid.UUID, expected: int) -> bool:
        now = utcnow()
        result = await self.session.execute(
            update(User)
            .where(User.id == user_id, User.credentials_version == expected)
            .values(credentials_version=expected + 1, updated_at=now)
        )
        return result.rowcount == 1
