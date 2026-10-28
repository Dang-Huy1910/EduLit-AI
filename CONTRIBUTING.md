# Hướng dẫn đóng góp

## Trước khi triển khai

Đọc [SRS](SRS.md) và [cấu trúc dự án](docs/architecture/project-structure.md). Khi một thay đổi giải quyết yêu cầu cụ thể, ghi mã `FR`, `BR`, `NFR` hoặc `AC` liên quan trong mô tả thay đổi.

Giao diện dùng Next.js App Router; toàn bộ backend dùng Python 3.12/FastAPI, SQLAlchemy async và Alembic theo [ADR-0004](docs/architecture/decisions/0004-python-monolith.md). ADR-0001 là quyết định lịch sử đã thay thế. Backend khóa bằng `backend/uv.lock`; frontend khóa bằng `frontend/package-lock.json`. Lệnh khởi chạy cả hai ứng dụng ở [README](README.md#khởi-chạy-local) và [README backend](backend/README.md).

## Tổ chức mã

- Đặt nghiệp vụ trong `backend/app/services/`, tích hợp AI trong `backend/app/ai/`, email trong `backend/app/email/` và persistence trong `backend/app/db/`.
- Giữ controller/route và tác vụ nền tập trung vào nhận đầu vào, gọi use case và trả kết quả.
- Chỉ đưa vào `core` các thành phần thực sự dùng chung; giữ quy tắc chấm điểm và FSM trong module sở hữu chúng.
- Đặt học liệu/import trong `catalog_service.py`, `document_import.py`, truy xuất chatbot trong `chatbot_service.py` dưới `backend/app/services/`; phiên Socratic trong `socratic_service.py`, workflow/guardrail trong `backend/app/workflows/`. Worker nằm trong `backend/app/workers/`. Tham khảo [luồng học liệu và chatbot](docs/architecture/knowledge-and-chatbot.md).
- Thay đổi hợp đồng dữ liệu phải cập nhật schema, ví dụ, bên sử dụng và kiểm thử liên quan cùng lúc.
- Đặt thay đổi kiến trúc có tác động lâu dài trong `docs/architecture/decisions/`, theo tên `NNNN-ten-quyet-dinh.md`.

## Kiểm tra thay đổi

Chọn kiểm thử phù hợp với hành vi thay đổi: unit cho quy tắc nghiệp vụ, integration cho tích hợp, contract cho schema, e2e cho luồng sử dụng, performance cho thời gian xử lý. Với thay đổi prompt hoặc nhà cung cấp AI, chạy bộ đánh giá tương ứng trong `evaluations` khi bộ đánh giá đã được triển khai. Thư mục `evaluations/` hiện chưa có runner.

Lệnh lint, typecheck và test nằm ở mục dưới. Tài liệu cần kiểm tra liên kết và `git diff --check`. Không đòi gọi model hoặc build UI khi không đổi code.

## Lint, test và CI

Từ `backend/`:

```bash
.venv/bin/ruff check .
DATABASE_URL_TEST=postgresql://.../ten_db_test .venv/bin/pytest
```

`DATABASE_URL_TEST` phải trỏ tới database test riêng. Pytest dừng nếu thiếu biến này và không dùng `DATABASE_URL`.

Từ `frontend/`:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run test:ui
```

`npm run lint` dùng ESLint flat config `eslint.config.mjs`. `npm test` là unit test Node. `npm run test:ui` là Playwright theo `playwright.ui.config.ts`. Frontend cần Node 22.7 trở lên để chạy `npm test`, và pytest backend cần mailpit chạy ở 127.0.0.1:1025/8025 vì `tests/integration/test_smtp_sink.py` không còn skip.

GitHub Actions tại `.github/workflows/ci.yml` chạy lint và test backend lẫn frontend khi push lên `main` và khi mở pull request. Workflow đó không chạy Playwright.

## Dữ liệu và cấu hình

- Chỉ đưa dữ liệu tổng hợp giả lập hoặc dữ liệu đã được kiểm tra ẩn danh vào fixture và bộ đánh giá được commit.
- Ảnh bài làm thật, dữ liệu định danh học sinh, token và API key không thuộc repository.
- Cấu hình thật đặt trong môi trường hoặc cơ chế quản lý secret của nền tảng triển khai; template hiện có là [backend/.env.example](backend/.env.example) và [frontend/.env.example](frontend/.env.example), chỉ chứa cấu hình minh họa.
- Việc Git bỏ qua file chỉ ngăn theo dõi ngoài ý muốn; chính sách truy cập, lưu giữ và xóa dữ liệu vẫn phải được triển khai theo SRS.
