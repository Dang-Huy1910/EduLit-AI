# Nợ kỹ thuật đã kiểm chứng

Ngày rà: 27/10/2026. Phạm vi: đọc code trên worktree này, đối chiếu `git ls-files`. Không chạy test, không đụng database.

Lệnh kiểm tra nằm ở [CONTRIBUTING.md](../../CONTRIBUTING.md) mục «Lint, test và CI».

Mỗi mục dưới đây có vị trí `file:dòng`, mức độ, bằng chứng đã grep hoặc đọc file, và hướng xử lý. Không suy diễn chỗ chưa mở.

## Tóm tắt

| Mã | Mức | Chủ đề | Vị trí chính |
| --- | --- | --- | --- |
| TD-01 | cao | Store mock prototype vẫn vào bundle và `sessionStorage` dù UI không gọi | `frontend/src/lib/store.ts:51` |
| TD-02 | cao | Tài liệu gốc vẫn mô tả NestJS/Prisma/pg-boss như stack chưa scaffold | `README.md:96` |
| TD-03 | cao | Migration demo đọc mock TypeScript và ảnh frontend | `backend/alembic/versions/0013_classroom_demo_seed.py:35` |
| TD-04 | vừa | Ba worker lặp cùng vòng claim/lease/poll | `backend/app/workers/ocr.py:24` |
| TD-05 | vừa | LangGraph vá API nội bộ; pytest nuốt mọi `DeprecationWarning` | `backend/app/workflows/langgraph_compat.py:7` |
| TD-06 | vừa | Khung `backend/src` Nest chỉ còn `.gitkeep` nhưng vẫn là chỗ CONTRIBUTING chỉ | `backend/src/core/.gitkeep` |
| TD-07 | vừa | `api-design.md` ghi prefix `/api/v1` và «chưa có server» | `docs/api/api-design.md:3` |
| TD-08 | vừa | ADR và README backend bắt xác minh email trước khi có phiên | `docs/architecture/decisions/0002-python-auth.md:15` |
| TD-09 | vừa | README frontend còn đăng nhập 1-click và lớp 12A1 | `frontend/README.md:40` |
| TD-10 | vừa | Enum `material_version_status` không gắn cột | `backend/alembic/versions/0002_socratic_schema.py:31` |
| TD-11 | vừa | Script SQL đổi lớp trùng Alembic `0015` | `scripts/sql/rename-classroom-12a14.sql:5` |
| TD-12 | thấp | File và symbol không có nơi gọi | `frontend/src/lib/mock/data.ts:15` |
| TD-13 | thấp | Thư mục placeholder chỉ `.gitkeep` | `contracts/openapi/.gitkeep` |
| TD-14 | thấp | Archive Stitch, `node_modules` Nest cục bộ, vài khai báo thừa | `prototype/stitch_edulit_ai_platform_mvp/` |
| TD-15 | thấp | Tên gói và tiêu đề API vẫn là dịch vụ auth | `backend/pyproject.toml:2` |

Mức cao: 3. Mức vừa: 8. Mức thấp: 4. Tổng 15 mục.

## Code không còn được gọi

### TD-01 — Store prototype vẫn được nạp và ghi session

- Mức: cao
- Vị trí: `frontend/src/lib/store.ts:51`, `frontend/src/lib/store.ts:780`, `frontend/src/lib/store.ts:810`, `frontend/src/lib/mock/submissionsManifest.ts:23`, `frontend/src/lib/mock/socraticScript.ts:220`

`useAppStore` ngoài `store.ts` chỉ đọc `currentUser`, `addToast`, `removeToast`, `sidebarCollapsed`, `toggleSidebar`. Shell lấy đúng bốn field đó tại `frontend/src/components/TeacherShell.tsx:23` và `frontend/src/components/StudentShell.tsx:30`. `frontend/src/lib/auth-store.ts:26` chỉ gọi `setUser` và `clearAuthUser`.

Các hành động prototype không có caller bên ngoài file: `setRole` (`store.ts:182`), `switchDemoUser`, `publishAssignment` (`store.ts:375`), `addMaterial`, `sendSocraticMessage` (`store.ts:557`), `loadStudentPages` (`store.ts:622`), `submitHandwrittenEssay`, `setOcrStatus`, `updateStudentGrading`. `resetDemoState` chỉ được gọi từ `window.resetEduLit` ngay trong `store.ts:810`.

