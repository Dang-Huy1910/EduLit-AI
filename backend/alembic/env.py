from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import get_settings
from app.db.base import Base
from app.db.models import (  # noqa: F401
    Assignment,
    AssignmentAccess,
    AssignmentRevision,
    AuthSession,
    AuthToken,
    ChatMessage,
    ClassMembership,
    Classroom,
    IdempotencyRecord,
    Material,
    MaterialChunk,
    MaterialVersion,
    OutlineRevision,
    RateLimitBucket,
    Rubric,
    RubricVersion,
    SocraticSession,
    SourcePrompt,
    SourcePromptMaterial,
    TeacherDocument,
    TeacherDocumentBlob,
    Topic,
    User,
    StudentOutlinePrep,
    Submission,
    SubmissionAttempt,
    SubmissionPage,
    SubmissionPageBlob,
    OcrResult,
    TranscriptionRevision,
)

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.sync_database_url)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        # The classroom demo data migration opens its own async connection.
        # Committing each preceding revision lets that connection see the
        # schema it seeds on a freshly created database.
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            transaction_per_migration=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
