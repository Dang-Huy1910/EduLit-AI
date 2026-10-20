"""Chatbot RAG API - Simple question answering based on documents."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator

from app.identity.deps import get_session_context, require_mutation_guards
from app.identity.service import SessionContext
from app.services.chatbot_service import ChatbotService

logger = logging.getLogger("edulit.chatbot_api")

router = APIRouter(
    prefix="/chatbot",
    tags=["chatbot"],
    dependencies=[Depends(require_mutation_guards)],
)

# Load user guide content from markdown file
_USER_GUIDE_PATH = Path(__file__).parent.parent.parent.parent.parent / "docs" / "hướng-dẫn-sử-dụng.md"


def _load_user_guide() -> str:
    """Load user guide from markdown file."""
    try:
        if _USER_GUIDE_PATH.exists():
            content = _USER_GUIDE_PATH.read_text(encoding="utf-8")
            logger.info(f"Loaded user guide from {_USER_GUIDE_PATH}")
            return content
    except Exception as e:
        logger.warning(f"Could not load user guide: {e}")
    return ""


# Load guide at module startup
_USER_GUIDE_CONTENT = _load_user_guide()


# Set the guide content in the service
def _initialize_chatbot_guide() -> None:
    from app.services import chatbot_service
    if _USER_GUIDE_CONTENT:
        chatbot_service.set_user_guide_content(_USER_GUIDE_CONTENT)
        logger.info("Chatbot user guide initialized")


_initialize_chatbot_guide()


class ChatbotRequest(BaseModel):
    """Request body for chatbot API."""
    message: str = Field(min_length=1, max_length=2_000)

    @field_validator("message")
    @classmethod
    def message_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("message must not be blank")
        return value


class ChatbotSource(BaseModel):
    """Source document for a chatbot response."""
    chunk_id: str
    title: str
    material_title: str
    source_name: str


class ChatbotResponse(BaseModel):
    """Response from chatbot API."""
    answer: str
    sources: list[ChatbotSource]


@router.post("", response_model=ChatbotResponse)
async def ask_chatbot(
    request: ChatbotRequest,
    ctx: SessionContext = Depends(get_session_context),
) -> ChatbotResponse:
    """Ask the RAG chatbot a question.

    Returns an answer based on:
    - Teacher's imported materials (for teachers)
    - Materials from assigned lessons (for students)
    - User guide (available to all)
    """
    service = ChatbotService(ctx.db)

    result = await service.answer(
        user=ctx.user,
        question=request.message,
    )

    return ChatbotResponse(
        answer=result.answer,
        sources=[
            ChatbotSource(
                chunk_id=s["chunk_id"],
                title=s["title"],
                material_title=s["material_title"],
                source_name=s["source_name"],
            )
            for s in result.sources
        ],
    )