`partialize` vẫn ghi `assignments`, `submittedAssignmentIds`, `outline`, `socraticMessages`, `submissions` vào khóa `edulit-app-v2` (`store.ts:780`). File store import `submissionsManifest.ts` (11 723 dòng) và `socraticScript.ts`. `sendSocraticMessage` dùng `matchSocraticBranch` (`socraticScript.ts:220`); `evaluateOutlineCoverage` (`socraticScript.ts:276`) không có chỗ gọi nào khác file đó.

Trang Socratic thật dùng `useSocraticStore`. `frontend/src/app/assignments/[id]/socratic/page.tsx:14` vẫn import `CENTRAL_ASSIGNMENT_ID` (`frontend/src/lib/mock/assignmentData.ts:3`) làm id dự phòng khi thiếu param (`page.tsx:25`). Import một hằng kéo cả module 976 dòng vào graph client.

Hướng xử lý: thu `useAppStore` lại còn user, toast và sidebar. Tách `CENTRAL_ASSIGNMENT_ID` ra file nhỏ nếu fallback còn cần. Bỏ persist các nhánh mock. Giữ `submissionsManifest.ts` và ảnh `frontend/public/submissions/` cho seed API (xem TD-03), không xóa vì UI không đọc.

### TD-12 — Symbol và file không có nơi gọi

- Mức: thấp
- Vị trí: bảng dưới

Đã tìm tên symbol trong `backend/**/*.py` và `frontend/src/**/*.{ts,tsx}`. Các dòng sau chỉ xuất hiện ở chỗ khai báo.

| Vị trí | Symbol | Bằng chứng |
| --- | --- | --- |
| `frontend/src/lib/mock/data.ts:15` | cả file (`SCHOOL_NAME`, `MOCK_*`, `computeReportMetrics`) | Không có `from '.../mock/data'` hoặc `mock/data` trong `frontend/src` |
| `frontend/src/features/socratic/index.ts:6` | barrel `export *` | Không file nào import `@/features/socratic` hoặc `socratic/index`; page import thẳng `store`, `types`, `lifecycle` |
| `frontend/src/lib/auth-user.ts:26` | `isPrototypeStudent`, `isPrototypeTeacher`, `uiRoleFromAuth` | Không caller. `mapPublicUser` tự gán role tại dòng 12 |
| `frontend/src/features/assessment/labels.ts:40` | `modeLabel` | UI dùng `modeShort` (`StatsBlocks.tsx:5`, `StatsModeToggle.tsx:5`, `InsightPanel.tsx:5`) |
| `backend/app/identity/schemas.py:63` | `LoginResponse` | Router auth không khai báo `response_model` này (`identity/router.py:87`, `POST /login`) |
| `backend/app/identity/schemas.py:67` | `MessageResponse` | Lớp cùng tên ở `api/routers/socratic.py:63` là model khác và có được dùng |
| `backend/app/identity/schemas.py:71` | `RegisterResponse` | `register` trả session, không dùng model này (`identity/service.py:138`) |
| `backend/app/identity/schemas.py:93` | `SessionListResponse` | `SessionItem` vẫn được `identity/service.py:34` dùng; wrapper list thì không |
| `backend/app/api/routers/socratic.py:284` | `FindSessionRequest` | `GET /by-assignment` lấy `assignmentCode` bằng `Query` tại dòng 299 |
| `backend/app/services/stats_engine.py:112` | `empty_distribution` | Phổ điểm được dựng tại `stats_engine.py:516` từ `SCALE10_BINS` |
| `backend/app/core/errors.py:38` | khóa `AUTH_UNVERIFIED` | Không có `raise` hoặc chuỗi `AUTH_UNVERIFIED` nào khác trong `backend/app` |
| `backend/app/config.py:140` | `ALLOW_DEMO_LOGIN` | Chỉ bị cấm khi production (`config.py:299`). Test khẳng định không có route (`tests/integration/test_auth_password_sessions.py:239` gọi `POST /api/auth/demo-login`) |

Hướng xử lý: xóa file và symbol không caller. Giữ `SessionItem`, `PublicUser`, `modeShort`, `SCALE10_BINS`. Với `ALLOW_DEMO_LOGIN` và `AUTH_UNVERIFIED`, xóa cùng tài liệu còn nhắc demo-login nếu không còn nhánh bật lại.

