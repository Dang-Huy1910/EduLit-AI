from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.core.errors import ERROR_MESSAGES, ApiHttpException
from app.core.http import utcnow
from app.core.passwords import (
    hash_password,
    maybe_rehash,
    verify_dummy_password,
    verify_password,
)
from app.core.tokens import generate_raw_token, hash_token
from app.db.models import AuthSession, AuthToken, AuthTokenPurpose, User, UserRole, UserStatus
from app.email.adapter import EmailAdapter
from app.email.templates import password_changed_email, password_reset_email, verification_email
from app.identity.domain import (
    looks_like_email,
    normalize_display_name,
    normalize_email,
    normalize_login_id,
    validate_new_password,
)
from app.identity.rate_limit import hit_rate_limit
from app.identity.repository import IdentityRepository
from app.identity.schemas import PublicUser, SessionItem, user_to_public

logger = logging.getLogger("edulit.auth")

REGISTER_NEUTRAL = (
    "Nếu thông tin hợp lệ, hãy kiểm tra hộp thư để xác minh email rồi đăng nhập."
)
RESEND_NEUTRAL = "Nếu email còn cần xác minh, hãy kiểm tra hộp thư."
FORGOT_NEUTRAL = "Nếu email tồn tại, hãy kiểm tra hộp thư để đặt lại mật khẩu."


@dataclass
class LoginResult:
    user: PublicUser
    raw_token: str
    persistent: bool
    expires_at: object


@dataclass
class SessionContext:
    user: User
    session: AuthSession
    raw_token: str


