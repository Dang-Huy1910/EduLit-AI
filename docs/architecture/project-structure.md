# Cấu trúc dự án EduLit-AI

Rà lại: **2026-10-28**, theo cây file được Git theo dõi và entrypoint `backend/app/main.py`. Backend Python là monolith hiện có theo [ADR-0004](decisions/0004-python-monolith.md); frontend dùng Next.js App Router.

## Cây thư mục đang dùng

```text
EduLit-AI/
├── .github/workflows/ci.yml
├── frontend/
│   ├── src/
│   │   ├── app/                    # Trang và layout App Router
│   │   ├── components/             # Shell, auth, UI dùng chung
│   │   ├── features/               # catalog, assignments, classrooms, socratic,
│   │   │                          # submission, assessment, chatbot, writing-profile
│   │   ├── lib/                    # HTTP/auth client, types, UI store
│   │   └── styles/
│   ├── public/                     # Tài nguyên giao diện công khai
│   ├── tests/                      # Playwright
│   ├── scripts/                    # Loader cho unit tests Node
│   ├── package.json
│   └── package-lock.json
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI, /api, lifespan worker
│   │   ├── config.py
│   │   ├── identity/               # Auth router/service/repository/dependencies
│   │   ├── api/routers/            # Router nghiệp vụ
│   │   ├── core/                   # HTTP, lỗi, password/token/rate limit
│   │   ├── db/models/              # SQLAlchemy models
│   │   ├── services/               # Nghiệp vụ, import, OCR, chấm, reports/profile
│   │   ├── workflows/              # Socratic LangGraph và guardrail
│   │   ├── workers/                # OCR, outline, assessment, writing profile
│   │   ├── ai/                     # Adapter, schema, prompt assets
│   │   └── email/                  # Adapter email
│   ├── alembic/versions/           # 0001–0019
│   ├── demo/                       # Roster, manifest TypeScript và submissions/
│   ├── scripts/                    # Seed dữ liệu
│   ├── tests/                      # Unit, integration, Socratic
│   ├── _prompt_build.py            # Hook đóng gói prompt
│   ├── pyproject.toml
│   └── uv.lock
├── contracts/                      # Dành sẵn M6, chưa có contract xuất riêng
├── evaluations/                    # Dành sẵn M6, chưa có dataset/runner
├── prompts/                        # socratic, catalog, ocr, assessment + lịch sử
├── docs/
│   ├── api/
│   ├── architecture/decisions/
│   └── development/
├── infra/docker/                   # Compose, Dockerfile API/web, SQL init test DB
├── prototype/                      # Archive Stitch, giữ nguyên
├── CONTRIBUTING.md
├── README.md
└── SRS.md
```

## Ánh xạ nghiệp vụ vào code

| Nghiệp vụ | Backend | Frontend |
| --- | --- | --- |
| Tài khoản/phiên | `app/identity/`, models user/session/token | `app/login/`, `app/register/`, `app/account/security/`, `lib/auth-*` |
| Lớp/học kỳ | router `classrooms.py`, `services/classroom_service.py`, models catalog | `features/classrooms/`, `app/classrooms/` |
| Học liệu/barem/import | router `catalog.py`, `catalog_service.py`, `document_import.py`, `document_convert.py` | `features/catalog/`, `app/materials/` |
| Đề/giao bài | router `assignments.py`, `assignment_service.py`, `outline_prep.py` | `features/assignments/`, `app/assignments/` |
| Socratic | router/service `socratic`, `workflows/`, `workers/outline_prep.py` | `features/socratic/`, trang `assignments/[id]/socratic` |
| Bài nộp/OCR | router `submissions.py`, `submission_service.py`, `ocr_service.py`, `workers/ocr.py` | `features/submission/`, trang `submit`, `ocr` |
| Chấm/báo cáo | router `assessments.py`, `assessment_service.py`, `assessment_jobs.py`, `stats_engine.py`, `report_service.py` | `features/assessment/`, trang `result`, `reports` |
| Chatbot tra cứu | router/service `chatbot` | `app/chatbot/`, `features/chatbot/` |
| Hồ sơ viết | router/service `writing_profile`, models `writing_profile.py`, worker cùng tên | `app/profile/`, `features/writing-profile/` |

Các đường dẫn backend trong bảng tính từ `backend/app/` trừ chỗ đã ghi `app/`. HTTP router gọi service; worker chạy service nền. Ba worker claim/lease dùng `workers/_loop.py`; writing profile sweep riêng. Đây là phân chia code hiện tại, không phải ranh giới microservice.

## Kiểm tra và dữ liệu

- Backend: `backend/tests/unit/`, `backend/tests/integration/`, `backend/tests/socratic/`; Ruff và pytest cấu hình trong `pyproject.toml`.
- Frontend: unit test tại `src/features/**/__tests__/` và `src/lib/__tests__/`; Playwright tại `frontend/tests/`. Lệnh nằm trong [CONTRIBUTING](../../CONTRIBUTING.md#lint-test-và-ci).
- `contracts/{openapi,schemas,examples}/` và `evaluations/{datasets,ocr,grading,socratic}/` là chỗ dành sẵn cho M6; chưa có schema xuất riêng, runner hay báo cáo đánh giá. Không có runner contract/e2e/performance ở gốc repo.
- Seed lớp đọc `backend/demo/` theo thứ tự override `DEMO_DATA_ROOT`, `DEMO_FRONTEND_ROOT`, mặc định. Fixture riêng nằm cạnh kiểm thử sử dụng nó. Xem [README backend](../../backend/README.md).
- Tài liệu gốc và ảnh bài nộp runtime lưu bytes trong PostgreSQL, đọc qua API có kiểm tra quyền. Tài nguyên `frontend/public/` phục vụ giao diện công khai.
- Template cấu hình: `backend/.env.example`, `frontend/.env.example`. Không commit secret.

## Hạ tầng và thay đổi tiếp theo

`.github/workflows/ci.yml` đã chạy lint/test backend và frontend, kèm frontend typecheck. `infra/docker/` có Compose PostgreSQL/Mailpit/API/web và Dockerfile; xem [infra](../../infra/README.md). Các placeholder hạ tầng, script bảo trì và feature không có nội dung đã được bỏ.

Migration duy nhất ở `backend/alembic/versions/`; không sửa revision đã áp dụng. Kiến trúc mới ghi bằng ADR, theo số trống tiếp theo. Contracts xuất riêng, evaluations và vận hành thí điểm theo [roadmap](../development/implementation-roadmap.md); mô hình thực thi ở [data model](data-model.md).