Route FastAPI (`get_submission`, `ask_chatbot`, …) không nằm trong danh sách này: tên hàm chỉ đứng ở decorator, vẫn được `include_router` gắn.

## Logic trùng và ràng buộc chéo

### TD-03 — Alembic demo phụ thuộc mock frontend

- Mức: cao
- Vị trí: `backend/alembic/versions/0013_classroom_demo_seed.py:1`, `backend/alembic/versions/0013_classroom_demo_seed.py:35`, `infra/docker/Dockerfile.api:24`

`upgrade()` của revision `0013` import `seed_classroom_demo.run` và đòi ba đường dẫn: `roster_11a14.json`, `submissionsManifest.ts`, thư mục `public/submissions`. Thiếu file thì raise `RuntimeError` (dòng 41).

`Dockerfile.api` copy cả ba vào image:

```text
frontend/src/lib/mock/roster_11a14.json
frontend/src/lib/mock/submissionsManifest.ts
frontend/public/submissions
```

`frontend/public/submissions` đang được track, `du` khoảng 56 MB (95 file). `submissionsManifest.ts` dài 11 723 dòng. `seed_classroom_demo.py:110` đặt `CLASS_CODE = "12A14"`, trong khi docstring revision vẫn ghi «Load 11A14 classroom demo» (`0013_classroom_demo_seed.py:1`).

Hướng xử lý: đưa roster, manifest và ảnh demo sang `backend/demo/` (hoặc JSON thuần), để Alembic không parse TypeScript của frontend. Sửa dòng mô tả 0013 cho khớp `12A14`. Không sửa revision đã apply trên database thật; chỉ đổi nguồn dữ liệu nếu thêm revision mới hoặc đổi bản copy trong image.

### TD-04 — Vòng worker chấm, OCR và outline-prep lặp lại

- Mức: vừa
- Vị trí: `backend/app/workers/ocr.py:24`, `backend/app/workers/outline_prep.py:23`, `backend/app/workers/assessment.py:22`

Ba hàm `run_*` cùng một khung: đọc concurrency/lease/poll từ settings, `claim_*` trong transaction, `asyncio.create_task` cho từng job, `asyncio.wait(..., return_when=FIRST_COMPLETED)`, nuốt lỗi claim bằng `logger.exception`, rồi `gather` khi dừng. `workers/__init__.py` không có helper dùng chung.

`writing_profile.py:77` là vòng poll `sweep_once`, không cùng khung lease. Không gộp file đó vào mục này.

Hướng xử lý: một helper nhận `claim`, `run_one` và tên log. Giữ backoff và backfill riêng của assessment (`assessment.py:46`) nằm ngoài helper.

### TD-11 — Script SQL đổi mã lớp đã có migration tương đương

- Mức: vừa
- Vị trí: `scripts/sql/rename-classroom-12a14.sql:5`, `backend/alembic/versions/0015_classroom_12a14.py:7`

Script SQL `UPDATE classrooms` từ `11A14` sang `12A14` cho giáo viên `dang.loan`. Revision `0015` làm cùng việc và ghi rõ database đã chạy script SQL thì để nguyên (`0015_classroom_12a14.py:9`). Câu SQL không có điều kiện `NOT EXISTS` mà `_rename` trong Alembic có (`0015_classroom_12a14.py:35`). Tên lớp cũng khác: script ghi `Lớp 12A14`, migration ghi `Lớp 12A14 • THPT Đan Phượng`.

`scripts/dev/` và `scripts/maintenance/` chỉ có `.gitkeep` (`git ls-files`).

Hướng xử lý: đánh dấu script SQL là đã được thay bởi `0015`, hoặc xóa khỏi cây lệnh vận hành. Không chạy lại script trên database đã upgrade.

## API và thư viện cũ

### TD-05 — LangGraph vá đường nội bộ, cảnh báo deprecation bị tắt hết

- Mức: vừa
- Vị trí: `backend/app/workflows/langgraph_compat.py:7`, `backend/pyproject.toml:65`

`langgraph_compat.py` import `langchain_core._api.deprecation.LangChainPendingDeprecationWarning` và `langchain_core.load.load.Reviver`, rồi gán `jsonplus.LC_REVIVER = Reviver(allowed_objects="core")` (`langgraph_compat.py:24`). Comment trong file nói checkpoint 3.0.1 chưa expose `allowed_objects`.

