# Luồng giáo viên chuẩn bị và giao bài

Ngày: 19/10/2026. Backend FastAPI + PostgreSQL; UI Next.js nối API thật.

## Khái niệm

| Thuật ngữ | Ý nghĩa |
| --- | --- |
| Ngữ liệu | Văn bản, tác phẩm, trích đoạn và thông tin nguồn |
| Chuyên đề | Nhóm kiến thức, liên kết ngữ liệu/đề nguồn |
| Đề nguồn | Yêu cầu viết gắn với một hoặc nhiều ngữ liệu, tái sử dụng được |
| Bài tập | Một lần giao đề nguồn cho lớp/học sinh, với barem và hạn nộp |

Cùng một đề nguồn có thể giao nhiều lần với barem hoặc hướng dẫn khác nhau.

## Lối vào

- Từ kho: đề sẵn sàng → **Tạo bài tập từ đề này**
- Từ quản lý bài: **Tạo bài tập mới** → `/materials?mode=pick-prompt&classroomId=...` với tiêu đề “Bước 1: Chọn đề để tạo bài tập” và thông báo cố định (không chỉ toast). Nút **Dùng đề này & Tiếp tục**. Lớp đang chọn giữ trong query/sessionStorage.
- `/assignments/new` khi thiếu `promptId` hướng dẫn chọn đề, không dùng đề mẫu mặc định.

## Phát hành

Snapshot đề, ngữ liệu (`context_chunks`) và barem ghi vào `assignment_revisions`. `AssignmentAccess` tạo trong cùng transaction. Sửa kho sau đó không đổi bài đã giao. Retry `POST /publish` không tạo revision/access trùng.

Học sinh chỉ thấy bài `PUBLISHED` có grant còn hiệu lực.

## Hạn nộp và gia hạn

Tạo bài và `PATCH /api/teacher/assignments/{id}/settings` nhận `latePolicy` cạnh `dueAt`. `ALLOW_LATE` (mặc định) cho nộp sau hạn và gắn muộn. `CLOSE_AT_DUE` khoá sau hạn. Snapshot revision ghi `latePolicy` cạnh `dueAt`.

Hạn hiệu lực của một học sinh là mốc trong `assignments.due_extensions` nếu có, ngược lại là `Assignment.due_at`. Bài không có `due_at` thì không muộn và không khoá. Muộn khi `SubmissionAttempt.submitted_at` sau hạn hiệu lực, không khi `official_submitted_at`. Bản viết lại (`revision_round` > 1) không dùng chính sách này và không có nhãn muộn.

`PUT /api/teacher/assignments/{id}/students/{student_id}/due-extension` với `{"dueAt": "<ISO>" | null}` đặt hoặc gỡ hạn riêng. Giáo viên phải sở hữu bài đã giao, học sinh thuộc người nhận, lớp không read-only. Gia hạn là cách duy nhất để nộp sau khi bài đã khoá. `grant-reopen` không mở khoá hạn.

Khi `CLOSE_AT_DUE` đã quá hạn, `upload`/`sửa`/`xóa`/`đổi thứ tự` ảnh nháp, `submit`, `new-attempt` và học sinh tự `reopen` trả `409 SUBMISSION_CLOSED`. Đọc bài, xem ảnh, `retry-ocr`, sửa và xác nhận OCR của ảnh đã nộp trước hạn, và reopen đã được cấp quyền vẫn được.

Trên form, nhãn **Khi hết hạn nộp** có **Cho nộp muộn (gắn nhãn)** và **Khoá khi hết hạn**. Bảng bài nộp có **Gia hạn**, **Gỡ gia hạn** và lọc **Nộp muộn**.

## Viết lại bài

Tạo bài và sửa bài đã giao nhận `maxRevisions` (0–2, mặc định 0) và `revisionDueAt` (`null` là không hạn). Cả hai vào `revision.snapshot`. Form: **Cho phép viết lại sau khi có điểm**, **Số lần viết lại** (**Không** / **1 lần** / **2 lần**) và **Hạn viết lại**. Bài đã giao lưu bằng **Lưu thay đổi**. Giảm `maxRevisions` xuống dưới số bản một học sinh đã bắt đầu thì `409 REVISION_LIMIT_IN_USE`.

Học sinh `POST /api/assignments/{key}/submission/start-revision` sau khi bản hiện tại đang công bố đúng bản chép đã xác nhận, còn lượt, chưa quá `revision_due_at`, lớp không read-only và chưa có bản viết lại dở. Lượt mới tăng `revision_round` và `attempt_number`, không tiêu `reopen_granted_at`, không đổi kết quả đang công bố. Gọi lại khi bản mới đang dở thì trả payload hiện tại. Nút giao diện là **Viết lại bản N** hoặc **Tiếp tục bản N**.

