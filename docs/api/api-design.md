# HTTP API hiện có và thiết kế còn lại

Rà lại **2026-10-28** theo `backend/app/main.py`, `app/identity/router.py` và `app/api/routers/*.py`. Prefix nghiệp vụ là **`/api`**. FastAPI đã có server và OpenAPI runtime (`/openapi.json`, Swagger `/docs` ngoài production); `contracts/openapi/` chưa có file đặc tả xuất riêng.

## 1. Quy ước đang thực thi

- Cookie phiên HttpOnly; mỗi router/service kiểm tra role, owner và quyền tài nguyên. `GET /api/health` trả `{ok: true}` không cần phiên.
- Mutation kiểm tra Origin theo Settings và header `X-Edulit-CSRF: 1`. JSON dùng `Content-Type: application/json`, upload dùng multipart. Client gửi `credentials: include`.
- Nhiều payload nghiệp vụ dùng camelCase; không có mapper camelCase chung cho mọi route. Ví dụ chatbot sources dùng `chunk_id`, `material_title`, `source_name`.
- Lỗi theo **`{error: {code, message, fields?}}`** từ `core/errors.py`; `fields` là map tên trường → thông báo và chỉ xuất hiện khi có lỗi trường. Không có `requestId`/`details` trong envelope.
- Ví dụ mã lỗi thực: `400 VALIDATION`, `401 AUTH_INVALID`, `403 TEACHER_REQUIRED/STUDENT_REQUIRED`, `404 NOT_FOUND`, `409 VERSION_CONFLICT/REVISION_CONFLICT/ASSESSMENT_STALE`, `429 AUTH_RATE_LIMIT`, `503 AI_UNAVAILABLE`. Tên/mã cụ thể phụ thuộc service, không dùng chung `422 INVALID_RUBRIC` như thiết kế cũ.
- `Idempotency-Key` được dùng cho POST message Socratic; không khẳng định mọi submit/publish/retry đều nhận header này. Outline dùng `expectedVersion`; mutation assessment kiểm `resultId` + `transcriptionRevisionId` + `expectedVersion`.
- Không có pagination/cursor hoặc mẫu `202 {resourceId,state,statusUrl}` dùng chung. Route submission/OCR hiện trả HTTP 200 với payload trạng thái; register/login cũng 200, forgot-password/resend-verification 202. API tạo tài nguyên catalog/bài tập/session thường dùng 201 theo decorator.

## 2. Endpoint đã có

Mọi dòng trong các bảng sau là route **đã có**, đối chiếu decorator và `include_router`; không đồng nghĩa đã nghiệm thu trên môi trường triển khai. Các tham số `{...}` là path params; tên `assignment_key` được giữ theo router.

### Identity — `app/identity/router.py`

| Method | Đường dẫn | Hành vi |
| --- | --- | --- |
| POST | `/api/auth/register` | Gán STUDENT, đánh dấu email đã xác minh, trả user và cookie phiên ngay |
| POST | `/api/auth/login` | Credential + cookie phiên |
| GET | `/api/auth/me` | PublicUser |
| POST | `/api/auth/logout` | Thu hồi phiên hiện tại |
| POST | `/api/auth/verify-email` | Xử lý token xác minh; vẫn giữ endpoint |
| POST | `/api/auth/resend-verification` | Gửi lại cho tài khoản phù hợp, phản hồi trung tính |
| POST | `/api/auth/forgot-password` | Yêu cầu khôi phục mật khẩu |
| POST | `/api/auth/reset-password` | Token và mật khẩu mới |
| POST | `/api/auth/change-password` | Đổi mật khẩu, thu hồi phiên |
| GET | `/api/auth/sessions` | Danh sách phiên |
| DELETE | `/api/auth/sessions/{session_id}` | Thu hồi một phiên |
| POST | `/api/auth/logout-all` | Thu hồi toàn bộ phiên |

Không có đăng ký giáo viên công khai; giáo viên do CLI bootstrap. Chính sách đăng ký ở [ADR-0002](../architecture/decisions/0002-python-auth.md).

### Lớp — `classrooms.py`

| Method | Đường dẫn | Hành vi |
| --- | --- | --- |
| GET | `/api/terms` | Học kỳ |
| GET, POST | `/api/teacher/classrooms` | Danh sách/tạo lớp |
| GET, PATCH | `/api/teacher/classrooms/{classroom_id}` | Chi tiết gồm thành viên/cập nhật lớp |
| POST | `/api/teacher/classrooms/{classroom_id}/join-code/rotate` | Đổi mã tham gia |
| DELETE | `/api/teacher/classrooms/{classroom_id}/members/{user_id}` | Bỏ thành viên |
| GET | `/api/student/classrooms` | Lớp của học sinh |
| POST | `/api/student/classrooms/join` | Tham gia bằng mã |

### Catalog và import — `catalog.py`

