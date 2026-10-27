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
    # The local sink uses plaintext SMTP, independent of provider settings
    # inherited from the developer's environment.
    settings = get_settings().model_copy(
        update={
            "SMTP_TLS_MODE": "none",
            "SMTP_USERNAME": "",
            "SMTP_PASSWORD": "",
            "GMAIL_WEBHOOK_URL": "",
            "RESEND_API_KEY": "",
            "BREVO_API_KEY": "",
        }
    )
    adapter = EmailAdapter(settings)
    await adapter.send(
        "sink-probe@students.example.test",
        verification_email("Probe", "http://localhost:3000/verify-email#token=not-a-secret-in-log"),
    )

    import httpx

    ui = os.environ.get("MAILPIT_URL", "http://127.0.0.1:8025")
    async with httpx.AsyncClient(timeout=5.0, trust_env=False) as client:
        res = await client.get(f"{ui}/api/v1/messages")
        assert res.status_code == 200
        data = res.json()
        assert data["total"] >= 1
        subjects = [m.get("Subject") for m in data.get("messages", [])]
        assert any("Xác minh" in (s or "") for s in subjects)


@pytest.mark.asyncio
async def test_register_does_not_include_token_in_http_response(client: AsyncClient) -> None:
    payload = unique_student("smtp2")
    res = await client.post("/api/auth/register", json=payload, headers=auth_headers())
    assert res.status_code == 200
    assert res.json()["status"] == "success"
    assert res.json()["user"]["emailVerified"] is True
    assert "token=" not in res.text
    assert payload["password"] not in res.text
