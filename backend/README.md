# Backend — EduLit-AI

Backend mặc định là **Python 3.12 + FastAPI + SQLAlchemy async + Alembic**, dùng PostgreSQL. `app.main:app` gắn router `/api` cho tài khoản, lớp, kho học liệu, bài tập, Socratic, bài nộp/OCR, chấm/báo cáo, chatbot và hồ sơ viết. Xem [ADR-0004](../docs/architecture/decisions/0004-python-monolith.md).

Học sinh tự đăng ký: `AuthService.register` đánh dấu email đã xác minh và cấp phiên ngay. `AUTO_VERIFY_STUDENT` không điều khiển nhánh này. Các endpoint `/api/auth/verify-email` và `/api/auth/resend-verification` vẫn giữ cho luồng token xác minh. Giáo viên được bootstrap vào PostgreSQL (`dang.loan` / Cô Đặng Loan), không có đăng ký giáo viên công khai.

## Chạy local (copy/paste)

Cần Python 3.12, uv và Docker Compose. Settings mặc định DB ở `localhost:5433`; lệnh dưới dùng PostgreSQL của Compose ở host `5434` và Mailpit.

```bash
# Từ gốc repository: DB edulit_auth, DB test qua init script, SMTP sink
docker compose -f infra/docker/compose.auth.yml up -d postgres mailpit

cd backend
cp .env.example .env
uv sync --extra dev
export DATABASE_URL=postgresql://edulit:edulit_dev@localhost:5434/edulit_auth

# Migration + giáo viên bootstrap (idempotent, không ghi đè mật khẩu đã đổi)
uv run alembic upgrade head
uv run python -m app.cli bootstrap-teacher
uv run uvicorn app.main:app --reload --port 4000
```

Nếu đã có PostgreSQL riêng, đổi `DATABASE_URL` cho đúng host/port/database. Mailpit nhận SMTP ở `1025`, giao diện tại `8025`.

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

Seed idempotent: lớp 12A14, `nguyen.van.an` trong lớp, `bui.hamy` ngoài lớp, đề “Khói nhà máy…” khác đề thơ mẫu, barem 4 tiêu chí. Không truncate DB người dùng.

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

`weight` là điểm tối đa. Tổng weight = maxScore. Không bắt buộc 4.0. Dấu phẩy thập phân Việt Nam (`2,5`) được chấp nhận. Mức điểm 0 hợp lệ.

### Import tài liệu (DOCX / PDF / XLSX / TXT)

`POST /api/teacher/documents` multipart field `file` (không JSON). Chuyển Markdown bằng MarkItDown cục bộ (`markitdown[pdf,docx,xlsx]`, `enable_plugins=False`). Bytes gốc lưu BYTEA, tải lại `GET /api/teacher/documents/{id}/original`.

Hỗ trợ: DOCX, PDF có lớp văn bản, TXT/Markdown, XLSX. Giới hạn mặc định 8MB; `IMPORT_MIN_TEXT_CHARS=40`. PDF scan/rỗng: trạng thái `NEEDS_OCR`, giữ file gốc, không phân tích đoán nội dung. OCR chữ viết tay của học sinh là luồng nộp bài riêng (`prompts/ocr/transcribe-page.v1.md`), không dùng cho import PDF scan.

Sau convert, agent (cùng adapter/provider hiện tại, prompt `document-extract.v1`, `IMPORT_AI_MAX_OUTPUT_TOKENS=4096`) tách ngữ liệu / yêu cầu viết đầy đủ / tóm tắt / barem. Giáo viên rà soát rồi `POST .../confirm`. Barem vào kho; chọn khi tạo bài tập. Snapshot bài đã giao dùng yêu cầu đầy đủ.

## Kiểm thử

```bash
cd backend
export DATABASE_URL_TEST=postgresql://edulit:edulit_dev@localhost:5434/edulit_auth_test
uv run pytest
```

Thiếu `DATABASE_URL_TEST` thì pytest dừng, không dùng database dev.

## CLI vận hành

```bash
uv run python -m app.cli bootstrap-teacher
uv run python -m app.cli reset-teacher-password --i-understand
uv run python -m app.cli cleanup-expired
uv run python -m app.cli outline-prep-worker
uv run python -m app.cli ocr-worker
uv run python -m app.cli assessment-worker
```