| Method | Đường dẫn | Hành vi |
| --- | --- | --- |
| GET, POST | `/api/teacher/topics` | Chuyên đề |
| GET, POST | `/api/teacher/materials` | Danh sách/tạo ngữ liệu JSON |
| GET, PATCH | `/api/teacher/materials/{material_id}` | Đọc/sửa ngữ liệu |
| GET, POST | `/api/teacher/prompts` | Đề nguồn |
| GET, PATCH, DELETE | `/api/teacher/prompts/{prompt_id}` | Đọc/sửa/xóa đề nguồn |
| GET, POST | `/api/teacher/rubrics` | Danh sách/tạo barem đã validate |
| GET, PATCH | `/api/teacher/rubrics/{rubric_id}` | Đọc/sửa barem |
| GET, POST | `/api/teacher/documents` | Danh sách/upload multipart field `file` |
| GET | `/api/teacher/documents/{document_id}` | File metadata, Markdown, trạng thái và draft |
| GET | `/api/teacher/documents/{document_id}/original` | Bytes gốc có kiểm tra quyền |
| POST | `/api/teacher/documents/{document_id}/analyze` | Phân tích Markdown qua AI |
| POST | `/api/teacher/documents/{document_id}/draft` | Lưu bản giáo viên rà soát |
| POST | `/api/teacher/documents/{document_id}/confirm` | Confirm mục chọn vào catalog |
| GET | `/api/student/materials` | Ngữ liệu học sinh có quyền |
| GET | `/api/student/materials/{material_id}` | Chi tiết ngữ liệu có quyền |

Upload import chuyển Markdown và phân tích trong service của request, chưa có worker ingestion riêng. PDF scan giữ file gốc và trạng thái `NEEDS_OCR`.

### Giao bài — `assignments.py`

| Method | Đường dẫn | Hành vi |
| --- | --- | --- |
| GET, POST | `/api/teacher/assignments` | Danh sách/tạo draft |
| GET, PATCH, DELETE | `/api/teacher/assignments/{assignment_id}` | Đọc/sửa draft/xóa theo điều kiện service |
| PATCH | `/api/teacher/assignments/{assignment_id}/settings` | Sửa trường được phép của bài đã giao |
| POST | `/api/teacher/assignments/{assignment_id}/publish` | Snapshot revision và cấp quyền |
| POST | `/api/teacher/assignments/{assignment_id}/outline-prep/retry` | Thử lại chuẩn bị dàn ý |
| POST | `/api/teacher/assignments/{assignment_id}/save-as-rubric` | Lưu barem bài tập vào kho |
| GET | `/api/assignments` | Danh sách theo vai trò/quyền |
| GET | `/api/assignments/{assignment_key}` | Chi tiết bài tập có quyền |

### Socratic — `socratic.py`

| Method | Đường dẫn | Hành vi |
| --- | --- | --- |
| POST, GET | `/api/socratic-sessions` | Tạo session bằng assignmentCode/danh sách còn quyền |
| GET | `/api/socratic-sessions/by-assignment` | Query `assignmentCode`, tìm session |
| GET | `/api/socratic-sessions/{session_id}` | Trạng thái, outline/readiness |
| GET, POST | `/api/socratic-sessions/{session_id}/messages` | Lịch sử/gửi turn với Idempotency-Key |
| GET, PUT | `/api/socratic-sessions/{session_id}/outline` | Đọc/lưu outline, expectedVersion |
| GET, POST | `/api/socratic-sessions/{session_id}/outline-init` | Trạng thái/khởi tạo hoặc retry dàn ý |
| POST | `/api/socratic-sessions/{session_id}/review` | Review revision hiện hành |

### Bài nộp/OCR — `submissions.py`

| Method | Đường dẫn | Hành vi |
| --- | --- | --- |
| GET | `/api/assignments/{assignment_key}/submission` | Payload bài nộp hiện hành |
| POST, DELETE | `/api/assignments/{assignment_key}/submission/pages` | Upload ảnh/xóa mọi trang nháp |
| PATCH, DELETE | `/api/assignments/{assignment_key}/submission/pages/{page_id}` | Cập nhật/xóa trang nháp |
| POST | `/api/assignments/{assignment_key}/submission/pages/{page_id}/replace` | Thay bytes ảnh multipart |
| GET | `/api/assignments/{assignment_key}/submission/pages/{page_id}/image` | Đọc ảnh có quyền |
| POST | `/api/assignments/{assignment_key}/submission/reorder` | Đổi thứ tự trang |
| POST | `/api/assignments/{assignment_key}/submission/submit` | Đóng băng attempt, xếp OCR |
| POST | `/api/assignments/{assignment_key}/submission/retry-ocr` | Thử lại OCR |
| POST | `/api/assignments/{assignment_key}/submission/new-attempt` | Tạo lượt mới nếu được phép |
| GET | `/api/assignments/{assignment_key}/ocr` | Bản chép và trạng thái |
| PATCH | `/api/assignments/{assignment_key}/ocr/segments` | Học sinh sửa segments với kiểm tra revision |
| POST | `/api/assignments/{assignment_key}/ocr/confirm` | Học sinh xác nhận/nộp chính thức, xếp chấm |
| POST | `/api/assignments/{assignment_key}/ocr/reopen` | Mở lại theo quyền; bản từng công bố cần grant |

