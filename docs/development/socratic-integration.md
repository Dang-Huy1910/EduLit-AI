# Socratic integration — bàn giao

Ngày: 13/10/2026. **Trạng thái: đã triển khai trên `feat/socratic-integration` (base `feat/socratic` @ `2ae044d`).** Prompt: [Grok — feat/socratic-integration](../../prompts/grok-socratic-integration.md).

Học sinh đăng nhập cookie session → danh sách đề `PUBLISHED` → mở/khôi phục phiên Socratic → chat → lưu dàn ý → refresh đọc lại từ PostgreSQL. Đổi tài khoản không lẫn lịch sử. Use case, guardrail và adapter Gemini giữ nguyên từ [bàn giao Socratic](socratic-handoff.md).

Công nghệ: NestJS 11 ESM trên backend hiện có, Prisma 7 / PostgreSQL 17, Next.js 15, cookie HttpOnly. Zustand chỉ giữ UI/draft theo `userId` + `sessionId`. Gemini `gemini-2.5-flash` chỉ gọi từ backend.

## Routes và DTO thực tế

Prefix `/api`. Mutation (kể cả login/logout) chỉ nhận `Content-Type: application/json` và `Origin` đúng `APP_ORIGIN`. Actor luôn lấy từ session, không từ body.

| Method | Route | Input | Kết quả |
| --- | --- | --- | --- |
| POST | `/auth/login` | `{ loginId, password }` | `{ user }` + cookie |
| GET | `/auth/me` | cookie | `{ id, loginId, displayName, role }` |
| POST | `/auth/logout` | `{}` | `{}`, revoke session, clear cookie |
| GET | `/assignments` | cookie học sinh | mảng đề `PUBLISHED` |
| GET | `/assignments/:assignmentId` | cookie học sinh | đề + rubric + học liệu |
| POST | `/assignments/:assignmentId/socratic-sessions` | `{}` | `SocraticSessionView` + `resumed` |
| GET | `/socratic-sessions/:sessionId` | cookie chủ phiên | phiên, snapshot, messages, outline |
| PUT | `/socratic-sessions/:sessionId/outline` | `{ outline, expectedOutlineRevision }` | `{ sessionId, outline, outlineRevision }` |
| POST | `/socratic-sessions/:sessionId/turns` | `{ requestId, expectedLastSequence, message }` | cặp message + revisions |

Login:

```json
{
  "user": {
    "id": "uuid",
    "loginId": "bui.hamy",
    "displayName": "Bùi Hà My",
    "role": "STUDENT"
  }
}
```

`GET /auth/me` trả cùng shape user (không bọc `user`). `role` là `STUDENT` \| `TEACHER`. Không trả `passwordHash`, `tokenHash`, raw token.

List đề (mỗi phần tử):

```json
{
  "id": "uuid",
  "code": "VAN12-NLXH-SOC",
  "title": "...",
  "instructions": "...",
  "genre": "NLXH",
  "gradeLevel": 12,
  "maxScore": "10.00",
  "scoreStep": "0.25",
  "status": "PUBLISHED",
  "publishedAt": "2026-10-12T00:00:00.000Z",
  "dueAt": null,
  "rubric": { "criteria": [{ "criterionId": "C1", "name": "Bố cục", "weight": "4.00" }] },
  "submission": null,
  "socraticSession": { "sessionId": "uuid", "status": "ACTIVE" }
}
```

Detail thêm `learningMaterialText`. `submission` / `socraticSession` chỉ của actor. Decimal là string, date là ISO.

`SocraticSessionView` (open/get):

```json
{
  "sessionId": "uuid",
  "studentId": "uuid",
  "assignmentId": "uuid",
  "status": "ACTIVE",
  "assignmentStatus": "PUBLISHED",
  "hasSubmission": false,
  "resumed": false,
  "snapshot": { "code": "VAN12-NLXH-SOC", "title": "...", "rubric": {}, "maxScore": "10.00" },
  "messages": [
    {
      "id": "uuid",
      "sequence": 1,
      "role": "USER",
      "content": "...",
      "requestId": "uuid",
      "createdAt": "2026-10-13T00:00:00.000Z"
    }
  ],
  "outline": { "sections": [{ "id": "open", "title": "Mở bài", "points": ["Đặt vấn đề"] }] },
  "outlineRevision": 1,
  "lastSequence": 2
}
```

`resumed` chỉ có trên POST open. GET không gồm `resumed`. Snapshot là bản đóng băng lúc mở phiên.

Turn:

