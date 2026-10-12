# Hợp đồng dữ liệu

| Thư mục | Nội dung dự kiến |
| --- | --- |
| `openapi/` | Đặc tả HTTP API, endpoint, request, response và lỗi |
| `schemas/` | JSON Schema cho rubric, kết quả OCR/chấm và phân tích lớp |
| `examples/` | Ví dụ JSON hợp lệ, không chứa dữ liệu thật có định danh |

Điểm khởi đầu là các mẫu ở mục 7 của [SRS](../SRS.md). Những mẫu này chưa phải schema thực thi; cần chốt các điểm TBD liên quan trước khi hoàn thiện hợp đồng.

[Thiết kế API MVP](../docs/api/api-design.md) chọn prefix `/api/v1` và camelCase. Mẫu snake_case của SRS cần boundary mapping; kiểu mock trong frontend không được coi là contract chính thức. Backend dùng JSON Schema/Ajv; schema gửi Gemini được chuyển về subset provider hỗ trợ, còn validation local giữ đầy đủ.

Contract cần triển khai gồm rubric, OCR segments/revisions, grading, Socratic turn, writing observations/profile, class analytics và error envelope. `gradeLevel` là khối học; nhãn đánh giá dùng `performanceLevel`. OCR confidence nullable và ghi nguồn; `model-self-report` chưa là xác suất đúng đã hiệu chuẩn. Cấu trúc/version và evidence references ở [data model](../docs/architecture/data-model.md).

Quy ước tên dự kiến: `rubric.schema.json`, `grading-result.schema.json`, `class-analytics.schema.json`; phiên bản hợp đồng phải có chính sách thay đổi rõ ràng trước khi API được sử dụng chính thức.

Schema là nơi xác định hợp đồng chung. Kiểu dữ liệu hoặc validator riêng của frontend/backend phải được sinh từ schema hoặc được kiểm tra tương thích. Kiểm thử hợp đồng dùng `tests/contracts/`.