### Chấm/báo cáo — `assessments.py`

| Method | Đường dẫn | Hành vi |
| --- | --- | --- |
| GET | `/api/assignments/{assignment_key}/assessment` | Học sinh chỉ thấy điểm đã công bố |
| GET | `/api/teacher/reports` | Danh sách bài cho báo cáo |
| GET | `/api/teacher/reports/{assignment_id}` | Thống kê theo bài, mode provisional/official |
| POST | `/api/teacher/reports/{assignment_id}/insights` | Xếp gợi ý dạy học |
| GET | `/api/teacher/competency-reports` | Báo cáo nhiều bài theo bộ lọc |
| POST | `/api/teacher/competency-reports/insights` | Xếp gợi ý nhiều bài |
| GET, PATCH | `/api/teacher/assignments/{assignment_id}/students/{student_id}/assessment` | Đọc/lưu rà soát |
| POST | `/api/teacher/assignments/{assignment_id}/students/{student_id}/assessment/publish` | Công bố với kiểm tra result/revision/version |
| POST | `/api/teacher/assignments/{assignment_id}/students/{student_id}/assessment/unpublish` | Ẩn kết quả với kiểm tra version |
| POST | `/api/teacher/assignments/{assignment_id}/students/{student_id}/assessment/retry` | Thử lại chấm |
| POST | `/api/teacher/assignments/{assignment_id}/students/{student_id}/assessment/grant-reopen` | Cấp quyền mở lại bản chép |
| GET | `/api/teacher/assignments/{assignment_id}/students/{student_id}/pages/{page_id}/image` | Giáo viên xem ảnh có quyền |

GET báo cáo chỉ đọc; POST insights xếp job/cache theo dữ liệu đầu vào, assessment worker xử lý. Học sinh xác nhận OCR, giáo viên rà soát điểm. Các mutation không được tự chuyển sang result khác khi request đang cầm bản cũ.

### Chatbot và hồ sơ viết — `chatbot.py`, `writing_profile.py`

| Method | Đường dẫn | Hành vi |
| --- | --- | --- |
| POST | `/api/chatbot` | Hỏi đáp chunks có quyền + hướng dẫn sử dụng; `{answer,sources}` |
| GET | `/api/student/writing-profile` | Đọc profile/cache của mình |
| POST | `/api/student/writing-profile/refresh` | Yêu cầu cập nhật profile |
| GET | `/api/teacher/classrooms/{classroom_id}/students/{student_id}/writing-profile` | Giáo viên lớp xem profile, chỉ đọc |

Student profile và refresh còn nhận dạng có dấu `/` cuối theo decorator. Đây không phải endpoint khai báo mục tiêu tự đánh giá.

## 3. Endpoint/contract còn là thiết kế

Các route sau **chưa có**, không được gọi như API đang chạy:

| Thiết kế cũ | Thực trạng / hướng tiếp |
| --- | --- |
| Prefix `/api/v1` | Chưa mount; prefix thực là `/api` |
| `/api/classrooms`, `/api/classrooms/{id}/members` | Dùng route teacher/student trong bảng trên, không có route chung này |
| `/api/materials/{id}/privacy-review`, `/api/materials/{id}/process` | Chưa có privacy gate/process endpoint; import thực ở `/api/teacher/documents` |
| `/api/rubrics/{id}/draft`, `/api/rubrics/{id}/approve` | Chưa có; tạo/sửa barem qua teacher catalog và validator |
| `/api/assignments/{id}/draft`, `POST /api/assignments/{id}/submissions` | Route thiết kế; draft thực qua teacher assignments, submission dùng số ít như bảng |
| `/api/submissions/{id}/attempts`, `/api/attempts/{id}/...` | Chưa có nhóm route này; dùng assignment-key scoped submission/OCR |
| Privacy-review, OCR issues, giáo viên confirm transcription | Chưa có; học sinh trực tiếp sửa/xác nhận OCR |
| `/api/classrooms/{id}/reports`, `/api/classrooms/{id}/teaching-recommendations` | Chưa có; báo cáo/insight thực ở teacher reports/competency-reports |
| `/api/students/{id}/writing-profile`, `/api/students/{id}/declared-goals` | Chưa có; profile thực có route student/teacher ở trên, survey chưa triển khai |
| `/api/files/{id}/content` | Chưa có endpoint file chung; tải gốc/ảnh qua route tài nguyên có quyền |
| SSE và contract client sinh tự động | Chưa có; chat hiện request/response, client TypeScript viết theo feature |

`contracts/{openapi,schemas,examples}/` dành sẵn cho **M6**, chưa có spec/schema/ví dụ thực thi. Hợp đồng HTTP/Pydantic và validator AI hiện nằm trong backend; việc xuất/đồng bộ schema và kiểm thử contract là bước tiếp theo. Xem [roadmap](../development/implementation-roadmap.md), [data model](../architecture/data-model.md), [pipeline AI](../architecture/gemini-pipeline.md).
