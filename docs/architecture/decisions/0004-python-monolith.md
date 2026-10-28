# ADR-0004 — Backend Python monolith

- Ngày: 2026-10-28.
- Trạng thái: được chấp nhận; thay thế [ADR-0001](0001-mvp-stack.md).
- Phạm vi: backend mặc định cho toàn bộ API và tác vụ nền EduLit-AI.

## Bối cảnh

[ADR-0002](0002-python-auth.md) đưa tài khoản sang Python; [ADR-0003](0003-socratic-python-langchain.md) bổ sung Socratic. Hiện `backend/app/main.py` đã gắn router cho tài khoản, lớp, kho học liệu, bài tập, bài nộp, chấm, báo cáo, chatbot và hồ sơ viết. Stack NestJS/Prisma/pg-boss của ADR-0001 không phản ánh ứng dụng đang chạy.

## Quyết định

1. Backend mặc định là **Python 3.12, FastAPI, SQLAlchemy 2 async và Alembic**, với PostgreSQL. Dependency khóa ở `backend/uv.lock`; migration duy nhất nằm trong `backend/alembic/versions/` (hiện tới `0019`).
2. Giữ một monolith trong `backend/app/`: router nhận HTTP, service xử lý nghiệp vụ, model quản lý persistence, workflow điều phối Socratic. Entrypoint API là `app.main:app`; prefix nghiệp vụ là **`/api`**.
3. Mặc định các worker **`ocr`, `outline_prep`, `assessment`, `writing_profile` chạy trong process API**, được khởi động/dừng bởi lifespan trong `main.py`. Các cờ tương ứng là `OCR_WORKER_ENABLED`, `OUTLINE_PREP_WORKER_ENABLED`, `ASSESSMENT_WORKER_ENABLED`, `WRITING_PROFILE_AUTO_ENABLED`; môi trường test không tự khởi động worker.
4. Ba worker OCR/outline/chấm dùng helper `workers/_loop.py` để claim trong transaction, quản lý concurrency và poll. Dữ liệu lease/job nằm trong PostgreSQL. Writing profile dùng vòng sweep riêng để tạo hồ sơ đầu tiên, backoff trong bộ nhớ; không có bảng job profile. CLI hiện hỗ trợ tách ba worker đầu ra process riêng nếu tắt cờ tương ứng trong API.
5. AI chọn qua **`AI_PROVIDER=openai|gemini|fake`** và `AI_MODEL` trong `config.py`; mặc định provider là `openai`, model trống. Adapter thực nằm ở `app/ai/adapters.py`: OpenAI SDK, Gemini REST và fake phục vụ kiểm thử. Provider thật cần model/key tương ứng. Prompt có phiên bản tại `prompts/` và được đóng gói khi build backend.
6. Frontend giữ Next.js App Router, React, TypeScript và Zustand. Rewrite `/api/*` tới FastAPI; cookie phiên và kiểm tra quyền ở backend. Các schema Pydantic/validator nghiệp vụ là phần thực thi hiện tại; contracts xuất riêng và evaluations còn dành cho M6.

## Phương án cân nhắc

| Phương án | Đánh giá |
| --- | --- |
| Tiếp tục NestJS/Prisma/pg-boss của ADR-0001 | Không có ứng dụng thực thi tương ứng; sẽ nhân đôi backend đã viết bằng Python |
| Tách toàn bộ worker thành dịch vụ riêng ngay | Chưa phải cấu hình mặc định; ba worker có CLI để tách khi cần |
| Worker trong process API | Khớp lifespan và cấu hình hiện tại; dùng lại service/model, giảm số tiến trình local |

## Hệ quả và giới hạn

- API và worker dùng chung tài nguyên process/database; cần tính concurrency và số replica khi triển khai.
- Lease không bảo đảm chỉ gọi provider một lần khi crash. Không mô tả transactional outbox, pg-boss, usage ledger hay storage GCS như thành phần đã có.
- Không khóa một model Gemini cho mọi tác vụ. OCR, chấm và profile có model override trong Settings.
- Quyết định đăng ký được xác minh và cấp phiên ngay nằm ở ADR-0002; endpoint xác minh email vẫn giữ.
- Hướng dẫn chạy và tách worker ở [README backend](../../../backend/README.md); phần cần kiểm chứng tiếp ở [roadmap](../../development/implementation-roadmap.md).
