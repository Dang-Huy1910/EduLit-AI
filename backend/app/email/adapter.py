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
