"""Auth identity schema.

Revision ID: 0001_auth_schema
Revises:
Create Date: 2026-10-18
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0001_auth_schema"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TYPE user_role AS ENUM ('TEACHER', 'STUDENT');
        CREATE TYPE user_status AS ENUM ('ACTIVE', 'INACTIVE');
        CREATE TYPE auth_token_purpose AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

        CREATE TABLE users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            login_id VARCHAR(64) NOT NULL,
            email VARCHAR(320) NOT NULL,
            display_name VARCHAR(100) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role user_role NOT NULL,
            status user_status NOT NULL DEFAULT 'ACTIVE',
            email_verified_at TIMESTAMPTZ NULL,
            credentials_version INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT users_login_id_key UNIQUE (login_id),
            CONSTRAINT users_email_key UNIQUE (email)
        );

        CREATE TABLE auth_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
            token_hash VARCHAR(64) NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            revoked_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            persistent BOOLEAN NOT NULL DEFAULT false,
            user_agent VARCHAR(256) NULL,
            ip_address VARCHAR(64) NULL,
            CONSTRAINT auth_sessions_token_hash_key UNIQUE (token_hash)
        );
        CREATE INDEX auth_sessions_user_id_idx ON auth_sessions (user_id);
        CREATE INDEX auth_sessions_expires_at_idx ON auth_sessions (expires_at);

        CREATE TABLE auth_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
            purpose auth_token_purpose NOT NULL,
            token_hash VARCHAR(64) NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            used_at TIMESTAMPTZ NULL,
            revoked_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT auth_tokens_token_hash_key UNIQUE (token_hash)
        );
        CREATE INDEX auth_tokens_user_id_idx ON auth_tokens (user_id);
        CREATE INDEX auth_tokens_expires_at_idx ON auth_tokens (expires_at);
        CREATE INDEX auth_tokens_user_purpose_idx ON auth_tokens (user_id, purpose);

        CREATE TABLE rate_limit_buckets (
            bucket_key VARCHAR(256) PRIMARY KEY,
            count INTEGER NOT NULL DEFAULT 0,
            reset_at TIMESTAMPTZ NOT NULL
        );
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS rate_limit_buckets;
        DROP TABLE IF EXISTS auth_tokens;
        DROP TABLE IF EXISTS auth_sessions;
        DROP TABLE IF EXISTS users;
        DROP TYPE IF EXISTS auth_token_purpose;
        DROP TYPE IF EXISTS user_status;
        DROP TYPE IF EXISTS user_role;
        """
    )