`pyproject.toml` đặt `filterwarnings = ["ignore::DeprecationWarning"]` cho toàn bộ pytest. Mọi cảnh báo deprecation của LangChain, Pydantic, SQLAlchemy đều biến mất khi chạy test.

Đã đối chiếu và không thấy nợ kiểu sau trong code đang chạy: không có `datetime.utcnow` (helper `utcnow` ở `backend/app/core/http.py:25` dùng `datetime.now(timezone.utc)`); model Pydantic dùng `field_validator` / `ConfigDict`; SQLAlchemy dùng `Mapped` và `mapped_column`. Những điểm đó không đưa vào danh sách việc cần làm.

`backend/_prompt_build.py` không phải file chết: `pyproject.toml:48` gắn `build_py`, hai dòng sau là `sdist` và `editable_wheel`, và `backend/tests/socratic/test_prompt_assets.py:14` import `sync_prompt_assets`.

Hướng xử lý: khi nâng `langgraph` / `langchain-core`, bỏ import `_api` nếu serializer public đã nhận allowlist. Thu hẹp `filterwarnings` tới warning đã biết, thay vì mọi `DeprecationWarning`.

## Cấu hình và cây thư mục thừa

### TD-06 — Khung Nest trong `backend/src` vẫn được theo dõi

- Mức: vừa
- Vị trí: `backend/src/core/.gitkeep` và 16 file `.gitkeep` khác dưới `backend/src/` (`git ls-files backend/src`)

Toàn bộ `backend/src/**` chỉ là `.gitkeep`. Không có `main.ts`, `package.json` backend, hay `backend/prisma/`. API đang chạy là `backend/app/main.py:117` (`create_app`, prefix `/api`).

`CONTRIBUTING.md:14` vẫn bảo đặt grounding ở `backend/src/modules/grounding` và Socratic ở `backend/src/modules/socratic`. Code tương ứng nằm ở `backend/app/services/` và `backend/app/workflows/`.

`backend/migrations/.gitkeep` nằm cạnh `backend/alembic/versions/` (revision `0001` đến `0018`). `docs/architecture/project-structure.md:182` vẫn nói migration tương lai thuộc `backend/prisma/migrations/`.

Hướng xử lý: xóa cây `backend/src` và `backend/migrations` khi đã sửa CONTRIBUTING và project-structure. Giữ `backend/alembic` làm chỗ migration duy nhất.

### TD-13 — Placeholder chỉ để giữ chỗ

- Mức: thấp
- Vị trí: các path `git ls-files` chỉ có `.gitkeep` hoặc README nói chưa có runner

| Path | Thực tế đã kiểm |
| --- | --- |
| `contracts/examples`, `contracts/openapi`, `contracts/schemas` | Chỉ `.gitkeep`. `contracts/README.md` là mô tả |
| `evaluations/datasets`, `evaluations/grading`, `evaluations/ocr`, `evaluations/socratic` | Chỉ `.gitkeep`. `CONTRIBUTING.md:20` nói runner evaluations chưa có |
| `tests/contracts`, `tests/e2e`, `tests/performance` | Chỉ `.gitkeep`. Test thật nằm ở `backend/tests/` và `frontend/tests/`, `frontend/src/**/__tests__/` |
| `frontend/tests/integration`, `frontend/tests/unit` | Chỉ `.gitkeep` |
| `frontend/src/features/analytics`, `features/grounding`, `features/identity` | Chỉ `.gitkeep`. Màn hình nằm ở `features/assessment`, `features/catalog`, `app/login` |
| `prompts/analytics`, `prompts/grounding` | Chỉ `.gitkeep`. Prompt đang dùng nằm ở `prompts/socratic`, `prompts/assessment`, `prompts/ocr`, `prompts/catalog` |
| `scripts/dev`, `scripts/maintenance` | Chỉ `.gitkeep` |
| `docs/deployment` | Chỉ `.gitkeep`. Compose thật là `infra/docker/compose.auth.yml` |
| `infra/environments/development`, `staging`, `production` | Chỉ `.gitkeep` |