```json
{
  "sessionId": "uuid",
  "requestId": "uuid",
  "userMessage": { "id": "uuid", "sequence": 1, "role": "USER", "content": "...", "requestId": "uuid", "createdAt": "..." },
  "assistantMessage": { "id": "uuid", "sequence": 2, "role": "ASSISTANT", "content": "...", "requestId": "uuid", "createdAt": "..." },
  "responseMode": "model",
  "promptVersion": "socratic.v1",
  "model": "fake-socratic",
  "lastSequence": 2,
  "outlineRevision": 1
}
```

`requestId` là UUID. Retry cùng `requestId` + cùng nội dung trả replay, không tạo lượt mới.

### Lỗi `{ error: { code, message } }`

| HTTP | code | Khi nào |
| --- | --- | --- |
| 400 | `VALIDATION` | DTO sai, field thừa (`actor`/`studentId`/`role`) |
| 400 | `JSON_REQUIRED` | Mutation không phải JSON |
| 400 | `OUTLINE_INVALID` / `CHAT_CONTENT` | Outline hoặc nội dung chat không hợp lệ |
| 401 | `AUTH_CREDENTIALS` | Sai loginId/password |
| 401 | `AUTH_INVALID` | Thiếu/hết hạn/revoked cookie |
| 403 | `CSRF_ORIGIN` | Origin thiếu/null/sai |
| 403 | `FORBIDDEN_ROLE` | Giáo viên gọi API học sinh; không phải STUDENT |
| 403 | `ACCOUNT_INACTIVE` | User `INACTIVE` |
| 404 | `NOT_FOUND` | Đề/phiên không có, DRAFT, hoặc khác chủ |
| 409 | `OUTLINE_VERSION` | `expectedOutlineRevision` lệch |
| 409 | `TURN_CONFLICT` | `expectedLastSequence` lệch |
| 409 | `REQUEST_ID_CONFLICT` | Cùng `requestId` khác nội dung |
| 409 | `SESSION_ASSIGNMENT` / `SESSION_CLOSED` | Đề CLOSED, không mở phiên mới |
| 409 | `SESSION_COMPLETED` / `SESSION_SUBMITTED` | Phiên xong hoặc bài đã nộp |
| 413 | `CONTEXT_TOO_LARGE` | Ngữ liệu/dàn ý vượt ngân sách |
| 429 | `AUTH_RATE_LIMIT` | Quá số lần login sai (in-process) |
| 429 | `RATE_LIMITED` | Provider/use case rate limit |
| 503 | `PROVIDER_UNAVAILABLE` | Gemini/key/model |
| 504 | `PROVIDER_TIMEOUT` | Hết thời gian chờ provider |
| 500 | `INTERNAL` | Lỗi không mong đợi; không trả stack/prompt/secret |

Pilot chưa có membership: học sinh `ACTIVE` đọc mọi đề `PUBLISHED`. Đề CLOSED không mở bằng POST; GET phiên đã sở hữu vẫn đọc lịch sử.

## Auth, cookie, CORS

- Login Argon2id; token 32 byte `base64url`; DB lưu SHA-256; raw token chỉ trong cookie `edulit_session`.
- Cookie host-only (không `Domain`), `Path=/`, `HttpOnly`, `SameSite=Lax`. `Secure` khi `NODE_ENV=production` trừ khi `COOKIE_SECURE=false`. Dev HTTP: `COOKIE_SECURE=false`.
- TTL: `SESSION_TTL_SECONDS` (mặc định 7 ngày). Logout revoke trên DB và `clearCookie` cùng thuộc tính.
- CORS: `origin = APP_ORIGIN`, `credentials: true`. Frontend `credentials: 'include'`. Local dùng `localhost` cho cả hai cổng, không trộn `127.0.0.1`.
- CSRF: Origin exact match + JSON-only. OPTIONS preflight được phép. SameSite hỗ trợ thêm, không thay Origin check.

## Cấu hình hai trục

| Frontend `NEXT_PUBLIC_DATA_MODE` | Backend `AI_MODE` | Ý nghĩa |
| --- | --- | --- |
| `mock` | Không dùng | Prototype Zustand; không chứng minh HTTP/DB |
| `api` | `mock` | Auth/HTTP/DB thật, FakeSocraticAi; kiểm thử mặc định |
| `api` | `live` | Gọi `gemini-2.5-flash` bằng `GEMINI_API_KEY` chỉ ở backend |

```bash
# backend/.env
PORT=4000
APP_ORIGIN=http://localhost:3000
AI_MODE=mock
COOKIE_SECURE=false
SESSION_COOKIE_NAME=edulit_session

# frontend/.env.local
NEXT_PUBLIC_DATA_MODE=api
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api
```

Không đưa `GEMINI_API_KEY` hay `DEV_SEED_PASSWORD` vào `NEXT_PUBLIC_*`.

## Chạy local

