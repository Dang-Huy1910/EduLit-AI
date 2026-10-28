# Lộ trình triển khai và kiểm chứng MVP

Rà lại **2026-10-28** theo `backend/app/main.py`, router/service/worker, models, migration `0001`–`0019`, frontend App Router và CI. Stack hiện tại được ghi ở [ADR-0004](../architecture/decisions/0004-python-monolith.md), thay thiết kế NestJS ban đầu. “Đã có” bên dưới là đã có code Python/giao diện tương ứng, không phải xác nhận đạt chất lượng hay đã triển khai production.

## M0 — Điều kiện và chính sách: đã có một phần, còn kiểm chứng

**Đã có:** cấu hình `AI_PROVIDER`/`AI_MODEL`, adapter openai/gemini/fake; học sinh sửa/xác nhận OCR rồi nộp chính thức; giáo viên rà soát/công bố/ẩn, cấp quyền mở lại bài từng công bố; barem có max score/score step.

**Còn lại:** smoke test provider/model trên project triển khai, quota/chi phí, quyền riêng tư/retention, dataset được phép dùng và ngưỡng đồng thuận giáo viên. Không có số đo chất lượng để kết luận model đạt thí điểm.

## M1 — Nền tảng và dữ liệu: đã có bản Python, còn contract/vận hành

**Đã có:** Python 3.12/FastAPI, SQLAlchemy async/PostgreSQL, Alembic tới `0019`, cookie session/Argon2id, role/owner/membership, CSRF/Origin, rate limit, Compose và CI. Các router nghiệp vụ cùng prefix `/api`. Ba worker claim/lease có helper chung; profile có sweep riêng trong API.

Frontend dùng fetch client và Zustand theo feature; store chung bỏ dữ liệu prototype, chỉ persist sidebar. Seed lớp/ảnh đã chuyển sang `backend/demo/`, Dockerfile copy nguồn mới.

**Còn lại:** spec OpenAPI xuất riêng, bộ contract đồng bộ client ở M6; request correlation, usage reservation/audit chung và vận hành nhiều replica nếu cần. Không có Prisma/pg-boss/outbox/TanStack Query trong bản đang chạy.

## M2 — Học liệu, rubric và giao bài: đã có bản Python

**Đã có:** catalog chuyên đề/ngữ liệu/đề nguồn/barem; import DOCX/PDF có chữ/XLSX/TXT/Markdown qua MarkItDown, phân tích AI, giáo viên sửa/confirm; draft/publish bài tập, snapshot đề/barem/ngữ liệu, quyền theo người nhận, outline-prep và sửa settings bài đã giao. Giao diện đọc trạng thái backend. Ánh xạ FR-01–FR-05.

**Còn lại:** privacy gate tự động được kiểm chứng, OCR PDF scan nhập kho (`NEEDS_OCR` hiện chỉ giữ bản gốc), worker ingestion bền vững nếu cần. Không có endpoint approve rubric/privacy-review riêng như thiết kế cũ.

## M3 — Socratic và hỏi đáp: đã có bản Python

**Đã có:** session/messages/outline/FSM/readiness, LangGraph pre/post guardrail, provider cấu hình, reservation và idempotency turn, kiểm version outline, dàn ý chuẩn bị nền. Chat trả toàn bộ nội dung sau kiểm tra. Chatbot `/api/chatbot` tìm từ khóa trên nguồn có quyền và hướng dẫn sử dụng. Ánh xạ FR-06–FR-10, BR-01–BR-04.

**Còn lại:** evaluation viết hộ/prompt injection/nguồn, chất lượng gợi mở và độ trễ thực tế. Streaming/SSE và semantic retrieval chưa có; chỉ bổ sung khi có nhu cầu/đánh giá riêng.

## M4 — OCR rồi chấm rubric: đã có bản Python

