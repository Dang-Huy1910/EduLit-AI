# EduLit-AI 📚✍️

Nền tảng hỗ trợ Dạy – Học và Đánh giá môn Ngữ văn THPT theo GDPT 2018, với bối cảnh minh họa tại THPT Đan Phượng.

[Dùng thử sản phẩm](https://edu-lit-ai.vercel.app/). Trạng thái dưới đây mô tả code trong repository, không xác nhận phiên bản đang deploy.

Rà lại **2026-10-28**: frontend Next.js đã dùng API Python/FastAPI và PostgreSQL cho đăng nhập, lớp, kho học liệu, giao bài, Socratic, nộp ảnh/OCR, chấm và báo cáo. Chatbot tra cứu học liệu và hồ sơ văn phong cũng có router/service. Chất lượng AI, hiệu năng và điều kiện thí điểm vẫn cần kiểm chứng theo [roadmap](docs/development/implementation-roadmap.md).

## Chu trình sử dụng

1. Giáo viên đăng nhập bằng tài khoản được bootstrap, quản lý lớp, ngữ liệu, đề nguồn và barem. Import DOCX/PDF có chữ/XLSX/TXT qua MarkItDown rồi rà soát kết quả phân tích; PDF scan được đánh dấu cần OCR, chưa có pipeline OCR tài liệu nhập.
2. Tạo bài tập từ đề nguồn, chọn barem, người nhận và hạn nộp; giao bài tạo snapshot đề và quyền truy cập cho học sinh.
3. Học sinh tự đăng ký và nhận phiên ngay, tham gia lớp bằng mã, mở bài được giao và lập dàn ý Socratic. Backend kiểm tra quyền, phiên và guardrail trước khi trả phản hồi.
4. Học sinh viết tay, tải 1–4 ảnh, tự rà soát/che vùng riêng tư trước khi gửi. Worker OCR chép từng trang; học sinh đối chiếu, sửa và xác nhận bản chép để nộp chính thức.
5. Worker chấm theo đề/barem đã chốt và bản chép đã xác nhận. Giáo viên rà soát, điều chỉnh, công bố hoặc ẩn kết quả; học sinh chỉ thấy điểm đã công bố.
6. Giáo viên xem thống kê theo bài/nhiều bài và yêu cầu gợi ý dạy học từ số liệu server. Hồ sơ văn phong tổng hợp từ bài đã công bố, có bằng chứng; không đưa profile vào chấm điểm.

Barem có thang điểm và tiêu chí do giáo viên cấu hình; không cố định điểm mẫu hay số liệu thống kê. Che ảnh do người dùng thực hiện, không phải bảo đảm tự động phát hiện hết thông tin định danh.

## Công nghệ đang dùng

| Lớp | Công nghệ / thực trạng |
| --- | --- |
| Giao diện | Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 3, Recharts |
| Trạng thái/client | Zustand và fetch API theo feature; store chung chỉ giữ user, toast, sidebar, chỉ persist sidebar |
| API | Python 3.12, FastAPI, prefix `/api`, entrypoint `app.main:app` |
| Dữ liệu | PostgreSQL, SQLAlchemy 2 async, Alembic; revision tới `0019` |
| Tác vụ nền | OCR, outline-prep, chấm/insight và writing-profile trong process API; job/lease PostgreSQL cho ba worker đầu |
| AI | `AI_PROVIDER=openai\|gemini\|fake`, `AI_MODEL`; OpenAI SDK, Gemini REST, fake cho kiểm thử; LangGraph cho Socratic |
| Tài liệu/ảnh | MarkItDown, Pillow; bytes tài liệu/ảnh lưu trong PostgreSQL, tải qua API có kiểm tra quyền |
| Auth | Argon2id, session PostgreSQL, cookie HttpOnly, kiểm tra Origin/CSRF; đăng ký học sinh được đánh dấu xác minh và cấp phiên ngay |
| Validation | Pydantic và validator nghiệp vụ Python; `contracts/` dành sẵn cho M6 |
| Kiểm tra | Ruff/pytest, ESLint/TypeScript, Node unit tests, Playwright; CI đã có |

Quyết định hiện tại: [ADR-0004](docs/architecture/decisions/0004-python-monolith.md). [ADR-0001](docs/architecture/decisions/0001-mvp-stack.md) là lịch sử đã thay thế. Các schema xuất riêng, evaluations và triển khai thí điểm còn ở M6.

## Khởi chạy local

Cần Python 3.12 và uv cho backend; Node.js 22.7 trở lên để chạy các lệnh test frontend hiện tại, npm và Docker Compose. Lockfile: `backend/uv.lock`, `frontend/package-lock.json`. Chi tiết cấu hình và CLI ở [README backend](backend/README.md), các lệnh kiểm tra ở [CONTRIBUTING](CONTRIBUTING.md#lint-test-và-ci).

Từ gốc repository, chạy PostgreSQL và Mailpit:

```bash
docker compose -f infra/docker/compose.auth.yml up -d postgres mailpit
```

Cửa sổ backend (Compose mặc định đưa PostgreSQL ra host `5434`):

```bash
cd backend
cp .env.example .env
uv sync --extra dev
export DATABASE_URL=postgresql://edulit:edulit_dev@localhost:5434/edulit_auth
uv run alembic upgrade head
uv run python -m app.cli bootstrap-teacher
uv run uvicorn app.main:app --reload --port 4000
```

Cửa sổ frontend:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Mở `http://localhost:3000`; Next.js rewrite `/api/*` tới port `4000`. Health: `http://localhost:4000/api/health`; Mailpit: `http://localhost:8025`. Điền provider/model/key ở backend khi cần gọi AI thật; không đặt API key trong frontend. Nếu dùng PostgreSQL khác, đổi `DATABASE_URL` cho đúng host/port.

Có thể chạy cả stack container bằng `docker compose -f infra/docker/compose.auth.yml up --build` sau khi tạo `backend/.env` theo template; xem [infra](infra/README.md). Dữ liệu lớp demo ở [backend/demo/](backend/demo/), seed và biến override được giải thích trong README backend. Đăng nhập dùng tên tài khoản/email và mật khẩu đã cấp hoặc đã đăng ký.

## Cây mã chính

| Vị trí | Nội dung |
| --- | --- |
| `frontend/src/app/` | App Router: tài khoản, lớp, bài tập, kho, báo cáo, chatbot, hồ sơ |
| `frontend/src/features/` | Client API và giao diện theo nghiệp vụ |
| `backend/app/` | FastAPI, identity, services, models, workflows, workers và AI adapter |
| `backend/alembic/versions/` | Lịch sử migration PostgreSQL |
| `backend/demo/` | Roster, manifest và ảnh dùng bởi seed lớp |
| `prompts/` | Prompt runtime có phiên bản và prompt giao việc lịch sử |
| `contracts/`, `evaluations/` | Chỗ dành sẵn cho hợp đồng xuất riêng và đánh giá M6 |
| `infra/docker/`, `.github/workflows/` | Compose/Dockerfile và CI hiện có |
| `prototype/` | Archive thiết kế Stitch, chưa dọn trong đợt này |

## Tài liệu

- [SRS](SRS.md), [quy chuẩn thiết kế](prototype/stitch_edulit_ai_platform_mvp/edulit_serene_paper/DESIGN.md).
- [Cấu trúc dự án](docs/architecture/project-structure.md), [kiến trúc hệ thống](docs/architecture/system-design.md), [mô hình dữ liệu](docs/architecture/data-model.md).
- [Luồng học liệu và chatbot](docs/architecture/knowledge-and-chatbot.md), [pipeline AI](docs/architecture/gemini-pipeline.md), [API hiện có và thiết kế còn lại](docs/api/api-design.md).
- [Luồng giáo viên](docs/development/teacher-assignment-flow.md), [roadmap](docs/development/implementation-roadmap.md), [nợ kỹ thuật](docs/development/tech-debt.md), [hướng dẫn đóng góp](CONTRIBUTING.md).

Dự án phục vụ nghiên cứu và ứng dụng đổi mới giảng dạy Ngữ văn THPT. Đóng góp qua Issue/Pull Request theo CONTRIBUTING.
