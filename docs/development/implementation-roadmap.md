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

## M4 — OCR (học sinh xác nhận) và chấm sau này

- Upload/che vùng riêng tư 1–4 trang, freeze attempt, queue OCR, segment mapping và transcription revision.
- Học sinh đối chiếu/sửa/xác nhận bản chép; không có màn giáo viên duyệt OCR.
- Chấm rubric AI chưa làm ở bước này; sau xác nhận hiện “Chờ đánh giá”.
- Worker crash/re-delivery, trang lỗi phải báo rõ, retry cùng input, nộp bộ ảnh mới tạo attempt mới.

**Hoàn thành khi:** một bài đi hết chụp → OCR → học sinh xác nhận → `READY_TO_GRADE`; job giao lại không nhân đôi. Ánh xạ FR-11–FR-14. Chấm/công bố điểm thuộc bước sau.

## M5 — Báo cáo và cá nhân hóa

- SQL metrics/heatmap theo taxonomy và tập bài hiện hành; denominator hiển thị rõ; teaching recommendations từ snapshot.
- Goal survey, observations có evidence, profile snapshot và chọn context cho Socratic; không dùng profile để chấm.
- Invalidation/rebuild khi sửa OCR, thay/rút assessment; theo dõi tiến bộ trong các bài so sánh được.

**Hoàn thành khi:** báo cáo khớp fixture có nộp lại/rút điểm; nhận xét profile trỏ đúng đoạn; không gán style ổn định theo số bài cố định. Ánh xạ FR-18–FR-21, AC-06/07; profile là mở rộng sản phẩm ngoài FR hiện tại.

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
| Điểm 7.5 và confidence 0.94 mock | Sau xác nhận: “Chờ đánh giá”; confidence có source hoặc null |
| Reset demo | Xóa state mock của trình duyệt; không có endpoint xóa production data |

Mock/API mode phải tách bằng cấu hình và adapter rõ, không silently fallback sang mock khi API lỗi. Không chuyển toàn bộ store trước khi feature tương ứng có API và kiểm tra; mỗi milestone giữ demo có thể chạy để so giao diện.
