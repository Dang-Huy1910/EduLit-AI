# ADR-0002 — Python FastAPI cho tài khoản và xác thực

- Ngày: 18/10/2026.
- Trạng thái: được chấp nhận; rà lại 2026-10-28 theo `backend/app/identity/`.
- Phạm vi: đăng ký học sinh, phiên, email, mật khẩu, phân quyền TEACHER/STUDENT. Không gồm lớp, bài tập, OCR, AI.

## Bối cảnh

ADR-0001 chọn NestJS/TypeScript và tài khoản cấp sẵn cho MVP. Yêu cầu hiện tại ưu tiên Python, học sinh tự đăng ký, xác minh email, khôi phục/đổi mật khẩu và quản lý phiên trên PostgreSQL. Frontend Next.js trên `main` giữ nguyên thiết kế.

## Quyết định

1. Scaffold API xác thực bằng Python 3.12, FastAPI, SQLAlchemy 2 async, Alembic, Argon2id, cookie phiên HttpOnly, SMTP adapter.
2. Học sinh tự đăng ký; backend luôn gán `STUDENT`. Giáo viên là tài khoản bootstrap idempotent (persona Cô Đặng Loan trên `main`), không có đăng ký giáo viên hay mã mời.
3. Theo chính sách hiện tại, đăng ký học sinh thành công được đánh dấu đã xác minh (`email_verified_at=utcnow()`) và cấp phiên ngay. `register` không phụ thuộc cờ `AUTO_VERIFY_STUDENT`. Vẫn giữ `POST /api/auth/verify-email` và `POST /api/auth/resend-verification` cho luồng token xác minh; token một lần, chỉ lưu hash.
4. Rate-limit atomic trên PostgreSQL, CSRF Origin allowlist + header `X-Edulit-CSRF: 1`, CORS đúng `APP_ORIGIN`.
5. [ADR-0004](0004-python-monolith.md) ghi nhận Python là backend mặc định cho cả các phân hệ nghiệp vụ; ADR-0001 được giữ như quyết định lịch sử đã thay thế.

## Hệ quả

- Có runtime Python (`uv`, `uv.lock`) cạnh frontend npm.
- Mã identity vẫn nằm trong `backend/app/identity/`, dùng model auth tại `backend/app/db/models/`; cùng API hiện đã có bài tập và AI.
- Deploy ưu tiên cùng origin (proxy `/api` tới FastAPI) để cookie hoạt động rõ ràng.
- Production kiểm tra HTTPS, cookie Secure và secret giáo viên riêng; mật khẩu prototype bị từ chối. Kiểm tra SMTP được áp dụng khi không có adapter email thay thế và `AUTO_VERIFY_STUDENT=false` (xem `Settings.validate_runtime`). Cờ này không thay đổi hành vi đăng ký nói trên.
