from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_serializer


def to_camel(name: str) -> str:
    parts = name.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        str_strip_whitespace=False,
    )


class RegisterRequest(CamelModel):
    login_id: str = Field(min_length=1, max_length=128)
    email: str = Field(min_length=3, max_length=320)
    display_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=128)


class TokenRequest(CamelModel):
    token: str = Field(min_length=1, max_length=512)


class EmailRequest(CamelModel):
    email: str = Field(min_length=3, max_length=320)


class LoginRequest(CamelModel):
    login_id: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=128)
    remember_me: bool = False


class ResetPasswordRequest(CamelModel):
    token: str = Field(min_length=1, max_length=512)
    new_password: str = Field(min_length=1, max_length=128)


class ChangePasswordRequest(CamelModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=128)


class PublicUser(CamelModel):
    id: str
    login_id: str
    email: str
    display_name: str
    role: str
    email_verified: bool


class LoginResponse(CamelModel):
    user: PublicUser


class MessageResponse(CamelModel):
    message: str


class RegisterResponse(CamelModel):
    status: str
    message: str


class SessionItem(CamelModel):
    id: str
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    persistent: bool
    is_current: bool
    user_agent: str | None = None
    ip_address: str | None = None

    @field_serializer("created_at", "last_seen_at", "expires_at")
    def _ser_dt(self, value: datetime) -> str:
        if value.tzinfo is None:
            return value.isoformat() + "Z"
        return value.isoformat()


class SessionListResponse(CamelModel):
    sessions: list[SessionItem]


def user_to_public(user: Any) -> PublicUser:
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    return PublicUser(
        id=str(user.id),
        login_id=user.login_id,
        email=user.email,
        display_name=user.display_name,
        role=role,
        email_verified=user.email_verified_at is not None,
    )