`project-structure.md:171` nói `.github/workflows`, `infra` và `scripts` chưa có cấu hình thực thi. `infra/docker/compose.auth.yml`, `Dockerfile.api` và `Dockerfile.web` đã có. `.github/workflows/ci.yml` cũng đã có và chạy lint cùng test; CONTRIBUTING mục «Lint, test và CI» mô tả workflow đó. Câu «chưa có workflow» trong project-structure lệch với cây hiện tại.

Hướng xử lý: xóa placeholder không còn trong sơ đồ đích, hoặc một dòng trong README chỉ rõ thư mục nào là chỗ dành sẵn. Không tạo file giả cho contracts/evaluations khi chưa có schema và bộ đo.

### TD-14 — Archive Stitch, phụ thuộc Nest cục bộ, glob thừa

- Mức: thấp
- Vị trí: `prototype/stitch_edulit_ai_platform_mvp/`, `frontend/tailwind.config.ts:6`, `backend/pyproject.toml:52`

`git ls-files prototype` có 21 file (HTML, PNG, `DESIGN.md`). `du` khoảng 5 MB. `frontend/src` và `backend/app` không import đường dẫn này. Chỉ `prompts/README.md:22` và `prompts/gemini-prototype.md:5` nhắc thư mục khi dựng prototype. `README.md:136` liệt kê `DESIGN.md` ở gốc repo; file được track là `prototype/stitch_edulit_ai_platform_mvp/edulit_serene_paper/DESIGN.md`.

`backend/node_modules` không có trong `git ls-files`. Trên worktree này nó là symlink tới `backend/node_modules` của checkout chính, bên trong có `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`. Không có `backend/package.json`. `.gitignore:10` đã bỏ qua `node_modules/`, nên đây là rác cục bộ, không phải file commit.

`frontend/tailwind.config.ts:6` quét `./src/pages/**/*`. Không có thư mục `frontend/src/pages`. App Router nằm ở `frontend/src/app/`.

`pyproject.toml:52` khai báo package-data `app.ai.prompts` kèm `socratic/*.md`, rồi lặp lại từng gói `app.ai.prompts.socratic`, `catalog`, `ocr`, `assessment`.

Không thấy trên worktree và không thấy trong `git ls-files`: `backend/build`, `backend/dist`, `backend/*.egg-info`, `frontend/tsconfig.tsbuildinfo`.

Hướng xử lý: nếu archive Stitch không còn dùng để code UI, chuyển ra khỏi nhánh làm việc hoặc git-lfs/release asset. Xóa symlink `backend/node_modules` trên máy dev. Bỏ glob `src/pages` và dòng package-data lặp.

### TD-15 — Metadata vẫn gọi backend là API auth

- Mức: thấp
- Vị trí: `backend/pyproject.toml:2`, `backend/app/main.py:120`

`pyproject.toml` đặt `name = "edulit-ai-auth"` và description «identity and authentication service». `create_app` đặt `title="EduLit-AI Auth API"`. Cùng file đã `include_router` cho socratic, catalog, classrooms, assignments, submissions, assessments, chatbot, writing profile (`main.py:180`).

Hướng xử lý: đổi tên hiển thị và description cho khớp monolith hiện tại. Đổi tên distribution package chỉ khi không còn ai cài `edulit-ai-auth` từ wheel.

### TD-10 — Enum trạng thái phiên bản học liệu không được cột dùng

- Mức: vừa
- Vị trí: `backend/alembic/versions/0002_socratic_schema.py:31`, `backend/alembic/versions/0006_teacher_catalog.py:82`, `backend/app/db/models/enums.py:82`, `backend/app/db/models/catalog.py:201`

`0002` tạo PostgreSQL enum `material_version_status` (`UPLOADED`, `PRIVACY_REVIEW`, `READY`, `FAILED`). `0006` tạo `material_versions.status` kiểu `VARCHAR(16) DEFAULT 'READY'`. Model `MaterialVersion.status` là `String(16)` (`catalog.py:201`). `MaterialVersionStatus` không có chỗ import nào ngoài `enums.py:82`. Code ghi status bằng chuỗi, ví dụ `catalog_service` và `seed_demo.py:427` (`status="READY"`), `chatbot_service.py:313` (`MaterialVersion.status == "READY"`).

Hướng xử lý: hoặc gắn cột vào enum (migration mới, không sửa `0002` đã apply), hoặc thêm revision `DROP TYPE material_version_status` và xóa class Python. Không để hai nguồn giá trị.

## Tài liệu lệch với code

