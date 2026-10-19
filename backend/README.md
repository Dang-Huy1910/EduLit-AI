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

## Kho ngữ liệu, đề nguồn và giao bài

Luồng: Kho → chọn đề nguồn → tạo bài tập (barem, lớp, hạn nộp) → xác nhận & giao bài → học sinh mở Socratic. Chi tiết: [docs/development/teacher-assignment-flow.md](../docs/development/teacher-assignment-flow.md).

```bash
uv run alembic upgrade head
uv run python -m app.cli bootstrap-teacher
uv run python scripts/seed_demo.py
```

Seed idempotent: lớp 11A14, `nguyen.van.an` trong lớp, `bui.hamy` ngoài lớp, đề “Khói nhà máy…” khác đề thơ mẫu, barem 4 tiêu chí. Không truncate DB người dùng.

### Định dạng import barem JSON

`POST /api/teacher/rubrics`. Chỉ thông báo thành công sau khi validate và lưu. Không chọn/áp dụng barem cho một bài tập tại kho.

```json
{
  "title": "Barem chuẩn 4 tiêu chí",
  "shortTitle": "4 tiêu chí",
  "description": "Thang điểm do giáo viên đặt",
  "version": "v1",
  "gradeLevel": 11,
  "maxScore": 4.0,
  "scoreStep": 0.25,
  "criteria": [
    { "id": "C1", "name": "Nội dung", "weight": 2.5, "guideNote": "..." },
    { "id": "C2", "name": "Lập luận", "weight": 0.75 },
    { "id": "C3", "name": "Diễn đạt", "weight": 0.5 },
    { "id": "C4", "name": "Bố cục", "weight": 0.25 }
  ]
}
```

`weight` là điểm tối đa. Tổng weight = maxScore. Không bắt buộc 4.0. Chưa hỗ trợ PDF/DOCX.

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

## Socratic AI Agent

Triển khai Socratic Writing Scaffold Agent (FR-06 đến FR-10) trên Python backend.

OpenAI dùng Responses API của SDK (`responses.parse` + `text_format`). Retry hạ tầng do SDK (`AI_MAX_RETRIES`). Prompt chính thức nằm ở `prompts/socratic/`; build đóng gói vào `app.ai.prompts.socratic` theo `SOCRATIC_PROMPT_VERSION` (không phụ thuộc cwd).

### Cấu hình

Trong `backend/.env` (không commit khóa thật):

```bash
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
OPENAI_API_KEY=
AI_TIMEOUT_SECONDS=30
AI_MAX_OUTPUT_TOKENS=512
AI_MAX_RETRIES=2
SOCRATIC_PROMPT_VERSION=v1
```

`AI_MODEL` bắt buộc với openai/gemini. Thiếu khóa hoặc model → HTTP 503 `AI_UNAVAILABLE`, không fallback giả thành công.

Migration: `0002_socratic_schema`, `0003_socratic_reservation_access`, rồi `0004_socratic_outline_backfill` (backfill `outline_version`, chuẩn hoá ACCEPTED cũ). Không tự chạy trên DB development/production trong test.

### Seed demo (development/test)

```bash
cd backend
uv run python scripts/seed_demo.py
```

Tạo giáo viên `dang.loan`, học sinh `nguyen.van.an`, đề `VAN12-NLXH-SOC` và **cấp assignment_access**. Mã đề chỉ để tra cứu, không phải quyền truy cập.

### API Endpoints

```
POST /api/socratic-sessions                 # Tạo session (cần được giao đề)
GET  /api/socratic-sessions                 # Danh sách session còn quyền
GET  /api/socratic-sessions/{id}            # Session + current outline + readiness
GET  /api/socratic-sessions/{id}/outline    # Outline hiện hành
GET  /api/socratic-sessions/{id}/messages   # Student + assistant VALIDATED/FALLBACK; paginate theo turn
POST /api/socratic-sessions/{id}/messages   # Gửi tin; Idempotency-Key
PUT  /api/socratic-sessions/{id}/outline    # expectedVersion bắt buộc (0 khi tạo lần đầu)
POST /api/socratic-sessions/{id}/review     # Chỉ revision hiện hành
```

Mutation cần cookie phiên, `Origin` hợp lệ, `X-Edulit-CSRF: 1`, `Content-Type: application/json`. GET không cần CSRF.

Idempotency (cùng key): COMPLETED replay; PROCESSING + lease còn hạn → 409 `IDEMPOTENCY_IN_PROGRESS`; FAILED hoặc lease hết hạn → retry cùng logical turn, không tạo thêm student message; khác payload → 409. Record hết `expires_at` (TTL 24h) được tái sử dụng tại chỗ.

### Kiểm thử

```bash
cd backend
export DATABASE_URL_TEST=postgresql://edulit:edulit_dev@localhost:5433/edulit_auth_test
uv run pytest
uv run pytest tests/socratic/ -v
```

Không gọi OpenAI thật. Suite dùng `AI_PROVIDER=fake` và MockTransport cho SDK.

### Smoke test sau khi điền model/key

```bash
cd backend
# .env đã có OPENAI_API_KEY và AI_MODEL
uv run python -c "
import asyncio
from app.ai.adapters import create_ai_adapter
from app.ai.schemas import SocraticOutput
from app.config import get_settings

async def main():
    settings = get_settings()
    adapter = create_ai_adapter(settings)
    result = await adapter.generate(
        'Em đang nghĩ gì về luận điểm trung tâm của đề?',
        system_prompt='Trả JSON SocraticOutput, tối đa 4 câu, kết thúc bằng câu hỏi.',
        structured_output=SocraticOutput,
        max_tokens=settings.AI_MAX_OUTPUT_TOKENS,
    )
    print(type(result.content).__name__, adapter.model_name)
    await adapter.close()

asyncio.run(main())
"
```

### Headers quan trọng

- **CSRF**: `X-Edulit-CSRF: 1` (mutation)
- **Idempotency**: `Idempotency-Key` (POST /messages)
- **Expected Version**: `expectedVersion` bắt buộc (PUT /outline); lần đầu = 0
