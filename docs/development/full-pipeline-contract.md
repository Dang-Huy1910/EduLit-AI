# Full pipeline contract

Tài liệu này là contract API mode cho từng feature của pipeline. Actor luôn lấy từ cookie session; payload không chứa `teacherId`, `studentId`, role hoặc ownership.

## Assignment feature

| Actor | Route | Mục đích |
| --- | --- | --- |
| Teacher | `GET /api/teacher/assignments` | Worklist đề do mình sở hữu và counters tiến độ. |
| Teacher | `POST /api/teacher/assignments` | Tạo DRAFT; server tạo mã đề nếu không truyền `code`. |
| Teacher | `GET/PATCH /api/teacher/assignments/:id` | Xem, sửa DRAFT với `expectedUpdatedAt` để phát hiện stale save. |
| Teacher | `POST /api/teacher/assignments/:id/publish` | DRAFT → PUBLISHED sau validate rubric. |
| Teacher | `POST /api/teacher/assignments/:id/close` | PUBLISHED → CLOSED; không nhận bài mới. |
| Student | `GET /api/assignments`, `GET /api/assignments/:id`, `GET /api/assignments/code/:code` | Chỉ đọc PUBLISHED. |
| Student | `POST /api/assignments/:id/read` | Ghi mốc đã đọc đề/ngữ liệu. |

`rubric.criteria[].weight` là điểm tối đa; tổng weight phải chính xác bằng `maxScore`, mỗi weight theo `scoreStep`. `maxScore`/`scoreStep` là decimal string. Date dùng ISO 8601. Assignment PUBLISHED được xem là immutable để Socratic/submission snapshot nhất quán.

## Các feature sau

- Upload/OCR thêm drafts, pages, mask derivatives, OCR revisions/issues và confirmation; originals/derivatives chỉ stream qua endpoint kiểm quyền.
- Assessment chỉ chạy từ Submission OCR CONFIRMED, tạo `AI_DRAFT`, teacher review thành final rồi PUBLISHED. Evidence dùng UTF-16 `[start,end)` trên đúng `finalText` đã hash.
- Profile extraction tách transaction publish: `PENDING|PROCESSING|COMPLETED|FAILED`, lease/retry bền vững. Chỉ PUBLISHED assessment là nguồn profile; profile không quay vào scoring payload.

Mọi mutation cần Origin hợp lệ, cookie HttpOnly và JSON/multipart content type phù hợp. Lỗi được trả envelope `{ error: { code, message } }`; ownership ẩn tài nguyên bằng 404, stale/revision là 409, payload quá lớn là 413, provider quota/timeout là 429/504.