### TD-02 — Bộ tài liệu kiến trúc vẫn mô tả stack chưa được scaffold

- Mức: cao
- Vị trí: các dòng dưới. Code đối chiếu: `backend/pyproject.toml:7` (FastAPI, SQLAlchemy asyncio, Alembic, LangGraph), `backend/app/main.py:176` (`GET /api/health`), `backend/app/ai/adapters.py:1111` (provider `openai`, `gemini`, `fake`), `backend/app/workers/ocr.py:101` (worker trong process API, không pg-boss).

| Tài liệu | Dòng | Điều đang viết | Code hiện tại |
| --- | --- | --- | --- |
| `README.md` | 96–105 | NestJS chưa scaffold, PostgreSQL + Prisma chưa triển khai, pg-boss chưa triển khai, auth chưa triển khai, model `gemini-2.5-flash` | FastAPI đã mount router nghiệp vụ; migration Alembic tới `0018`; worker OCR/chấm/outline/profile trong `app/workers` |
| `README.md` | 146–165 | Quick start chỉ `npm install` và `npm run dev` trong `frontend/` | Backend chạy `uv` + `uvicorn` như `backend/README.md:20` |
| `CONTRIBUTING.md` | 7 | ADR-0001 mô tả NestJS cho phân hệ khác «khi được triển khai» | Các phân hệ đó đã nằm trong `backend/app` |
| `CONTRIBUTING.md` | 14 | Đặt grounding và socratic dưới `backend/src/modules` | Thư mục đó chỉ `.gitkeep` (TD-06) |
| `docs/architecture/project-structure.md` | 3, 9, 39 | «backend là khung thư mục», NestJS/Prisma/pg-boss, cây `backend/prisma` và `backend/src/main.ts` | Không có `backend/prisma`. Entrypoint là `app.main:app` |
| `docs/architecture/system-design.md` | 23–27, 48, 61 | Bảng NestJS, Prisma, pg-boss, sơ đồ `NestJS API /api/v1` | Prefix thật là `/api` (`next.config.ts:11` rewrite `/api/:path*` tới port 4000) |
| `docs/architecture/decisions/0001-mvp-stack.md` | 14–15 | Quyết định NestJS, Prisma, pg-boss, `@google/genai` | ADR chưa bị thay bằng quyết định Python cho toàn bộ API. ADR-0003 chỉ khóa Socratic |
| `docs/architecture/decisions/0002-python-auth.md` | 17 | «ADR-0001 vẫn mô tả stack NestJS cho các phân hệ khác khi được triển khai» | Catalog, OCR, chấm, chatbot, hồ sơ viết đã ở Python |
| `docs/architecture/data-model.md` | 3 | «chưa phải migration đã thực thi» | `backend/alembic/versions/` có 18 revision |
| `docs/architecture/knowledge-and-chatbot.md` | 5 | Stack đích NestJS/Prisma/pg-boss/Gemini 2.5 | Chatbot là `backend/app/api/routers/chatbot.py`, service `chatbot_service.py` |
| `docs/architecture/gemini-pipeline.md` | 3 | Thiết kế, chưa gọi API, SDK `@google/genai`, model cố định `gemini-2.5-flash` | `google-genai` có trong `pyproject.toml:14`. Factory còn openai và fake (`adapters.py:1166`) |
| `docs/development/implementation-roadmap.md` | 17–18 | M1 vẫn là scaffold NestJS và Prisma | Mốc này mô tả việc đã đi bằng stack khác |
| `infra/README.md` | 3, 11 | Backend NestJS, proxy `/api/v1` | `compose.auth.yml` build `Dockerfile.api` Python, host Postgres mặc định `5434`, database `edulit_auth` |
| `prompts/README.md` | 5 | MVP dùng Gemini 2.5 Flash cho mọi task | Settings có `AI_PROVIDER` và version prompt riêng (`config.py:63`, `config.py:72`) |
| `CONTRIBUTING.md` | 52 | «file `.env.example` tương lai» | `git ls-files` đã có `backend/.env.example` và `frontend/.env.example` |

Hướng xử lý: một ADR mới ghi nhận Python/FastAPI/SQLAlchemy/Alembic là backend mặc định, worker trong process, prefix `/api`. Sửa README gốc, CONTRIBUTING, project-structure, system-design, infra README cho khớp lệnh đang chạy. Giữ ADR-0001 như quyết định đã bị thay, ghi trạng thái superseded, không viết lại như việc chưa làm. Roadmap nên đánh dấu mốc đã có bản Python tương đương thay vì để M1 ở thì tương lai.

