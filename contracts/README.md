# Hợp đồng dữ liệu

| Thư mục | Nội dung dự kiến |
| --- | --- |
| `openapi/` | Đặc tả HTTP API, endpoint, request, response và lỗi |
| `schemas/` | JSON Schema cho rubric, kết quả OCR/chấm và phân tích lớp |
| `examples/` | Ví dụ JSON hợp lệ, không chứa dữ liệu thật có định danh |

Điểm khởi đầu là các mẫu ở mục 7 của [SRS](../SRS.md). Những mẫu này chưa phải schema thực thi; cần chốt các điểm TBD liên quan trước khi hoàn thiện hợp đồng.

Quy ước tên dự kiến: `rubric.schema.json`, `grading-result.schema.json`, `class-analytics.schema.json`; phiên bản hợp đồng phải có chính sách thay đổi rõ ràng trước khi API được sử dụng chính thức.

Schema là nơi xác định hợp đồng chung. Kiểu dữ liệu hoặc validator riêng của frontend/backend phải được sinh từ schema hoặc được kiểm tra tương thích. Kiểm thử hợp đồng dùng `tests/contracts/`.
