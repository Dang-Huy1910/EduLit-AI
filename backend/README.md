# Backend — data layer MVP

Backend đích vẫn là NestJS/TypeScript. **Hiện có data layer** (PostgreSQL 17, Prisma ORM 7.10.0) **và application Socratic** (adapter Gemini 2.5 Flash, guardrail, lưu lượt chat, CLI demo). Chưa có HTTP server, controller, auth endpoint hay worker.

Đọc [ADR-0002](../docs/architecture/decisions/0002-minimal-mvp-database.md), [minimal-database.md](../docs/architecture/minimal-database.md) và [database-handoff.md](../docs/development/database-handoff.md).

## Yêu cầu

- Node.js 24 LTS (`backend/.nvmrc`), npm 10+
- Docker Engine + Compose v2 (PostgreSQL)
- Không dùng lockfile frontend; mọi lệnh database chạy với cwd `backend/`

## Setup từ clone sạch

```bash
cd backend
cp .env.example .env
# Sửa POSTGRES_PASSWORD, DATABASE_URL, DATABASE_URL_TEST, SHADOW_DATABASE_URL, DEV_SEED_PASSWORD
npm install
npm run db:up
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
npm run db:check
```

Compose: `infra/docker/compose.database.yml`. Cổng host mặc định **5433** (tránh đụng PostgreSQL sẵn có trên 5432), đổi bằng `POSTGRES_PORT`. Volume `edulit_pg_data`. Không đặt `container_name` cố định.

Lần đầu volume trống, init script tạo thêm `edulit_test` và `edulit_shadow`. Local bootstrap user có quyền tạo DB; môi trường thật dùng role ứng dụng không phải superuser.

## Scripts

| Script | Việc |
| --- | --- |
| `npm run db:up` | `docker compose … up -d --wait` |
| `npm run prisma:validate` | `prisma validate` |
| `npm run prisma:generate` | sinh client vào `src/generated/prisma` |
| `npm run prisma:migrate:dev` | tạo/apply migration (dev, cần shadow DB) |
| `npm run prisma:migrate:deploy` | apply migration (test/deploy) |
| `npm run prisma:seed` | seed giả lập, idempotent |
| `npm run db:check` | kiểm tra kết nối; không in URL/password |
| `npm run db:setup` | up + generate + deploy + seed |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | compile `src/` |
| `npm test` | unit tests (không cần DB) |
| `npm run test:db` | migrate DB test rồi chạy integration; bắt buộc `DATABASE_URL_TEST` |
| `npm run test:dist` | build rồi kiểm tra prompt assets trong `dist/` từ cwd khác |
| `npm run socratic:demo` | CLI mở phiên / gửi lượt / lưu dàn ý (mặc định `AI_MODE=mock`) |
| `npm run socratic:live-smoke` | opt-in gọi `gemini-2.5-flash`; nạp `.env` cwd; cần `SOCRATIC_LIVE=1` hoặc `--live` và `GEMINI_API_KEY` |

Không dùng `prisma db push` làm cách triển khai. Không `migrate reset` trên DB đang có dữ liệu. Gemini lỗi không được đổi thành fake thành công. Key chỉ đọc `GEMINI_API_KEY`.

## Seed

Một giáo viên (`dang.loan`), hai học sinh (`bui.hamy`, `nguyen.an`), hai đề rubric khác nhau, bài nộp trước/sau, assessment `PUBLISHED`, observation có evidence. Password lấy `DEV_SEED_PASSWORD`, hash Argon2id. Không phải kết quả AI thật; hồ sơ chưa hội tụ.

## Tổ chức mã

```text
prisma/schema.prisma
prisma/migrations/
src/infrastructure/database/   # Prisma client, provider Nest-shaped, check kết nối
src/modules/assignments/
src/modules/socratic/          # use cases, guardrail, prompt assets
src/infrastructure/ai/         # SocraticAiPort, Gemini adapter, fake adapter
src/modules/assessment/
src/modules/writing-profile/
src/data-layer.ts              # export helpers cho cộng sự
```

Module vẫn theo domain/application/persistence. Chưa có `presentation/`. Bàn giao Socratic: [socratic-handoff.md](../docs/development/socratic-handoff.md).