class AuthService:
    def __init__(
        self,
        session: AsyncSession,
        settings: Settings,
        email: EmailAdapter,
    ) -> None:
        self.session = session
        self.settings = settings
        self.email = email
        self.repo = IdentityRepository(session)

    def _app_url(self, path: str, raw_token: str) -> str:
        origin = self.settings.normalized_origin
        return f"{origin}{path}#token={raw_token}"

    def _teacher_login_ids(self) -> set[str]:
        return {self.settings.BOOTSTRAP_TEACHER_LOGIN_ID.strip().lower()}

    async def _send_email_safely(self, to_address: str, message) -> None:
        try:
            await self.email.send(to_address, message)
        except Exception:
            logger.exception("email_delivery_failed to_domain=%s", to_address.split("@")[-1])

    async def register(
        self,
        *,
        login_id_raw: str,
        email_raw: str,
        display_name_raw: str,
        password_raw: str,
        ip: str,
    ) -> dict[str, str]:
        await hit_rate_limit(
            self.settings,
            f"register:ip:{ip}",
            self.settings.RATE_LIMIT_REGISTER_IP_MAX,
        )
        login_id = normalize_login_id(login_id_raw)
        email = normalize_email(email_raw)
        display_name = normalize_display_name(display_name_raw)
        password = validate_new_password(password_raw)

        if login_id in self._teacher_login_ids():
            raise ApiHttpException(409, "USERNAME_TAKEN", ERROR_MESSAGES["USERNAME_TAKEN"])

        existing_login = await self.repo.get_user_by_login_id(login_id)
        if existing_login is not None:
            raise ApiHttpException(409, "USERNAME_TAKEN", ERROR_MESSAGES["USERNAME_TAKEN"])

        existing_email = await self.repo.get_user_by_email(email)
        if existing_email is not None:
            await self.session.commit()
            return {"status": "verification_required", "message": REGISTER_NEUTRAL}

        password_hash = await hash_password(password)
        user = User(
            login_id=login_id,
            email=email,
            display_name=display_name,
            password_hash=password_hash,
            role=UserRole.STUDENT,
            status=UserStatus.ACTIVE,
            email_verified_at=None,
        )
        try:
            await self.repo.add_user(user)
            raw_token = generate_raw_token()
            await self.repo.add_token(
                AuthToken(
                    user_id=user.id,
                    purpose=AuthTokenPurpose.EMAIL_VERIFICATION,
                    token_hash=hash_token(raw_token),
                    expires_at=utcnow()
                    + timedelta(seconds=self.settings.EMAIL_VERIFICATION_TTL_SECONDS),
                )
            )
            await self.session.commit()
        except IntegrityError as exc:
            await self.session.rollback()
            return await self._register_integrity_conflict(exc, login_id, email)

        await self._send_email_safely(
            email,
            verification_email(display_name, self._app_url("/verify-email", raw_token)),
        )
        return {"status": "verification_required", "message": REGISTER_NEUTRAL}

    async def _register_integrity_conflict(
        self,
        exc: IntegrityError,
        login_id: str,
        email: str,
    ) -> dict[str, str]:
        existing_login = await self.repo.get_user_by_login_id(login_id)
        if existing_login is not None:
            raise ApiHttpException(409, "USERNAME_TAKEN", ERROR_MESSAGES["USERNAME_TAKEN"])
        constraint = _constraint_name(exc)
        if constraint in {"users_email_key", "users_email_unique"} or await self.repo.get_user_by_email(email):
            return {"status": "verification_required", "message": REGISTER_NEUTRAL}
        logger.exception("register_integrity_error constraint=%s", constraint)
        raise ApiHttpException(500, "INTERNAL", ERROR_MESSAGES["INTERNAL"]) from exc

    async def verify_email(self, raw_token: str, ip: str) -> dict[str, str]:
        await hit_rate_limit(
            self.settings,
            f"verify:ip:{ip}",
            self.settings.RATE_LIMIT_VERIFY_IP_MAX,
        )
        token = (raw_token or "").strip()
        if not token:
            raise ApiHttpException(400, "TOKEN_INVALID", ERROR_MESSAGES["TOKEN_INVALID"])
        consumed = await self.repo.consume_token(
            hash_token(token),
            AuthTokenPurpose.EMAIL_VERIFICATION,
        )
        if consumed is None:
            await self.session.rollback()
            raise ApiHttpException(400, "TOKEN_INVALID", ERROR_MESSAGES["TOKEN_INVALID"])

        user = await self.repo.get_user_by_id(consumed.user_id)
        if user is None:
            await self.session.rollback()
            raise ApiHttpException(400, "TOKEN_INVALID", ERROR_MESSAGES["TOKEN_INVALID"])
        if user.email_verified_at is None:
            user.email_verified_at = utcnow()
            user.updated_at = utcnow()
        await self.session.commit()
        return {"message": "Email đã được xác minh. Hãy đăng nhập để tiếp tục."}

    async def resend_verification(self, email_raw: str, ip: str) -> dict[str, str]:
        await hit_rate_limit(
            self.settings,
            f"resend:ip:{ip}",
            self.settings.RATE_LIMIT_EMAIL_IP_MAX,
        )
        try:
            email = normalize_email(email_raw)
        except ApiHttpException:
            await self.session.commit()
            return {"message": RESEND_NEUTRAL}

        await hit_rate_limit(
            self.settings,
            f"resend:email:{email}",
            self.settings.RATE_LIMIT_EMAIL_ACCOUNT_MAX,
        )

        user = await self.repo.get_user_by_email(email)
        if user is None or user.email_verified_at is not None:
            await self.session.commit()
            return {"message": RESEND_NEUTRAL}

        await self.repo.revoke_unused_tokens(user.id, AuthTokenPurpose.EMAIL_VERIFICATION)
        raw_token = generate_raw_token()
        await self.repo.add_token(
            AuthToken(
                user_id=user.id,
                purpose=AuthTokenPurpose.EMAIL_VERIFICATION,
                token_hash=hash_token(raw_token),
                expires_at=utcnow()
                + timedelta(seconds=self.settings.EMAIL_VERIFICATION_TTL_SECONDS),
            )
        )
        await self.session.commit()
        await self._send_email_safely(
            user.email,
            verification_email(user.display_name, self._app_url("/verify-email", raw_token)),
        )
        return {"message": RESEND_NEUTRAL}

    async def _resolve_login_user(self, identifier: str) -> User | None:
        if looks_like_email(identifier):
            try:
                email = normalize_email(identifier)
            except ApiHttpException:
                return None
            user = await self.repo.get_user_by_email(email)
            if user is not None:
                return user
            if email in self.settings.teacher_email_aliases:
                return await self.repo.get_user_by_login_id(
                    self.settings.BOOTSTRAP_TEACHER_LOGIN_ID.strip().lower()
                )
            return None
        try:
            login_id = normalize_login_id(identifier)
        except ApiHttpException:
            return None
        return await self.repo.get_user_by_login_id(login_id)

    async def login(
        self,
        *,
        identifier_raw: str,
        password_raw: str,
        remember_me: bool,
        ip: str,
        user_agent: str,
        current_raw_token: str | None,
    ) -> LoginResult:
        identifier = (identifier_raw or "").strip()
        await hit_rate_limit(
            self.settings,
            f"login:ip:{ip}",
            self.settings.RATE_LIMIT_LOGIN_IP_MAX,
        )
        account_key = identifier.lower()
        await hit_rate_limit(
            self.settings,
            f"login:id:{account_key}",
            self.settings.RATE_LIMIT_LOGIN_ACCOUNT_MAX,
        )

        user = await self._resolve_login_user(identifier)
        if user is None:
            await verify_dummy_password(password_raw)
            await self.session.commit()
            raise ApiHttpException(401, "AUTH_CREDENTIALS", ERROR_MESSAGES["AUTH_CREDENTIALS"])

        password_ok = await verify_password(user.password_hash, password_raw)
        if not password_ok:
            await self.session.commit()
            raise ApiHttpException(401, "AUTH_CREDENTIALS", ERROR_MESSAGES["AUTH_CREDENTIALS"])

        if user.status != UserStatus.ACTIVE:
            await self.session.commit()
            raise ApiHttpException(403, "ACCOUNT_INACTIVE", ERROR_MESSAGES["ACCOUNT_INACTIVE"])
        if user.email_verified_at is None:
            await self.session.commit()
            raise ApiHttpException(403, "AUTH_UNVERIFIED", ERROR_MESSAGES["AUTH_UNVERIFIED"])

        new_hash = await maybe_rehash(user.password_hash, password_raw)
        if new_hash:
            user.password_hash = new_hash
            user.updated_at = utcnow()

        if current_raw_token:
            await self.repo.revoke_session_by_hash(hash_token(current_raw_token))

        version_at_verify = user.credentials_version
        persistent = bool(remember_me)
        ttl = (
            self.settings.SESSION_TTL_SECONDS_LONG
            if persistent
            else self.settings.SESSION_TTL_SECONDS_SHORT
        )
        raw_token = generate_raw_token()
        expires_at = utcnow() + timedelta(seconds=ttl)
        session_row = AuthSession(
            user_id=user.id,
            token_hash=hash_token(raw_token),
            expires_at=expires_at,
            persistent=persistent,
            user_agent=user_agent or None,
            ip_address=ip,
            last_seen_at=utcnow(),
        )
        await self.repo.add_session(session_row)
        await self.session.flush()

        fresh = await self.repo.get_user_by_id(user.id)
        if fresh is None or fresh.credentials_version != version_at_verify:
            session_row.revoked_at = utcnow()
            await self.session.commit()
            raise ApiHttpException(401, "AUTH_CREDENTIALS", ERROR_MESSAGES["AUTH_CREDENTIALS"])
        if fresh.status != UserStatus.ACTIVE or fresh.email_verified_at is None:
            session_row.revoked_at = utcnow()
            await self.session.commit()
            raise ApiHttpException(401, "AUTH_INVALID", ERROR_MESSAGES["AUTH_INVALID"])

        await self.session.commit()
        return LoginResult(
            user=user_to_public(fresh),
            raw_token=raw_token,
            persistent=persistent,
            expires_at=expires_at,
        )

    async def authenticate(self, raw_token: str | None) -> SessionContext:
        if not raw_token:
            raise ApiHttpException(401, "AUTH_INVALID", ERROR_MESSAGES["AUTH_INVALID"])
        session_row = await self.repo.get_session_by_token_hash(hash_token(raw_token))
        now = utcnow()
        if session_row is None or session_row.revoked_at is not None:
            raise ApiHttpException(401, "AUTH_INVALID", ERROR_MESSAGES["AUTH_INVALID"])
        expires_at = session_row.expires_at
        if expires_at.tzinfo is None:
            from datetime import timezone

            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= now:
            raise ApiHttpException(401, "AUTH_INVALID", ERROR_MESSAGES["AUTH_INVALID"])

        user = await self.repo.get_user_by_id(session_row.user_id)
        if user is None or user.status != UserStatus.ACTIVE:
            raise ApiHttpException(403, "ACCOUNT_INACTIVE", ERROR_MESSAGES["ACCOUNT_INACTIVE"])
        if user.email_verified_at is None:
            raise ApiHttpException(403, "AUTH_UNVERIFIED", ERROR_MESSAGES["AUTH_UNVERIFIED"])

        await self.repo.touch_session(session_row.id)
        await self.session.commit()
        return SessionContext(user=user, session=session_row, raw_token=raw_token)

    async def logout(self, raw_token: str | None) -> None:
        if raw_token:
            await self.repo.revoke_session_by_hash(hash_token(raw_token))
        await self.session.commit()

    async def forgot_password(self, email_raw: str, ip: str) -> dict[str, str]:
        await hit_rate_limit(
            self.settings,
            f"forgot:ip:{ip}",
            self.settings.RATE_LIMIT_EMAIL_IP_MAX,
        )
        try:
            email = normalize_email(email_raw)
        except ApiHttpException:
            await self.session.commit()
            return {"message": FORGOT_NEUTRAL}

        await hit_rate_limit(
            self.settings,
            f"forgot:email:{email}",
            self.settings.RATE_LIMIT_EMAIL_ACCOUNT_MAX,
        )

        user = await self.repo.get_user_by_email(email)
        if user is None and email in self.settings.teacher_email_aliases:
            user = await self.repo.get_user_by_login_id(
                self.settings.BOOTSTRAP_TEACHER_LOGIN_ID.strip().lower()
            )
        if user is None or user.status != UserStatus.ACTIVE:
            await self.session.commit()
            return {"message": FORGOT_NEUTRAL}

        await self.repo.revoke_unused_tokens(user.id, AuthTokenPurpose.PASSWORD_RESET)
        raw_token = generate_raw_token()
        await self.repo.add_token(
            AuthToken(
                user_id=user.id,
                purpose=AuthTokenPurpose.PASSWORD_RESET,
                token_hash=hash_token(raw_token),
                expires_at=utcnow()
                + timedelta(seconds=self.settings.PASSWORD_RESET_TTL_SECONDS),
            )
        )
        await self.session.commit()
        await self._send_email_safely(
            user.email,
            password_reset_email(user.display_name, self._app_url("/reset-password", raw_token)),
        )
        return {"message": FORGOT_NEUTRAL}

    async def reset_password(self, raw_token: str, new_password_raw: str, ip: str) -> dict[str, str]:
        await hit_rate_limit(
            self.settings,
            f"reset:ip:{ip}",
            self.settings.RATE_LIMIT_RESET_IP_MAX,
        )
        token = (raw_token or "").strip()
        new_password = validate_new_password(new_password_raw)
        if not token:
            raise ApiHttpException(400, "TOKEN_INVALID", ERROR_MESSAGES["TOKEN_INVALID"])

        consumed = await self.repo.consume_token(hash_token(token), AuthTokenPurpose.PASSWORD_RESET)
        if consumed is None:
            await self.session.rollback()
            raise ApiHttpException(400, "TOKEN_INVALID", ERROR_MESSAGES["TOKEN_INVALID"])

        user = await self.repo.get_user_by_id(consumed.user_id)
        if user is None:
            await self.session.rollback()
            raise ApiHttpException(400, "TOKEN_INVALID", ERROR_MESSAGES["TOKEN_INVALID"])

        user.password_hash = await hash_password(new_password)
        user.credentials_version = user.credentials_version + 1
        user.updated_at = utcnow()
        await self.repo.revoke_all_sessions(user.id)
        await self.repo.revoke_unused_tokens(user.id, AuthTokenPurpose.PASSWORD_RESET)
        await self.session.commit()
        await self._send_email_safely(user.email, password_changed_email(user.display_name))
        return {"message": "Mật khẩu đã được đặt lại. Hãy đăng nhập bằng mật khẩu mới."}

    async def change_password(
        self,
        ctx: SessionContext,
        current_password: str,
        new_password_raw: str,
    ) -> dict[str, str]:
        new_password = validate_new_password(new_password_raw)
        ok = await verify_password(ctx.user.password_hash, current_password)
        if not ok:
            raise ApiHttpException(401, "PASSWORD_MISMATCH", ERROR_MESSAGES["PASSWORD_MISMATCH"])

        expected = ctx.user.credentials_version
        ctx.user.password_hash = await hash_password(new_password)
        ctx.user.updated_at = utcnow()
        bumped = await self.repo.increment_credentials_version(ctx.user.id, expected)
        if not bumped:
            await self.session.rollback()
            raise ApiHttpException(401, "AUTH_INVALID", ERROR_MESSAGES["AUTH_INVALID"])
        await self.repo.revoke_all_sessions(ctx.user.id)
        await self.session.commit()
        await self._send_email_safely(ctx.user.email, password_changed_email(ctx.user.display_name))
        return {"message": "Mật khẩu đã được đổi. Hãy đăng nhập lại."}

    async def list_sessions(self, ctx: SessionContext) -> dict:
        rows = await self.repo.list_sessions(ctx.user.id)
        items = [
            SessionItem(
                id=str(row.id),
                created_at=row.created_at,
                last_seen_at=row.last_seen_at,
                expires_at=row.expires_at,
                persistent=row.persistent,
                is_current=row.id == ctx.session.id,
                user_agent=row.user_agent,
                ip_address=row.ip_address,
            )
            for row in rows
        ]
        return {"sessions": [item.model_dump(by_alias=True) for item in items]}

    async def revoke_session(self, ctx: SessionContext, session_id: uuid.UUID) -> bool:
        """Return True if the revoked session was the current one."""
        revoked = await self.repo.revoke_session(session_id, ctx.user.id)
        if revoked is None:
            await self.session.rollback()
            raise ApiHttpException(404, "SESSION_NOT_FOUND", ERROR_MESSAGES["SESSION_NOT_FOUND"])
        await self.session.commit()
        return revoked.id == ctx.session.id

    async def logout_all(self, ctx: SessionContext) -> None:
        await self.repo.revoke_all_sessions(ctx.user.id)
        await self.session.commit()


def _constraint_name(exc: IntegrityError) -> str | None:
    orig = getattr(exc, "orig", None)
    if orig is None:
        return None
    diag = getattr(orig, "diag", None)
    if diag is not None and getattr(diag, "constraint_name", None):
        return diag.constraint_name
    constraint = getattr(orig, "constraint_name", None)
    if constraint:
        return constraint
    message = str(orig)
    for name in ("users_login_id_key", "users_email_key"):
        if name in message:
            return name
    return None
