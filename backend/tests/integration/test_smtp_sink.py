from __future__ import annotations

import os

import pytest
from httpx import AsyncClient

from app.config import get_settings
from app.email.adapter import EmailAdapter
from app.email.templates import verification_email
from tests.conftest import auth_headers, unique_student


@pytest.mark.asyncio
async def test_mailpit_receives_verification_email() -> None:
    settings = get_settings()
    adapter = EmailAdapter(settings)
    try:
        await adapter.send(
            "sink-probe@students.example.test",
            verification_email("Probe", "http://localhost:3000/verify-email#token=not-a-secret-in-log"),
        )
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"SMTP sink not available: {type(exc).__name__}")

    import httpx

    ui = os.environ.get("MAILPIT_URL", "http://127.0.0.1:8025")
    async with httpx.AsyncClient(timeout=5.0) as client:
        res = await client.get(f"{ui}/api/v1/messages")
        if res.status_code != 200:
            pytest.skip("Mailpit HTTP API not available")
        data = res.json()
        assert data["total"] >= 1
        subjects = [m.get("Subject") for m in data.get("messages", [])]
        assert any("Xác minh" in (s or "") for s in subjects)


@pytest.mark.asyncio
async def test_register_does_not_include_token_in_http_response(client: AsyncClient) -> None:
    payload = unique_student("smtp2")
    res = await client.post("/api/auth/register", json=payload, headers=auth_headers())
    assert res.status_code == 202
    assert "token=" not in res.text
    assert payload["password"] not in res.text
