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
    "EMAIL_TAKEN": "Email đã được sử dụng.",
    "TOKEN_INVALID": "Liên kết không hợp lệ hoặc đã hết hạn.",
    "PASSWORD_MISMATCH": "Mật khẩu hiện tại không đúng.",
    "SESSION_NOT_FOUND": "Không tìm thấy phiên đăng nhập.",
    "NOT_FOUND": "Không tìm thấy tài nguyên.",
    "INTERNAL": "Hệ thống gặp sự cố. Vui lòng thử lại sau.",
    "AI_UNAVAILABLE": "Dịch vụ AI tạm thời không khả dụng. Vui lòng thử lại sau.",
    "AI_INVALID_OUTPUT": (
        "Hệ thống chưa soạn được dàn ý hợp lệ từ ngữ liệu lần này. "
        "Em bấm Thử lại; đề và ngữ liệu đã có sẵn, không cần nhập lại."
    ),
    "TEACHER_REQUIRED": "Chỉ giáo viên mới thực hiện được thao tác này.",
    "STUDENT_REQUIRED": "Chỉ học sinh mới thực hiện được thao tác này.",
    "ACCESS_DENIED": "Thầy/cô không có quyền với tài nguyên này.",
    "PROMPT_INCOMPLETE": "Đề nguồn chưa đủ dữ liệu để tạo bài tập.",
    "PROMPT_REQUIRED": "Cần chọn đề nguồn trước khi tạo bài tập.",
    "ASSIGNMENT_STATUS": "Trạng thái bài tập không cho phép thao tác này.",
    "NEED_RECIPIENTS": "Cần chọn lớp hoặc học sinh nhận bài trước khi giao.",
    "RUBRIC_SHAPE": "Định dạng barem không hợp lệ.",
    "RUBRIC_WEIGHT_SUM": "Tổng điểm các tiêu chí phải bằng thang điểm của barem.",
    "IMPORT_TYPE": "Định dạng file không được hỗ trợ. Dùng DOCX, PDF có chữ, TXT/Markdown hoặc XLSX.",
    "IMPORT_TOO_LARGE": "File vượt quá dung lượng cho phép.",
    "IMPORT_NEEDS_OCR": "PDF không có lớp văn bản đọc được. Giữ file gốc; thầy/cô hãy dùng bản chữ hoặc OCR sau.",
    "IMPORT_STALE": "Phiên phân tích không khớp bản Markdown hiện tại. Hãy phân tích lại.",
    "IMPORT_NOT_READY": "Tài liệu chưa sẵn sàng để lưu vào kho.",
    "IMPORT_TIMEOUT": "Chuyển Markdown quá thời gian. File gốc vẫn còn.",
    "SUBMISSION_IMAGE_TYPE": "Chỉ nhận ảnh JPEG hoặc PNG thật.",
    "SUBMISSION_IMAGE_SIZE": "Ảnh vượt quá dung lượng hoặc kích thước cho phép.",
    "SUBMISSION_PAGE_LIMIT": "Mỗi bài nộp từ 1 đến 4 trang ảnh.",
    "SUBMISSION_NOT_DRAFT": "Bộ ảnh đã nộp. Hãy tạo lượt mới nếu muốn thay ảnh.",
    "SUBMISSION_EMPTY": "Cần ít nhất một trang ảnh trước khi nộp.",
    "OCR_IN_PROGRESS": "Bài đang được số hóa. Em chờ kết quả rồi đối chiếu.",
    "REVISION_CONFLICT": "Bản chép đã được sửa ở tab khác. Hãy tải lại rồi lưu.",
    "OCR_NOT_READY": "Bản chép chưa sẵn sàng để xác nhận.",
    "TRANSCRIPTION_LOCKED": "Bài đã công bố. Em cần giáo viên mở lại quyền sửa bản chép.",
    "ASSESSMENT_NOT_READY": "Bài chưa có kết quả chấm để rà soát.",
    "ASSESSMENT_FAILED": "Lượt chấm không thành công. Giáo viên có thể thử lại.",
    "ASSESSMENT_STALE": "Kết quả không còn khớp bản nộp chính thức hiện hành.",
    "VERSION_CONFLICT": "Kết quả đã được sửa ở tab khác. Hãy tải lại rồi lưu.",
    "PUBLISH_STALE": "Không công bố được kết quả của bản nộp cũ. Hãy chấm bản hiện hành.",
    "INSIGHT_NO_DATA": "Chưa có kết quả hợp lệ để phân tích. Hãy chấm bài trước.",
    "STATS_MODE": "Chế độ thống kê không hợp lệ. Dùng tạm tính hoặc chính thức.",
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
