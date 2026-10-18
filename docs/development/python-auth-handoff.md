# Handoff — xác thực Python (feat/python-auth)

Ngày: 18/10/2026. Base local `main` `5e24268`.

## Chính sách đã chốt

| Vai trò | Đăng ký | Đăng nhập | Email |
| --- | --- | --- | --- |
| Học sinh | Tự đăng ký (họ tên, loginId, email, mật khẩu). Role luôn `STUDENT`. | Sau khi `email_verified_at` có giá trị | Xác minh + quên mật khẩu |
| Giáo viên | Không. CLI `bootstrap-teacher` | Cùng API, username `dang.loan` hoặc email cấu hình | Đánh dấu verified vì người vận hành cấp, không vì domain mẫu là mailbox thật |

Email chuẩn hóa: strip + lowercase toàn bộ địa chỉ; **không** xóa dấu chấm hay `+tag`.  
Mật khẩu mới: 15–128 ký tự, không strip. Login không áp minimum đó.

## Contract `/api/auth`

JSON camelCase. Lỗi `{ error: { code, message, fields? } }`.

- `POST /register` → 202 `verification_required` (không cấp session)
- `POST /verify-email` `{ token }`
- `POST /resend-verification` `{ email }` (phản hồi trung tính)
- `POST /login` `{ loginId, password, rememberMe? }` + cookie `edulit_session`
- `GET /me` PublicUser
- `POST /logout` (idempotent)
- `POST /forgot-password` / `POST /reset-password`
- `POST /change-password` (thu hồi mọi phiên)
- `GET /sessions` / `DELETE /sessions/{id}` / `POST /logout-all`

Mutation: `Origin` đúng `APP_ORIGIN`, `Content-Type: application/json`, `X-Edulit-CSRF: 1`, `credentials: include`.

PublicUser = `{ id, loginId, email, displayName, role, emailVerified }`.

## Chạy từ clone sạch

Xem [backend/README.md](../../backend/README.md). Tóm tắt:

```bash
cd backend && cp .env.example .env && uv sync --extra dev
uv run alembic upgrade head
uv run python -m app.cli bootstrap-teacher
uv run uvicorn app.main:app --port 4000
cd ../frontend && cp .env.example .env.local && npm install && npm run dev
```

Mailpit UI: `http://localhost:8025`. Không gửi thư tới địa chỉ thật khi test.

## Frontend

Auth mặc định, không cờ bí mật. `AuthGate` gọi `GET /me` sau refresh. Trang: `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/account/security`. Học sinh mới thấy empty/welcome, không kế thừa bài của Bùi Hà My.

Token xác minh/reset nằm ở URL fragment (`#token=`). Trang đọc token, POST lên API, rồi xóa fragment. Cache ngắn hạn trong module JS để React Strict Mode (dev) không nuốt token khi mount hai lần.

## Kiểm thử đã chạy local (18/10/2026)

| Nhóm | Lệnh | Kết quả |
| --- | --- | --- |
| pytest | `cd backend && uv run --python 3.12 pytest` | 32 passed |
| Playwright | `cd frontend && npx playwright test` (stack API+Next+Mailpit+Postgres) | 5 passed |
| TypeScript | `cd frontend && npx tsc --noEmit` | sạch |
| Build | `cd frontend && npm run build` | Next.js 15.5.27 standalone OK |
| `git diff --check` | từ repo root | sạch |
| Restart API | login `dang.loan` sau khi tắt/bật Uvicorn | cùng UUID giáo viên |

Playwright `globalSetup` `TRUNCATE rate_limit_buckets` trên `edulit_auth` để lần chạy sau không dính cửa sổ 15 phút của lần trước. Cần `psql` trên PATH.

```bash
# SMTP sink + API + frontend đang chạy
cd frontend && npx playwright test
```

## Phân biệt local đã kiểm thử và production

**Đã hoàn thiện trong code và kiểm thử local:** đăng ký học sinh, xác minh email qua Mailpit, login/refresh/logout, quên/đặt lại/đổi mật khẩu, phiên, bootstrap giáo viên, CSRF/cookie, migration Alembic.

**Chưa sẵn sàng production:**

- Domain + HTTPS + reverse proxy `/api` → Uvicorn (cookie Secure)
- SMTP provider thật (không dùng Mailpit); chưa gửi/nhận thư trên mailbox nhà trường
- `BOOTSTRAP_TEACHER_EMAIL` / mật khẩu do vận hành kiểm soát; prototype `DanPhuong@2024` bị từ chối khi `APP_ENV=production`
- Backup PostgreSQL bảng `users`, `auth_sessions`, `auth_tokens`
- Lịch `python -m app.cli cleanup-expired`
- `TRUSTED_PROXY_IPS` khi chạy sau proxy

Feature **chưa** sẵn sàng production cho đến khi SMTP thật và HTTPS được kiểm chứng ngoài local.
