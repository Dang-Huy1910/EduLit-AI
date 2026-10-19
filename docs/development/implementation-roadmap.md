# Lộ trình chuyển prototype thành MVP

Ngày: 12/10/2026. Phụ thuộc: [system design](../architecture/system-design.md), [data model](../architecture/data-model.md), [API design](../api/api-design.md), [Gemini pipeline](../architecture/gemini-pipeline.md).

Đợt hiện tại hoàn thành tài liệu kiến trúc và lựa chọn công nghệ. Các milestone dưới đây là công việc triển khai tiếp theo, chưa phải chức năng đã chạy. Không ấn định số tuần khi chưa biết nhân lực, quyền API, dataset và phản hồi giáo viên.

## M0 — Kiểm tra điều kiện và chốt chính sách

- Dùng đúng project/API key dự định triển khai để smoke test `gemini-2.5-flash`: text, ảnh giả lập, structured output, quota và usage.
- Chốt review OCR, công bố điểm, quyền teacher đọc chat, outline readiness/nộp bài, bài nộp lại, score step và retention theo SRS.
- Thu thập dataset được phép sử dụng, gỡ PII, có bản chép chuẩn và rubric/teacher scores; tách tuning/holdout.

**Hoàn thành khi:** quyền gọi model được xác nhận; các policy ảnh hưởng workflow được ghi; teacher thống nhất bộ thử/ngưỡng ban đầu. Model unavailable được báo rõ, không tự thay model.

## M1 — Nền tảng và dữ liệu thật

- Scaffold NestJS API/worker trên Node.js 24 LTS/npm, lock patch runtime và dependencies, cấu hình lint/typecheck/test.
- PostgreSQL/Prisma, migrations, pg-boss và transactional outbox; dev Docker Compose và storage adapter riêng tư.
- Identity/session, membership authorization, CSRF, request IDs, usage reservations, idempotency và audit.
- JSON Schemas/OpenAPI, mapper từ prototype camelCase/mock sang contract chính thức; fixture giả lập cho một lớp.
- Thêm API client/TanStack Query; chuyển assignments/materials khỏi Zustand persisted data dần theo feature.

**Hoàn thành khi:** teacher/student đăng nhập, request chéo lớp/chủ sở hữu bị chặn; restart không mất dữ liệu; upload không public; mutation conflict/idempotency có kiểm tra tích hợp.

## M2 — Học liệu, rubric và giao đề

- PDF/DOCX/TXT parsing, privacy review, material versions/chunks, Gemini rubric extraction, teacher approve.
- Assignment draft/publish, pin rubric/material versions, mục tiêu theo tiêu chí; retrieval đúng scope.
- UI chỉ thấy trạng thái backend; không dùng thời gian chờ cố định để giả lập READY.

**Hoàn thành khi:** từ tài liệu thật đã rà soát tạo được rubric hợp lệ; giáo viên sửa/approve/giao; rubric sửa không thay lịch sử đề đã giao. Ánh xạ FR-01–FR-05, AC-01.

## M3 — Socratic thật

- Chat session/messages/outline/FSM, policy readiness; Gemini adapter, context budget, refusal và response guardrail.
- Buffer output trước trả UI; fallback câu hỏi đã duyệt; reconnect/idempotency/concurrent turn handling.
- Đánh giá bộ yêu cầu viết hộ, prompt injection trong học liệu và câu hỏi ngoài phạm vi.

**Hoàn thành khi:** hướng dẫn theo đúng đề/nguồn, giữ dàn ý học sinh, không xuất bản đoạn vi phạm guardrail; có báo cáo độ trễ thực tế. Ánh xạ FR-06–FR-10, BR-01–BR-04, AC-02/03.

## M4 — OCR (học sinh xác nhận) rồi chấm rubric

- Upload/che vùng riêng tư 1–4 trang, freeze attempt, queue OCR, segment mapping và transcription revision.
- Học sinh đối chiếu/sửa/xác nhận bản chép; không có màn giáo viên duyệt OCR.
- “Xác nhận bản chép & Nộp bài” là nộp chính thức (`READY_TO_GRADE`, `official_submitted_at`). Thời điểm gửi ảnh OCR (`submitted_at`) tách riêng.
- Worker chấm durable trong API (`assessment_jobs`): concurrency/lease/retry; GET chỉ đọc; xác nhận lặp lại idempotent. Chấm theo AssignmentRevision đã giao + bản chép đã xác nhận, không dùng OCR thô hay barem catalog mới nhất.
- Giáo viên rà soát/công bố/ẩn; CAS `resultId` + `transcriptionRevisionId` + `expectedVersion` → 409 nếu lệch bản đang xem. Học sinh chỉ xem điểm sau công bố. Phiên bản từng công bố (kể cả đang ẩn) cần giáo viên cấp quyền mới sửa; ẩn điểm không tự cấp quyền sửa. Grant bị tiêu thụ khi học sinh bắt đầu lượt sửa/nộp lại.

