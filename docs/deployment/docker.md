# Docker — EduLit-AI

Ngày: 13/10/2026. Phạm vi: development / onboard đồng đội. Staging/production vẫn cần reverse proxy HTTPS, secret manager và managed Postgres (xem [infra/README](../../infra/README.md)).

## Cấu trúc

| File | Vai trò |
| --- | --- |
| `infra/docker/compose.postgres.yml` | Định nghĩa Postgres 17 dùng chung |
| `infra/docker/compose.database.yml` | Chỉ Postgres — `npm run db:up` |
| `infra/docker/compose.yml` | Postgres + profile `app` (API Nest + Web Next) |
| `infra/docker/Dockerfile.api` | Multi-stage Nest (`node:24-bookworm-slim`) |
| `infra/docker/Dockerfile.web` | Multi-stage Next standalone |
| `infra/docker/api-entrypoint.sh` | `prisma migrate deploy` rồi `node dist/main.js` |
| `.dockerignore` | Context build từ root repo |

## Chỉ database (khuyến nghị khi code local)

```bash
cd backend
cp .env.example .env   # nếu chưa có
npm run db:up          # compose.database.yml, cổng host 5433
npm run db:setup       # generate + migrate + seed
```

Nest và Next vẫn chạy bằng `npm run dev` trên máy.

## Full stack trong Compose

```bash
cd backend
# .env cần POSTGRES_*, DEV_SEED_PASSWORD, APP_ORIGIN, AI_* (mock được)
docker compose --env-file .env -f ../infra/docker/compose.yml --profile app up -d --build
```

- Web: http://localhost:3000  
- API: http://localhost:4000/api/health  
- Trong container API, `DATABASE_URL` trỏ `postgres:5432` (compose gắn sẵn).  
- `NEXT_PUBLIC_API_BASE_URL` phải là URL **trình duyệt** (`http://localhost:4000/api`), không dùng hostname `api`.

Seed (trên host, sau khi Postgres/API đã lên):

```bash
cd backend && npm run prisma:seed
```

## Health

- Postgres: `pg_isready`  
- API: `GET /api/health` → `{ "ok": true }` (không cần session)  
- Web: `GET /`  

## Ghi chú

- Không commit `.env` / API key.  
- Volume `edulit_pg_data` và `edulit_api_uploads` giữ dữ liệu giữa các lần up.  
- Image API chạy user `node`, migration mặc định bật (`RUN_MIGRATIONS=1`).  
- Frontend dùng `output: "standalone"` trong `next.config.ts` cho image gọn.
