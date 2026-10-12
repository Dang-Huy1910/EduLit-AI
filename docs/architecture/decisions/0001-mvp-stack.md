# ADR-0001 — Stack MVP và Gemini 2.5 Flash

- Ngày: 12/10/2026.
- Trạng thái: chọn làm cơ sở triển khai; Gemini 2.5 Flash là lựa chọn rõ của người dùng, các thành phần còn lại do thiết kế này đề xuất.
- Phạm vi: thí điểm EduLit-AI từ prototype hiện có; hạ tầng đầy đủ (queue/outbox/OCR) vẫn để sau. Database tối giản: [ADR-0002](0002-minimal-mvp-database.md).

## Bối cảnh

Frontend dùng Next.js 15, React 19, TypeScript, Tailwind CSS 3, Recharts và Zustand. Các module backend, contracts và evaluations hiện mới có vị trí dự kiến. MVP cần tài khoản/lớp, học liệu, rubric có phiên bản, chat có guardrail, OCR và chấm nền, báo cáo, hồ sơ viết.

## Quyết định

1. Giữ frontend; bổ sung TanStack Query khi chuyển sang API thật, Zustand chỉ giữ UI state/draft phù hợp.
2. NestJS/TypeScript trên Node.js 24 LTS, npm; API và worker cùng codebase, theo modular monolith. Không dựng microservices cho từng phân hệ.
3. PostgreSQL 17 + Prisma, pg-boss cho queue trên cùng database. Transactional outbox nối mutation và tác vụ nền; consumer idempotent.
4. Google GenAI SDK `@google/genai`, model chính xác `gemini-2.5-flash`. Tách prompt/schema cho OCR, rubric, chấm, Socratic và profile; không fine-tune từng học sinh.
5. JSON Schema/Ajv làm contract boundary. Quyền, tổng điểm, nguồn trích dẫn và FSM được kiểm tra bằng mã ứng dụng.
6. Tài khoản cấp trước, session PostgreSQL và cookie bảo mật cho thí điểm. File riêng tư qua local adapter khi dev và GCS khi triển khai thật.
7. Retrieval theo đề/metadata trước; báo cáo SQL; profile giữ bằng chứng. Embeddings/vector search là mở rộng cần đánh giá riêng.
8. Backend trả điểm AI đề xuất; giáo viên xác nhận bản chép và công bố kết quả trong MVP. Đây là chính sách triển khai đề xuất cho các mục TBD-04/TBD-05.

## Phương án cân nhắc

| Phương án | Đánh giá |
| --- | --- |
| FastAPI/Python | Hợp lý nếu nhóm chủ yếu Python hoặc tự huấn luyện OCR; hiện không cần thêm runtime để gọi Gemini |
| Chỉ Next.js route handlers | Có thể làm CRUD nhỏ; API riêng thuận tiện cho guard, worker thường trú và ranh giới nhiều module |
| Redis/BullMQ | Phù hợp khi queue/cache cần scale riêng; MVP dùng PostgreSQL jobs để giảm thành phần vận hành |
| Microservices/vector DB ngay | Tăng triển khai và đồng bộ dữ liệu khi chưa có tải hoặc nhu cầu truy xuất chứng minh |

## Hệ quả và điều kiện

- Chung TypeScript giúp nhóm tái sử dụng contract, nhưng domain không dùng trực tiếp UI types hay Prisma entities.
- API/worker dùng cùng database: theo dõi pool, queue lag và contention; scale worker có giới hạn theo quota Gemini.
- Chọn pg-boss không làm API Gemini exactly-once; chi phí có thể lặp khi worker crash, phải có ledger và checkpoints.
- Giữ model theo yêu cầu. [Google hiện nêu hạn chế quyền truy cập Gemini 2.5 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash); smoke test trên project dự định dùng là điều kiện đầu tiên. Nếu không có quyền, báo lỗi rõ và chờ lựa chọn của người dùng, không tự thay model.
- Chính sách retention, độ đạt outline, rubric rounding và ngưỡng evaluation vẫn cần xác định trước nghiệm thu. Xem [system design](../system-design.md).
