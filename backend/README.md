# Backend — xác thực EduLit-AI

API đang chạy trên nhánh này là **Python 3.12 + FastAPI** cho tài khoản và phiên. Khung thư mục NestJS/TypeScript còn lại là vị trí dự kiến cho nghiệp vụ khác, chưa phải API xác thực.

Học sinh tự đăng ký và phải xác minh email. Giáo viên dùng tài khoản prototype được bootstrap vào PostgreSQL (`dang.loan` / Cô Đặng Loan), không có đăng ký giáo viên công khai.

## Chạy local (copy/paste)

Cần PostgreSQL (mặc định `localhost:5433` như stack hiện có) và Mailpit cho SMTP sink.

```bash
# 1) Tạo database (Postgres 17 đang chạy trên :5433)
docker exec edulit-postgres-1 psql -U edulit -d postgres -c "CREATE DATABASE edulit_auth;"
docker exec edulit-postgres-1 psql -U edulit -d postgres -c "CREATE DATABASE edulit_auth_test;"

# 2) SMTP sink
docker run --rm -d --name mailpit-dev -p 1025:1025 -p 8025:8025 axllent/mailpit:v1.21

# 3) Cấu hình và phụ thuộc
cd backend
cp .env.example .env
uv sync --extra dev

# 4) Migration + giáo viên bootstrap (idempotent, không ghi đè mật khẩu đã đổi)
uv run alembic upgrade head
uv run python -m app.cli bootstrap-teacher

# 5) API
uv run uvicorn app.main:app --reload --port 4000
```

Kiểm tra: `GET http://localhost:4000/api/health` → `{"ok":true}`.

Frontend (cửa khác):

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Mở `http://localhost:3000`. Next.js rewrite `/api/*` tới `http://localhost:4000`. Cookie phiên `edulit_session` (HttpOnly, SameSite=Lax).

## Kiểm thử

```bash
cd backend
export DATABASE_URL_TEST=postgresql://edulit:edulit_dev@localhost:5433/edulit_auth_test
uv run pytest
```

Thiếu `DATABASE_URL_TEST` thì pytest dừng, không dùng database dev.

## CLI vận hành

```bash
uv run python -m app.cli bootstrap-teacher
uv run python -m app.cli reset-teacher-password --i-understand
uv run python -m app.cli cleanup-expired
```

`reset-teacher-password` chỉ dành người vận hành; thu hồi mọi phiên của giáo viên.

## Compose đầy đủ

Từ thư mục repository:

```bash
docker compose -f infra/docker/compose.auth.yml up --build
```

Gồm PostgreSQL (host `5434`), Mailpit (`1025`/`8025`), API (`4000`), frontend (`3000`). Không đặt `container_name` cố định.

Trước khi container API nhận request, chạy migration và bootstrap từ image hoặc host:

```bash
docker compose -f infra/docker/compose.auth.yml exec api alembic upgrade head
docker compose -f infra/docker/compose.auth.yml exec api python -m app.cli bootstrap-teacher
```

## Production

Bắt buộc: `APP_ENV=production`, `APP_ORIGIN` HTTPS, SMTP thật, `COOKIE_SECURE`, `BOOTSTRAP_TEACHER_PASSWORD` khác mật khẩu prototype. Thiếu một trong các mục này thì process không khởi động. Không có demo-login.
