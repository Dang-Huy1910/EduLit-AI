# Hợp đồng dữ liệu

Đây là **chỗ dành sẵn cho M6, chưa có nội dung thực thi**: chưa có file OpenAPI xuất riêng, JSON Schema hoặc ví dụ contract được kiểm bằng runner.

| Thư mục | Nội dung dự kiến |
| --- | --- |
| `openapi/` | Đặc tả HTTP xuất/đồng bộ từ API hiện có |
| `schemas/` | Schema rubric, OCR/chấm, Socratic, profile và báo cáo |
| `examples/` | Payload minh họa hợp lệ/lỗi, không có dữ liệu thật có định danh |

API thực đã chạy trên FastAPI với prefix `/api`, lỗi `{error: {code, message, fields?}}`. Swagger ở `/docs` ngoài production và OpenAPI runtime ở `/openapi.json`; nhiều payload camelCase, riêng một số như nguồn chatbot dùng snake_case. Schema Pydantic/validator Python hiện nằm trong backend; client TypeScript theo feature, chưa sinh tự động từ thư mục này.

Khi thực hiện M6, đối chiếu [API hiện có](../docs/api/api-design.md), [data model](../docs/architecture/data-model.md) và mẫu nghiệp vụ [SRS](../SRS.md), chốt version rồi thêm spec/schema/ví dụ cùng kiểm thử tương thích. Không coi các tên schema dự kiến là file đang tồn tại. Kế hoạch ở [roadmap](../docs/development/implementation-roadmap.md).
