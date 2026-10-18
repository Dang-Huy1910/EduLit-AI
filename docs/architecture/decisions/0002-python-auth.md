# ADR-0002 — Python FastAPI cho tài khoản và xác thực

- Ngày: 18/10/2026.
- Trạng thái: chọn cho feature `feat/python-auth`.
- Phạm vi: đăng ký học sinh, phiên, email, mật khẩu, phân quyền TEACHER/STUDENT. Không gồm lớp, bài tập, OCR, AI.

## Bối cảnh

ADR-0001 chọn NestJS/TypeScript và tài khoản cấp sẵn cho MVP. Yêu cầu hiện tại ưu tiên Python, học sinh tự đăng ký, xác minh email, khôi phục/đổi mật khẩu và quản lý phiên trên PostgreSQL. Frontend Next.js trên `main` giữ nguyên thiết kế.

## Quyết định

1. Scaffold API xác thực bằng Python 3.12, FastAPI, SQLAlchemy 2 async, Alembic, Argon2id, cookie phiên HttpOnly, SMTP adapter.
2. Học sinh tự đăng ký; backend luôn gán `STUDENT`. Giáo viên là tài khoản bootstrap idempotent (persona Cô Đặng Loan trên `main`), không có đăng ký giáo viên hay mã mời.
3. Email phải xác minh trước khi cấp phiên dùng ứng dụng. Token một lần, chỉ lưu hash.
4. Rate-limit atomic trên PostgreSQL, CSRF Origin allowlist + header `X-Edulit-CSRF: 1`, CORS đúng `APP_ORIGIN`.
5. ADR-0001 vẫn mô tả stack NestJS cho các phân hệ khác khi được triển khai; phần identity trên nhánh này dùng Python.

## Hệ quả

- Có runtime Python (`uv`, `uv.lock`) cạnh frontend npm.
- Schema auth tách riêng, không kéo bài tập/AI.
- Deploy ưu tiên cùng origin (proxy `/api` tới FastAPI) để cookie hoạt động rõ ràng.
- Cấu hình production phải có SMTP và secret giáo viên riêng; prototype password bị từ chối.
