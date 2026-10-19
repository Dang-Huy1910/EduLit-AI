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

## Import tài liệu

Nút **Import tài liệu** tại kho. Luồng: tải file (multipart) → lưu nguyên bytes vào PostgreSQL (`teacher_document_blobs`) → MarkItDown (cục bộ, không plugin/LLM) → agent trích xuất → giáo viên rà soát Markdown/form → xác nhận tạo Material / SourcePrompt / Rubric.

Định dạng bản đầu: DOCX, PDF có lớp văn bản, TXT/Markdown, XLSX (bảng barem). PDF scan/không có chữ: giữ file gốc, trạng thái `NEEDS_OCR`, không READY, agent không đoán nội dung. OCR chữ viết tay học sinh chưa có.

File gốc không bị thay bằng Markdown. API danh sách không trả bytes. Tải lại: `GET /api/teacher/documents/{id}/original` (chỉ chủ sở hữu).

Agent tách: ngữ liệu đầy đủ, yêu cầu viết đầy đủ, tóm tắt yêu cầu, ràng buộc, barem nếu có. Tóm tắt không thay yêu cầu đầy đủ. Snapshot bài đã giao dùng `writingTask` đầy đủ; sửa import sau đó không đổi bài đã phát hành. Barem nhập vào kho, chỉ chọn khi tạo bài tập.

Cấu hình: `IMPORT_MAX_BYTES`, `IMPORT_MAX_MARKDOWN_CHARS`, `IMPORT_MIN_TEXT_CHARS`, `IMPORT_CONVERT_TIMEOUT_SECONDS`, `IMPORT_AI_TIMEOUT_SECONDS`, `IMPORT_AI_MAX_OUTPUT_TOKENS` (mặc định 4096, không dùng trần output Socratic 512), `IMPORT_PROMPT_VERSION`. Prompt `prompts/catalog/document-extract.v1.md` được đóng gói khi build.

Vẫn giữ dán văn bản và nhập barem JSON.

## Import barem

Xem [backend/README.md](../../backend/README.md) mục “Import barem JSON” và “Import tài liệu”.

## API (cookie `edulit_session`, CSRF Origin + `X-Edulit-CSRF: 1`)

Giáo viên: `GET/POST /api/teacher/{topics,classrooms,materials,prompts,rubrics,assignments,documents}`; `POST /api/teacher/documents` (multipart); `GET .../documents/{id}/original`; `POST .../documents/{id}/{analyze,draft,confirm}`; `PATCH` ngữ liệu/đề/barem/bài nháp; `POST /api/teacher/assignments/{id}/publish`; `POST .../save-as-rubric`.

Học sinh: `GET /api/assignments` (chỉ bài PUBLISHED được giao); `GET /api/assignments/{id|code}`.

Chạy local: `uv run alembic upgrade head` trên database dev rồi `uv run python scripts/seed_demo.py`. Pytest dùng `DATABASE_URL_TEST` (Alembic upgrade trong fixture, TRUNCATE catalog mỗi test). Không chạy migration/seed/test lên database người dùng.
