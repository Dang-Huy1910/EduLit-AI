# Thiết kế HTTP API MVP

Ngày: 12/10/2026. Prefix `/api/v1`, JSON camelCase, cùng origin với frontend. Đây là thiết kế endpoint, chưa có server hoặc OpenAPI thực thi. Mẫu snake_case trong SRS là mẫu nghiệp vụ; boundary mapper sẽ chuyển sang contract camelCase có version, không dùng UI mock types làm domain entities.

## 1. Quy ước

- Session cookie; mọi tài nguyên kiểm tra user/class ownership. GET có pagination khi là danh sách; mặc định 20, tối đa 100, cursor opaque.
- Mutation có CSRF/Origin checks. Các thao tác submit/publish/chat/retry nhận `Idempotency-Key`; record gắn user + route + request hash, trả lại kết quả lưu hoặc trạng thái đang xử lý. Cùng key khác body trả `409`.
- Mutation revision nhận `expectedVersion`; version stale trả `409`. Database transaction là nơi quyết định trạng thái, không tin state gửi từ UI.
- Task nền trả `202 {resourceId, state, statusUrl}`, UI poll có backoff khi pending, dừng khi terminal. Retry cần quyền và input revision còn hợp lệ.
- Error envelope `{error: {code, message, requestId, details?}}`; không trả provider payload/stack trace, khóa storage hoặc secret.
- Mã lỗi chính: `401/403`, `404` theo chính sách tránh lộ tài nguyên, `409 VERSION_CONFLICT`, `422 INVALID_TRANSITION/INVALID_RUBRIC`, `429 RATE_LIMITED`, `503 MODEL_UNAVAILABLE`.

## 2. Endpoint dự kiến

| Method / route | Actor | Hành vi |
| --- | --- | --- |
| `POST /auth/login` | Chưa đăng nhập | Kiểm tra credential, tạo/rotate session cookie |
| `POST /auth/logout` | Đã đăng nhập | Thu hồi session và clear cookie |
| `GET /auth/me` | Đã đăng nhập | User/role và phạm vi lớp được phép |
| `GET /classrooms` | Teacher/student | Chỉ lớp thuộc membership |
| `GET /classrooms/:id/members` | Teacher của lớp | Danh sách học sinh |
| `POST /materials` | Teacher | Multipart file hoặc text; kiểm tra input, tạo draft |
| `POST /materials/:id/privacy-review` | Teacher sở hữu | Rà soát trước nhánh AI/scan |
| `POST /materials/:id/process` | Teacher sở hữu | Enqueue ingestion sau privacy gate, trả 202 |
| `GET /materials` / `GET /materials/:id` | User có quyền | Danh sách/trạng thái/versions được phép |
| `POST /rubrics` | Teacher | Rubric draft nhập trực tiếp hoặc từ ingestion |
| `PATCH /rubrics/:id/draft` | Teacher | Sửa draft với expectedVersion |
| `POST /rubrics/:id/approve` | Teacher | Validate rồi approve revision |
| `POST /assignments` | Teacher | Tạo draft theo classId |
| `PATCH /assignments/:id/draft` | Teacher | Đề/học liệu/rubric/learning goals |
| `POST /assignments/:id/publish` | Teacher | Chốt revision và giao bài |
| `GET /assignments` / `GET /assignments/:id` | Teacher/student | Teacher trong lớp; student thấy đề đã giao |
| `POST /socratic-sessions` | Student | Session theo assignment revision được phép |
| `GET /socratic-sessions/:id` | Student sở hữu | FSM, outline và messages; teacher access cần policy riêng |
| `POST /socratic-sessions/:id/messages` | Student sở hữu | Lượt model, validate, lưu message rồi trả 200 |
| `PUT /socratic-sessions/:id/outline` | Student sở hữu | Lưu outline revision, giữ nguồn ý của học sinh |
| `POST /socratic-sessions/:id/review` | Student sở hữu | Kiểm tra readiness theo policy của đề |
| `POST /assignments/:id/submissions` | Student của lớp | Tạo/lấy submission và draft attempt |
| `POST /submissions/:id/attempts` | Student sở hữu | Nộp lại nếu assignment policy cho phép |
| `POST /attempts/:id/pages` | Student sở hữu | Multipart ảnh đã che/cắt; decode, validate, lưu riêng tư |
| `PUT /attempts/:id/page-order` | Student sở hữu | Sắp trang khi còn draft |
| `POST /attempts/:id/privacy-review` | Teacher của lớp | Kiểm tra ảnh thực; cho phép hoặc yêu cầu mask lại |
| `POST /attempts/:id/submit` | Student sở hữu | Freeze attempt, ghi outbox OCR, trả 202 |
| `GET /attempts/:id` | Student sở hữu / teacher lớp | State, stage, pending/errors |
| `GET /attempts/:id/transcription` | Student sở hữu / teacher lớp | Bản chép và vùng cần review |
| `POST /attempts/:id/ocr-issues` | Student sở hữu | Báo OCR sai tại segment; không sửa bài |
| `POST /attempts/:id/transcription-revisions` | Teacher lớp | Sửa bản chép có lý do, tạo revision |
| `POST /attempts/:id/confirm-transcription` | Teacher lớp | Xác nhận revision, enqueue grading, trả 202 |
| `GET /attempts/:id/assessment` | Student sở hữu / teacher lớp | Student chỉ final published; teacher thấy AI draft |
| `POST /attempts/:id/assessment-review` | Teacher lớp | Final scores/comments, expectedVersion và lý do sửa |
| `POST /attempts/:id/publish-assessment` | Teacher lớp | Publish + chọn current attempt + outbox, idempotent |
| `POST /attempts/:id/withdraw-assessment` | Teacher lớp | Rút kết quả, invalidate derived data |
| `POST /attempts/:id/retry` | Teacher lớp | Retry đúng bước lỗi, không thay input đã freeze |
| `GET /classrooms/:id/reports` | Teacher lớp | SQL metrics, denominator và snapshot time |
| `POST /classrooms/:id/teaching-recommendations` | Teacher lớp | Enqueue gợi ý từ snapshot SQL, trả 202 |
| `GET /students/:id/writing-profile` | Student chính mình / teacher có membership | Goal, observations/evidence, snapshots |
| `PUT /students/:id/declared-goals` | Student chính mình | Mục tiêu/tự đánh giá; không ghi observation AI |
| `GET /files/:id/content` | User có quyền tài nguyên gốc | Stream file riêng tư hoặc URL ký ngắn hạn |