**Hoàn thành khi:** một bài đi hết chụp → OCR → học sinh xác nhận → hàng đợi chấm → giáo viên công bố → học sinh xem điểm. Ánh xạ FR-11–FR-17.

## M5 — Báo cáo lớp (và cá nhân hóa sau)

- Giáo viên tách hai luồng: chi tiết từng bài (`/assignments/[id]` tab đề / bài nộp / thống kê) và báo cáo năng lực nhiều bài (`/reports`). URL cũ `/reports?assignmentId=` và `/reports/[id]/students/[sid]` chuyển về luồng bài tập.
- SQL metrics theo bài và theo nhiều bài, hai chế độ: tạm tính (bản nộp chính thức hiện hành, ưu tiên overlay giáo viên) và chính thức (published snapshot hiện hành). Thiếu điểm không coi là 0; mỗi học sinh/bài tập một kết quả; bài khác maxScore quy về thang 10 trước khi tổng hợp. Phổ điểm `[0,2)…[8,10]` do backend tính.
- Tổng hợp lỗi theo `code` ổn định, tách số học sinh và số lần xuất hiện, ghi rõ mẫu số; phân biệt AI phát hiện với giáo viên xác nhận.
- Gợi ý điều chỉnh dạy học từ số liệu server đã tính; cache theo hash đầu vào; GET/refresh không gọi AI; lỗi phân tích không làm mất bảng điểm.
- Hồ sơ văn phong (goal survey, observations, snapshot Socratic) vẫn là bước sau; không dùng profile để chấm.

**Hoàn thành khi:** báo cáo khớp bài đã công bố, kể cả nộp lại chưa công bố vẫn giữ điểm cũ. Ánh xạ FR-18–FR-21. Profile là mở rộng ngoài FR hiện tại.

## M6 — Kiểm chứng và thí điểm

- Chạy evaluations trên holdout; giáo viên đối chiếu OCR, scoring, Socratic và style observations.
- Đo p50/p95 theo tải/ảnh/quota cụ thể, phân biệt queue/provider/review wait và NFR-03/04. Báo rõ mục tiêu chưa đạt để điều chỉnh policy cùng người phụ trách.
- CI build/typecheck/tests/contracts; kiểm tra dữ liệu log, secrets, cleanup/provider files, backup/restore và cookie/CSRF trong môi trường HTTPS.
- Deploy staging trước; sau khi đạt các quality gate và policy, thí điểm một lớp, theo dõi phản hồi/chi phí.

**Hoàn thành khi:** có báo cáo evaluation và giới hạn thực tế, không chỉ demo; backend/worker vận hành bền vững, teacher workflow được sử dụng và chính sách lưu/xóa đã kiểm tra.

## Chuyển frontend từng phần

| Prototype hiện tại | MVP đích |
| --- | --- |
| `setRole`/tài khoản 1-click | Session backend; demo chỉ bật trong chế độ mock |
| Assignments/materials trong `store.ts` | TanStack Query + API; Zustand giữ UI/draft |
| `activeRubric` dùng chung | Rubric revision theo đề/session/attempt |
| Outline/chat dùng chung toàn app | Scope theo student + session + assignment revision |
| `piiMasked: boolean` | Ảnh đã rà soát xuất bitmap (xoay/che vùng); học sinh tự che, không tự mờ danh tính |
| Học sinh sửa text OCR trực tiếp | Học sinh đối chiếu/sửa/xác nhận; expectedRevision; không màn giáo viên duyệt OCR |
| Điểm 7.5 và confidence 0.94 mock | Sau xác nhận: bài đã nộp chính thức; điểm rubric khi hệ thống mở chấm |
| Reset demo | Xóa state mock của trình duyệt; không có endpoint xóa production data |

Mock/API mode phải tách bằng cấu hình và adapter rõ, không silently fallback sang mock khi API lỗi. Không chuyển toàn bộ store trước khi feature tương ứng có API và kiểm tra; mỗi milestone giữ demo có thể chạy để so giao diện.
