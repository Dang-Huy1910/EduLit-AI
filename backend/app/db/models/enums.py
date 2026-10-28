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


class OutlinePrepStatus(StrEnum):
    """Per-student durable outline-prep job."""

    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    READY = "READY"
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


class SubmissionAttemptState(StrEnum):
    """Student handwritten submission attempt."""

    DRAFT = "DRAFT"
    QUEUED = "QUEUED"
    OCR_PROCESSING = "OCR_PROCESSING"
    OCR_REVIEW = "OCR_REVIEW"
    FAILED = "FAILED"
    READY_TO_GRADE = "READY_TO_GRADE"


class OcrJobStatus(StrEnum):
    """Durable OCR job attached to a frozen attempt."""

    NONE = "NONE"
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"


class TranscriptionRevisionStatus(StrEnum):
    """Student-owned transcription lifecycle."""

    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"
    SUPERSEDED = "SUPERSEDED"


class PageBlobKind(StrEnum):
    ORIGINAL = "ORIGINAL"
    PROCESSED = "PROCESSED"


class AssessmentJobStatus(StrEnum):
    """Durable rubric-grading job, separate from OCR state."""

    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"


class ClassInsightStatus(StrEnum):
    """Durable class-level teaching insight job."""

    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"
