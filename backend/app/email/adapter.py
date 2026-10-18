from __future__ import annotations

import asyncio
import logging
from email.message import EmailMessage as MimeEmail

import aiosmtplib

from app.config import Settings
from app.email.templates import EmailMessage

logger = logging.getLogger("edulit.email")


class EmailAdapter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def send(self, to_address: str, message: EmailMessage) -> None:
        logger.info(
            "EMAIL_OUTBOX to=%s subject='%s'\nBody:\n%s",
            to_address,
            message.subject,
            message.text_body,
        )

        if self.settings.RESEND_API_KEY:
            try:
                import httpx
                resend_from = "EduLit-AI <onboarding@resend.dev>"
                if (
                    self.settings.SMTP_FROM
                    and "@gmail.com" not in self.settings.SMTP_FROM
                    and "localhost" not in self.settings.SMTP_FROM
                ):
                    resend_from = self.settings.SMTP_FROM

                async with httpx.AsyncClient(timeout=8.0) as client:
                    res = await client.post(
                        "https://api.resend.com/emails",
                        headers={"Authorization": f"Bearer {self.settings.RESEND_API_KEY}"},
                        json={
                            "from": resend_from,
                            "to": [to_address],
                            "subject": message.subject,
                            "html": message.html_body,
                            "text": message.text_body,
                        },
                    )
                    if res.status_code in (200, 201):
                        logger.info("email_sent_via_resend to=%s", to_address)
                        return
                    logger.warning("resend_send_failed status=%s response=%s", res.status_code, res.text)
            except Exception:
                logger.exception("resend_exception to=%s", to_address)

        if self.settings.BREVO_API_KEY:
            try:
                from email.utils import parseaddr
                import httpx
                sender_name, sender_email = parseaddr(self.settings.SMTP_FROM)
                async with httpx.AsyncClient(timeout=8.0) as client:
                    res = await client.post(
                        "https://api.brevo.com/v3/smtp/email",
                        headers={
                            "api-key": self.settings.BREVO_API_KEY,
                            "Content-Type": "application/json",
                            "Accept": "application/json",
                        },
                        json={
                            "sender": {
                                "name": sender_name or "EduLit-AI",
                                "email": sender_email or self.settings.SMTP_USERNAME or "noreply@edulit.ai",
                            },
                            "to": [{"email": to_address}],
                            "subject": message.subject,
                            "htmlContent": message.html_body,
                            "textContent": message.text_body,
                        },
                    )
                    if res.status_code in (200, 201):
                        logger.info("email_sent_via_brevo to=%s", to_address)
                        return
                    logger.warning("brevo_send_failed status=%s response=%s", res.status_code, res.text)
            except Exception:
                logger.exception("brevo_exception to=%s", to_address)

        mime = MimeEmail()
        mime["From"] = self.settings.SMTP_FROM
        mime["To"] = to_address
        mime["Subject"] = message.subject
        mime.set_content(message.text_body)
        mime.add_alternative(message.html_body, subtype="html")

        last_error: Exception | None = None
        attempts = max(1, self.settings.SMTP_RETRIES + 1)
        for attempt in range(attempts):
            try:
                await self._send_once(mime)
                logger.info(
                    "email_sent purpose_subject_len=%s to_domain=%s",
                    len(message.subject),
                    to_address.split("@")[-1] if "@" in to_address else "unknown",
                )
                return
            except Exception as exc:  # noqa: BLE001 — logged, retried, then raised
                last_error = exc
                logger.warning(
                    "email_send_failed attempt=%s/%s error_type=%s",
                    attempt + 1,
                    attempts,
                    type(exc).__name__,
                )
                if attempt + 1 < attempts:
                    await asyncio.sleep(0.4 * (attempt + 1))
        assert last_error is not None
        raise last_error

    async def _send_once(self, mime: MimeEmail) -> None:
        timeout = self.settings.SMTP_TIMEOUT_SECONDS
        use_tls = self.settings.SMTP_TLS_MODE == "tls"
        start_tls = self.settings.SMTP_TLS_MODE == "starttls"
        username = self.settings.SMTP_USERNAME or None
        password = self.settings.SMTP_PASSWORD or None
        await aiosmtplib.send(
            mime,
            hostname=self.settings.SMTP_HOST,
            port=self.settings.SMTP_PORT,
            username=username,
            password=password,
            use_tls=use_tls,
            start_tls=start_tls,
            timeout=timeout,
        )