Endpoint cấp tài khoản và quản trị trường thuộc giai đoạn triển khai identity; không mở public self-registration trong thí điểm. Teacher quyền đọc chat của học sinh chưa mặc định có, cần chốt riêng.

## 3. Chat và tác vụ dài

MVP chat dùng request/response toàn bộ output đã kiểm tra, tránh rò rỉ đoạn viết hộ. Nếu thêm SSE, dùng POST với fetch và `Accept: text/event-stream`; chỉ phát trạng thái và message đã duyệt. Các event dự kiến `request.accepted`, `message.generating`, `message.completed`, `request.failed`; không coi trạng thái là TTFT nội dung.

Một session chỉ có một turn đang xử lý; turn reservation/version chống hai lượt đồng thời. Disconnect không tự tạo một turn mới; client đọc lại lịch sử và dùng cùng idempotency key nếu cần. Nếu backend crash khi đang gọi model, retry có thể phát sinh chi phí, phải đối soát usage.

OCR dùng polling GET trạng thái attempt, không giữ HTTP request tới khi xong. Học sinh đối chiếu/sửa/xác nhận bản chép; không có bước giáo viên duyệt OCR. Xác nhận OCR là nộp chính thức và enqueue chấm. GET assessment/báo cáo chỉ đọc, không tạo job. Học sinh `GET /api/assignments/{id}/assessment` chỉ nhận điểm khi đã công bố. Giáo viên: `GET /api/teacher/reports`, `GET /api/teacher/reports/{assignmentId}`, `POST .../insights`, `GET/PATCH .../students/{studentId}/assessment`, `POST .../publish|unpublish|retry|grant-reopen`, `GET .../pages/{pageId}/image`. Mutation CSRF/Origin. Lưu/công bố/ẩn gửi `resultId` + `transcriptionRevisionId` + `expectedVersion`; bản nộp đổi hoặc version lệch → 409, không chuyển sang result khác.

## 4. Contracts cần tạo ở milestone nền tảng

- `contracts/openapi/edulit-v1.yaml`: HTTP requests, states, lỗi và authorization.
- `contracts/schemas/`: rubric, OCR, grading, socratic turn, writing observation/profile, analytics, error envelope.
- `contracts/examples/`: payload giả lập hợp lệ và các lỗi boundary.
- Kiểu client sinh từ OpenAPI; JSON Schema/Ajv validation cả đầu vào và output AI; business tests cho điểm, FSM, revision, scope.

Field `performanceLevel` dùng cho nhãn đánh giá, `gradeLevel` dùng cho khối học. Numeric OCR confidence nullable và phải có source; UI không hiện độ chính xác giả từ mock.
