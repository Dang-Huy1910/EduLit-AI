"""Services module for EduLit-AI business logic."""

from app.services.socratic_service import (
    AiUnavailableServiceError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    SocraticService,
    SocraticServiceError,
    evaluate_readiness,
)

__all__ = [
    "AiUnavailableServiceError",
    "ConflictError",
    "ForbiddenError",
    "NotFoundError",
    "SocraticService",
    "SocraticServiceError",
    "evaluate_readiness",
]