`new-attempt`, `retry-ocr` và `reopen` trong một bản giữ `revision_round`. Quá `revision_due_at` thì `409 REVISION_CLOSED` cho cả bắt đầu lẫn nộp ảnh. **Mở lại bản chép** (`grant-reopen`) chỉ sửa bản chép trong bản hiện tại.

Công bố bản có `revision_round` lớn hơn bản đang công bố thì kết quả cũ nhận `superseded_at` và mục `published_history` có `"reason": "superseded"`. Ẩn thủ công ghi `"reason": "unpublished"` và không đặt `superseded_at`. Công bố lại trong cùng bản giữ cách ghi cũ, không có `reason`. Học sinh vẫn xem bản bị thay; bản ẩn thủ công thì không. Báo cáo và thống kê dùng điểm bản mới nhất đã công bố.

## Import tài liệu

Nút **Import tài liệu** tại kho. Luồng: tải file (multipart) → lưu nguyên bytes vào PostgreSQL (`teacher_document_blobs`) → MarkItDown (cục bộ, không plugin/LLM) → agent trích xuất → giáo viên rà soát Markdown/form → xác nhận tạo Material / SourcePrompt / Rubric.

Định dạng bản đầu: DOCX, PDF có lớp văn bản, TXT/Markdown, XLSX (bảng barem). PDF scan/không có chữ: giữ file gốc, trạng thái `NEEDS_OCR`, không READY, agent không đoán nội dung. Giáo viên bấm nhận dạng thì worker OCR tài liệu chạy; xong vẫn phải rà soát rồi bấm phân tích. OCR chữ viết tay của học sinh là luồng nộp bài riêng.

File gốc không bị thay bằng Markdown. API danh sách không trả bytes. Tải lại: `GET /api/teacher/documents/{id}/original` (chỉ chủ sở hữu).

Agent tách: ngữ liệu đầy đủ, yêu cầu viết đầy đủ, tóm tắt yêu cầu, ràng buộc, barem nếu có. Tóm tắt không thay yêu cầu đầy đủ. Snapshot bài đã giao dùng `writingTask` đầy đủ; sửa import sau đó không đổi bài đã phát hành. Barem nhập vào kho, chỉ chọn khi tạo bài tập.

Cấu hình: `IMPORT_MAX_BYTES`, `IMPORT_MAX_MARKDOWN_CHARS`, `IMPORT_MIN_TEXT_CHARS`, `IMPORT_CONVERT_TIMEOUT_SECONDS`, `IMPORT_AI_TIMEOUT_SECONDS`, `IMPORT_AI_MAX_OUTPUT_TOKENS` (mặc định 4096, không dùng trần output Socratic 512), `IMPORT_PROMPT_VERSION`. Prompt `prompts/catalog/document-extract.v1.md` được đóng gói khi build.

Vẫn giữ dán văn bản và nhập barem JSON.

## Import barem

Xem [backend/README.md](../../backend/README.md) mục “Import barem JSON” và “Import tài liệu”.

## API (cookie `edulit_session`, CSRF Origin + `X-Edulit-CSRF: 1`)

Giáo viên: `GET/POST /api/teacher/{topics,classrooms,materials,prompts,rubrics,assignments,documents}`; `POST /api/teacher/documents` (multipart); `GET .../documents/{id}/original`; `POST .../documents/{id}/{ocr,analyze,draft,confirm}`; `PATCH` ngữ liệu/đề/barem/bài nháp; `POST /api/teacher/assignments/{id}/publish`; `PATCH .../assignments/{id}/settings` (`latePolicy`, `maxRevisions`, `revisionDueAt`); `PUT .../students/{student_id}/due-extension`; `POST .../assessment/grant-reopen`; `POST .../save-as-rubric`.

Học sinh: `GET /api/assignments` (chỉ bài PUBLISHED được giao, kèm `effectiveDueAt` và `isClosed`); `GET /api/assignments/{id|code}`; `POST /api/assignments/{key}/submission/start-revision`.

Chạy local: `uv run alembic upgrade head` trên database dev rồi `uv run python scripts/seed_demo.py`. Pytest dùng `DATABASE_URL_TEST` (Alembic upgrade trong fixture, TRUNCATE catalog mỗi test). Không chạy migration/seed/test lên database người dùng.