### TD-07 — Thiết kế API ghi chưa có server và prefix khác code

- Mức: vừa
- Vị trí: `docs/api/api-design.md:3`, `docs/api/api-design.md:11`

Dòng mở đầu: prefix `/api/v1`, «chưa có server hoặc OpenAPI thực thi». `contracts/openapi/` chỉ `.gitkeep`, phần OpenAPI vẫn đúng là chưa có file spec.

Prefix đang chạy là `/api`. Auth là `APIRouter(prefix="/auth")` (`identity/router.py:28`) gắn thêm `/api` tại `main.py:180`, thành `/api/auth/login`. Rewrite Next cùng dạng đó (`frontend/next.config.ts:11`).

Envelope lỗi thực tế là `{error: {code, message, fields?}}` (`backend/app/core/errors.py:102`). Tài liệu ghi `{error: {code, message, requestId, details?}}` (`api-design.md:11`). Không có `requestId` trong `error_body`.

Hướng xử lý: ghi lại prefix `/api` và envelope đang trả. Đánh dấu bảng endpoint nào còn là thiết kế (privacy-review, `/api/v1`) và endpoint nào đã có trong `app/api/routers` và `app/identity/router.py`.

### TD-08 — Chính sách xác minh email không khớp đăng ký

- Mức: vừa
- Vị trí: `docs/architecture/decisions/0002-python-auth.md:15`, `backend/README.md:5`, `backend/app/identity/service.py:129`

ADR-0002 quyết định «Email phải xác minh trước khi cấp phiên». `backend/README.md:5` viết học sinh tự đăng ký và phải xác minh email.

`register` tạo user tại `identity/service.py:122`, gán `email_verified_at=utcnow()` ở dòng 129, rồi `return await self._open_session(...)` ở dòng 138. Không có nhánh đọc `AUTO_VERIFY_STUDENT` trong hàm này. Cờ đó chỉ nới kiểm SMTP production (`config.py:314`). `verify_email` vẫn tồn tại (`identity/service.py:165`) nhưng đăng ký mới không đi qua cổng đó. Khóa lỗi `AUTH_UNVERIFIED` không được raise (TD-12).

Hướng xử lý: sửa ADR-0002 và đoạn mở đầu `backend/README.md` theo hành vi đăng ký hiện tại, hoặc đổi `register` để tôn trọng cờ và chặn phiên khi email chưa xác minh. Hai phía đang mâu thuẫn; cần một quyết định rồi sửa phía còn lại.

### TD-09 — README frontend mô tả prototype 1-click

- Mức: vừa
- Vị trí: `frontend/README.md:5`, `frontend/README.md:40`, `frontend/README.md:53`

README nói đây là prototype mock + Zustand, kiến trúc MVP «bổ sung API NestJS», nút 1-click «Cô Đặng Loan» và «Bùi Hà My» lớp 12A1, và nút «Khôi phục Demo (Reset)» trên header hai vai.

`frontend/src/app/login/page.tsx:13` là form `loginId` / `password` gọi `authClient.login`. Không có chuỗi `12A1`, `setRole`, hay nút 1-click trong `frontend/src/app/login`. Shell không đọc `resetDemoState` (TD-01). `frontend/src/app/error.tsx:63` còn nút «Khôi phục dữ liệu demo» nhưng nút đó xóa vài khóa storage, không gọi store reset.

Hướng xử lý: viết lại README frontend theo login thật, App Router, và lệnh ở CONTRIBUTING. Bỏ đoạn 1-click và lớp 12A1.

## Đã kiểm, không đưa vào danh sách

- `datetime.utcnow`, Pydantic v1 (`validator`, `orm_mode`, `class Config`), SQLAlchemy `session.query` / `declarative_base`: không có trong `backend/app` và `backend/scripts`.
- `next/legacy`, `getServerSideProps`, `getStaticProps`: không có. App dùng `src/app`.
- `backend/_prompt_build.py`: hook build đang được nối.
- `backend/build`, `backend/dist`, `*.egg-info`, `frontend/tsconfig.tsbuildinfo`: không tồn tại trên worktree và không được track.
