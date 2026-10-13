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

## Submission/OCR feature

| Actor | Route | Mục đích |
| --- | --- | --- |
| Student | `POST /api/submission-drafts` | Mở/idempotently resume một draft cho đề PUBLISHED; snapshot đề được giữ ở server. |
| Student | `GET /api/submission-drafts/:id` | Xem draft của chính mình, pages/derivative và OCR hiện hành. |
| Student | `POST /api/submission-drafts/:id/pages` | Multipart `file` + `expectedRevision`; JPEG/PNG/WebP, max 4 pages, byte/pixel limits. |
| Student | `PUT/DELETE /api/submission-drafts/:id/pages/:pageId` | Burn mask hoặc xóa page với CAS revision. |
| Student | `PUT /api/submission-drafts/:id/pages/order` | Reorder phải đúng toàn bộ tập page IDs, không trùng. |
| Student | `POST /api/submission-drafts/:id/privacy-review` | DRAFT/PRIVACY_RETURNED → AWAITING_PRIVACY_REVIEW. |
| Teacher owner | `POST /api/teacher/submission-drafts/:id/privacy-review` | Approve → PRIVACY_APPROVED hoặc return → PRIVACY_RETURNED (bắt buộc lý do). |
| Teacher owner | `POST /api/teacher/submission-drafts/:id/ocr` | Claim lease rồi OCR derivative đã approved; success → OCR_REVIEW, lỗi → OCR_FAILED. |
| Student | `POST /api/submission-drafts/:id/ocr-issues` | Tạo báo lỗi, không tự sửa OCR. |
| Teacher owner | `POST /api/teacher/submission-drafts/:id/ocr/correct`, `/confirm` | Tạo revision corrected text rồi CONFIRMED để tạo duy nhất `Submission(source=IMAGE_OCR)`. |

Original và derivative không static/public. `GET /api/files/:fileId` luôn kiểm session: chỉ student chủ draft hoặc teacher chủ assignment. Mask coordinate là normalized `x/y/width/height` và được ghi trực tiếp vào JPEG derivative sau auto-orient/loại EXIF. Thay page/mask/order tăng `revision`; OCR lease token ngăn output muộn ghi vào pages khác.

## Assessment feature

| Actor | Route | Mục đích |
| --- | --- | --- |
| Teacher owner | `GET /api/teacher/assignments/:id/submissions` | Worklist các Submission confirmed và trạng thái đánh giá. |
| Teacher owner | `POST /api/teacher/submissions/:id/assess` | Chỉ grade `IMAGE_OCR` đã CONFIRMED; tạo/replay `AI_DRAFT`. |
| Teacher owner | `POST /api/teacher/assessments/:id/review` | CAS `expectedReviewRevision`, validate rubric/evidence; lưu final riêng nhưng bảo toàn `aiDetailedEvaluations`/`aiTotalScore`. |
| Teacher owner | `POST /api/teacher/assessments/:id/publish` | Xác nhận cuối/idempotent, khóa kết quả. |
| Student owner | `GET /api/submissions/:id` | Trước publish chỉ `{status:PENDING}`; sau publish trả final rubric/evidence. |

Evidence dùng UTF-16 `[start,end)` trên đúng corrected final text đã hash. Chấm không nhận chat, profile, danh tính hoặc bài cũ. Giáo viên khác nhận 404; closed assignment vẫn cho phép chấm/công bố Submission đã confirmed từ trước.

Mọi mutation cần Origin hợp lệ, cookie HttpOnly và JSON/multipart content type phù hợp. Lỗi được trả envelope `{ error: { code, message } }`; ownership ẩn tài nguyên bằng 404, stale/revision là 409, payload quá lớn là 413, provider quota/timeout là 429/504.