API process gắn bốn worker: outline (`OUTLINE_PREP_WORKER_ENABLED`), OCR (`OCR_WORKER_ENABLED`), chấm/phân tích lớp (`ASSESSMENT_WORKER_ENABLED`) và khởi tạo hồ sơ viết (`WRITING_PROFILE_AUTO_ENABLED`); mặc định đều bật, trừ khi `APP_ENV=test`. Ba worker đầu dùng helper `app/workers/_loop.py`; profile dùng sweep riêng và backoff trong bộ nhớ. Chỉ chạy CLI worker nếu tách process và tắt cờ tương ứng trong API. Chưa có CLI riêng cho writing profile. Chấm dùng `ASSESSMENT_MODEL` (trống thì kế thừa `AI_MODEL`). Migration hiện tới `0019_drop_material_status_enum`.

`reset-teacher-password` chỉ dành người vận hành; thu hồi mọi phiên của giáo viên.

## Compose đầy đủ

Từ thư mục repository:

```bash
docker compose -f infra/docker/compose.auth.yml up --build
```

Gồm PostgreSQL (host `5434`), Mailpit (`1025`/`8025`), API (`4000`), frontend (`3000`). Không đặt `container_name` cố định.

Dockerfile API đã chạy `alembic upgrade head` trước Uvicorn. Bootstrap giáo viên idempotent có thể chạy từ container đang hoạt động:

```bash
docker compose -f infra/docker/compose.auth.yml exec api python -m app.cli bootstrap-teacher
```

## Production

`Settings.validate_runtime` yêu cầu `APP_ORIGIN` HTTPS, cookie Secure, `DATABASE_URL` không rỗng và `BOOTSTRAP_TEACHER_PASSWORD` khác mật khẩu prototype khi `APP_ENV=production`. Kiểm tra SMTP thật chỉ chạy nếu không có Resend/Brevo/Gmail webhook và `AUTO_VERIFY_STUDENT=false`; không nên diễn giải cờ này thành cổng xác minh khi đăng ký. Cấu hình gửi email cần phù hợp luồng quên mật khẩu đang dùng.

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

`AI_PROVIDER` hỗ trợ `openai`, `gemini`, `fake`; Gemini dùng `GEMINI_API_KEY` và adapter REST, fake phục vụ kiểm thử. Provider mặc định trong Settings là `openai`, `AI_MODEL` mặc định trống. OCR, chấm và profile có model override riêng.

Migration: `0002_socratic_schema`, `0003_socratic_reservation_access`, rồi `0004_socratic_outline_backfill` (backfill `outline_version`, chuẩn hoá ACCEPTED cũ). Không tự chạy trên DB development/production trong test.

### Seed demo (development/test)

Seed tối thiểu:

```bash
cd backend
uv run python scripts/seed_demo.py
```

Tạo giáo viên `dang.loan`, học sinh `nguyen.van.an`, đề `VAN12-NLXH-SOC` và **cấp assignment_access**. Mã đề chỉ để tra cứu, không phải quyền truy cập.

Seed lớp đầy đủ nằm ở `scripts/seed_classroom_demo.py`, đọc [backend/demo/](demo/) gồm `roster_11a14.json`, `submissionsManifest.ts` và `submissions/`. Tên file giữ dấu mốc 11A14; lớp được seed hiện là **12A14**. Manifest vẫn ở định dạng TypeScript và được script parse; chưa chuyển thành JSON thuần.

```bash
# Từ backend/, xem trước rồi áp dụng trên database demo đã chọn
.venv/bin/python scripts/seed_classroom_demo.py --dry-run
.venv/bin/python scripts/seed_classroom_demo.py --apply
```

Thứ tự nguồn dữ liệu: `DEMO_DATA_ROOT` (thư mục chứa trực tiếp ba mục trên), rồi `DEMO_FRONTEND_ROOT` (bố cục frontend cũ, chỉ để tương thích), rồi mặc định `backend/demo/`. Image API copy `backend/demo/` vào `/app/demo` và đặt `DEMO_DATA_ROOT=/app/demo`. Revision `0013` vẫn giữ nguyên, gọi helper seed với nguồn dữ liệu mới; không cần cây frontend trong image. Script lớp không gọi AI, tạo/cập nhật 41 học sinh, bài nộp đã xác nhận, điểm đã công bố và insight cache.

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
export DATABASE_URL_TEST=postgresql://edulit:edulit_dev@localhost:5434/edulit_auth_test
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