**Đã có:** upload 1–4 trang và công cụ tự che vùng riêng tư, attempt/ảnh riêng tư trong PostgreSQL, OCR job/lease/retry, transcription revisions. Học sinh sửa/xác nhận; `submitted_at` và `official_submitted_at` tách nhau, xác nhận xếp chấm đúng revision.

Assessment worker xử lý job bền vững trong API; GET không xếp chấm. Đề/barem dùng snapshot, kết quả AI/teacher/published tách riêng. Lưu/công bố/ẩn kiểm tra `resultId`, `transcriptionRevisionId`, `expectedVersion`; học sinh xem điểm sau công bố. Bản từng công bố cần grant mở lại, ẩn điểm không tự cấp quyền. Ánh xạ FR-11–FR-17.

**Còn lại:** CER/WER, độ đúng bằng chứng/điểm trên bài thực, privacy/hiệu năng và thử phục hồi lỗi trong môi trường thí điểm. Không coi demo seed là báo cáo chất lượng.

## M5 — Báo cáo và hồ sơ viết: đã có bản Python

**Đã có:** trang chi tiết bài tập tách với báo cáo năng lực nhiều bài; số liệu backend từ PostgreSQL theo mode `provisional`/`official`, quy thang điểm 10, tách số học sinh/số lỗi và mẫu số. POST insight tạo job/cache theo hash dữ liệu, GET không gọi AI. Ánh xạ FR-18–FR-21.

Hồ sơ văn phong cũng đã có: GET cache, POST refresh, observations/evidence trong payload từ bài đã công bố, source hash, history version và UI tiến bộ. Worker tự tạo hồ sơ đầu tiên; các cập nhật sau do học sinh yêu cầu. Profile không dùng để chấm.

**Còn lại:** goal survey/bảng observation độc lập của thiết kế cũ chưa có; cần evaluation profile, tính hữu ích của insight và kiểm chứng số liệu với giáo viên.

## M6 — Contracts, đánh giá và thí điểm: còn mở

`contracts/` và `evaluations/` được giữ làm chỗ dành sẵn, **chưa có nội dung thực thi**. Cần:

- Xuất/đồng bộ HTTP spec/schema/ví dụ và bộ kiểm contract; đối chiếu API thực trong [API design](../api/api-design.md).
- Dataset có quyền sử dụng, bản chép/điểm chuẩn, tách tune/holdout; báo cáo OCR, chấm, Socratic và profile.
- Đo p50/p95, queue/provider/review wait theo điều kiện tải cụ thể; làm rõ phạm vi NFR-03/04.
- CI hiện đã có Ruff/pytest, ESLint/typecheck/Node tests; còn contracts, kiểm chứng HTTPS/cookie/email thật, backup/restore, retention/cleanup và quota/chi phí trong môi trường triển khai.
- Triển khai staging và thí điểm sau khi có kết quả quality gate/chính sách được chốt. Compose local chưa là cấu hình production đã nghiệm thu.

## Chuyển frontend từng phần

| Phần | Trạng thái hiện tại |
| --- | --- |
| Đăng nhập/đăng ký | API session thật; đăng ký học sinh được đánh dấu email xác minh và cấp phiên ngay |
| Assignments/materials | API theo feature; store chung không còn persist dữ liệu nghiệp vụ |
| Chat/outline | Scope student/session/revision, lưu backend, kiểm idempotency/version |
| Nộp ảnh/che vùng riêng tư | Ảnh xuất từ UI và upload thật; người dùng tự rà soát |
| OCR | Worker và bản chép thật, học sinh đối chiếu/sửa/xác nhận |
| Điểm/báo cáo | Kết quả backend, học sinh chỉ xem điểm đã công bố |
| Hồ sơ viết | Nguồn bài công bố, cache/history và cập nhật chủ động |

Lệnh chạy/kiểm tra ở [README](../../README.md#khởi-chạy-local), [README backend](../../backend/README.md) và [CONTRIBUTING](../../CONTRIBUTING.md#lint-test-và-ci). Danh sách nợ đã xử lý/còn mở ở [tech-debt](tech-debt.md).