```bash
# 1. Database (một lần)
cd backend
cp .env.example .env   # điền password/URL
npm install
npm run db:setup

# 2. API
AI_MODE=mock npm run dev
# http://localhost:4000/api

# 3. Frontend API mode
cd frontend
cp .env.example .env.local
# NEXT_PUBLIC_DATA_MODE=api
npm install
npm run dev
# http://localhost:3000
```

Production-like: `cd backend && npm run build && npm run start:prod`. SIGTERM đóng HTTP, Prisma và pg pool, thoát 0.

## Test tay trên UI

1. `NEXT_PUBLIC_DATA_MODE=api`, backend `AI_MODE=mock`.
2. Đăng nhập `bui.hamy`, mật khẩu = `DEV_SEED_PASSWORD` trong `backend/.env` (không điền sẵn trên form).
3. Mở mã **VAN12-NLXH-SOC**. Không dùng **VAN12-NLXH-01** (Bùi Hà My đã nộp, phiên chỉ đọc).
4. Gửi ý tưởng, nhận câu hỏi gợi mở, thêm ý vào dàn ý, bấm **Lưu dàn ý**.
5. Refresh: chat và dàn ý còn từ PostgreSQL.
6. Hai tab: tab 1 lưu dàn ý, tab 2 lưu bản khác → banner conflict, draft tab 2 được giữ.
7. Đăng xuất, đăng nhập `nguyen.an`, mở cùng mã đề → không thấy chat/dàn ý của Hà My.

Tài khoản seed: `bui.hamy`, `nguyen.an` (học sinh), `dang.loan` (giáo viên — API học sinh trả 403). Live Gemini: `AI_MODE=live` + `GEMINI_API_KEY`; không chạy trong unit/HTTP/Playwright. Thiếu key/quota thì báo chưa kiểm chứng, giữ `gemini-2.5-flash`.

## Kiểm tra tự động

```bash
cd backend
npm run typecheck
npm test                 # unit, không cần DB
npm run test:db          # DB test + HTTP integration, bắt buộc DATABASE_URL_TEST
npm run test:dist        # build dist, login HTTP, SIGTERM exit 0

cd frontend
npm run typecheck
npm run build
# Cần API đang chạy AI_MODE=mock trên :4000 và DEV_SEED_PASSWORD
npx playwright install chromium
npm run test:e2e
```

Playwright nạp `backend/.env` (không in secret), bật `NEXT_PUBLIC_DATA_MODE=api`, không mock fetch thành công. Timeout chat 90s > budget backend.

`npm run lint` (`next lint`) hiện deprecated trên Next 15.5, hỏi cấu hình ESLint tương tác và không chạy được. Feature này không thêm ESLint; `next build` đã typecheck.

## Giao diện API mode

- Login: nút 1-click seed (`dang.loan`, `bui.hamy`, `nguyen.an`) gọi `POST /api/auth/demo-login`; mật khẩu lấy `DEV_SEED_PASSWORD` ở backend, không đưa ra bundle. Tắt khi `NODE_ENV=production`. Form nhập tay vẫn dùng.
- Assignments: UUID thật, mã `VAN12-NLXH-SOC`, rubric/học liệu từ API. Không bịa lớp/trường/điểm.
- Socratic: POST open hoặc GET `?sessionId=`; retry cùng `requestId`; pending bubble không tăng `lastSequence`; conflict dàn ý giữ draft; chat khóa khi dirty/saving/COMPLETED/CLOSED/đã nộp.
- Logout gọi server, xóa draft `localStorage` theo user, về `/login`.
- Teacher CRUD, nộp bài, OCR, kết quả, báo cáo, chatbot độc lập, FloatingChatWidget: panel “chưa triển khai” hoặc ẩn. Mock mode giữ prototype đầy đủ.

## File chính

Backend: `src/main.ts`, `src/http/*`, `src/modules/identity/*`, `src/modules/assignments/application/query-student-assignments.ts`, `src/modules/assignments/presentation/*`, `src/modules/socratic/presentation/*`, `tests/integration/http-*.test.ts`, `tests/http-dist.test.ts`.

Frontend: `src/lib/data-mode.ts`, `src/lib/api/*`, `src/lib/api-auth-store.ts`, `src/lib/socratic-draft.ts`, `src/features/identity/ApiLoginPage.tsx`, `src/features/assignments/ApiStudentAssignmentsView.tsx`, `src/features/socratic/ApiSocraticView.tsx`, `src/components/AuthGate.tsx`, `tests/e2e/socratic-integration.spec.ts`.

## Phạm vi chưa có API

Teacher CRUD/giao đề, nộp bài/chấm/công bố điểm, OCR/upload, dashboard/báo cáo lớp, membership nhiều trường/lớp, đăng ký/quên mật khẩu, streaming, queue/Redis, RAG, trích xuất văn phong từ chat. Feature tiếp theo: `feat/assessment`, rồi `feat/writing-profile`.
