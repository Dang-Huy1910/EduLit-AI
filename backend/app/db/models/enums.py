from enum import StrEnum


class UserRole(StrEnum):
    TEACHER = "TEACHER"
    STUDENT = "STUDENT"


class UserStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class AuthTokenPurpose(StrEnum):
    EMAIL_VERIFICATION = "EMAIL_VERIFICATION"
    PASSWORD_RESET = "PASSWORD_RESET"


class SocraticState(StrEnum):
    """Business state of a Socratic session following the FSM from SRS."""
    INIT = "INIT"
    THESIS = "THESIS"
    OUTLINE = "OUTLINE"
    REVIEW = "REVIEW"


class ChatRole(StrEnum):
    """Role in a chat message."""
    STUDENT = "STUDENT"
    ASSISTANT = "ASSISTANT"


class MessageStatus(StrEnum):
    """Status of an AI-generated message."""
    PENDING = "PENDING"
    VALIDATED = "VALIDATED"
    REJECTED = "REJECTED"
    FALLBACK = "FALLBACK"


class OutlineRevisionStatus(StrEnum):
    """Review status of an outline revision."""
    DRAFT = "DRAFT"
    ACCEPTED = "ACCEPTED"
    SUPERSEDED = "SUPERSEDED"


class OutlineInitStatus(StrEnum):
    """Lifecycle of the one-time AI outline initialization."""

    NONE = "NONE"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    NEEDS_CLARIFICATION = "NEEDS_CLARIFICATION"


class IdempotencyState(StrEnum):
    """State of an idempotency record."""
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class AssignmentRevisionStatus(StrEnum):
    """Status of an assignment revision."""
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    CLOSED = "CLOSED"


class MaterialVersionStatus(StrEnum):
    """Status of a material version."""
    UPLOADED = "UPLOADED"
    PRIVACY_REVIEW = "PRIVACY_REVIEW"
    READY = "READY"
    FAILED = "FAILED"
