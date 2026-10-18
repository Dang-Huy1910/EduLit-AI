from __future__ import annotations

from typing import Any


class DomainError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class ApiHttpException(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        fields: dict[str, str] | None = None,
        retry_after: int | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.fields = fields
        self.retry_after = retry_after


ERROR_MESSAGES: dict[str, str] = {
    "VALIDATION": "Dữ liệu gửi lên không hợp lệ.",
    "JSON_REQUIRED": "Yêu cầu phải gửi JSON.",
    "CSRF_ORIGIN": "Yêu cầu bị từ chối vì nguồn gốc không hợp lệ.",
    "CSRF_HEADER": "Yêu cầu bị từ chối vì thiếu mã chống giả mạo.",
    "AUTH_INVALID": "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
    "AUTH_CREDENTIALS": "Tên đăng nhập hoặc mật khẩu không đúng.",
    "AUTH_UNVERIFIED": "Email chưa được xác minh. Hãy kiểm tra hộp thư hoặc gửi lại email xác minh.",
    "AUTH_RATE_LIMIT": "Bạn thao tác quá nhanh. Vui lòng thử lại sau.",
    "ACCOUNT_INACTIVE": "Tài khoản đã bị vô hiệu hóa.",
    "USERNAME_TAKEN": "Tên đăng nhập đã được sử dụng.",
    "TOKEN_INVALID": "Liên kết không hợp lệ hoặc đã hết hạn.",
    "PASSWORD_MISMATCH": "Mật khẩu hiện tại không đúng.",
    "SESSION_NOT_FOUND": "Không tìm thấy phiên đăng nhập.",
    "NOT_FOUND": "Không tìm thấy tài nguyên.",
    "INTERNAL": "Hệ thống gặp sự cố. Vui lòng thử lại sau.",
    "AI_UNAVAILABLE": "Dịch vụ AI tạm thời không khả dụng. Vui lòng thử lại sau.",
}


def error_body(
    code: str,
    message: str | None = None,
    fields: dict[str, str] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "error": {
            "code": code,
            "message": message or ERROR_MESSAGES.get(code, ERROR_MESSAGES["INTERNAL"]),
        }
    }
    if fields:
        payload["error"]["fields"] = fields
    return payload
