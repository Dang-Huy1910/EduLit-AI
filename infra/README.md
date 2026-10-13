# Hạ tầng triển khai

Kiến trúc MVP chọn PostgreSQL 17, frontend Next.js và backend NestJS chạy hai tiến trình API/worker; pg-boss dùng schema riêng trong PostgreSQL. Tham khảo [system design](../docs/architecture/system-design.md#9-triển-khai-theo-môi-trường) và [ADR-0001](../docs/architecture/decisions/0001-mvp-stack.md).

| Môi trường | Hạ tầng đích |
| --- | --- |
| Development | Docker Compose cho PostgreSQL; frontend/API local bằng npm; hoặc `--profile app` chạy cả Nest/Next trong Compose |
| Staging | Container API/worker/frontend, database và GCS bucket riêng, credentials riêng |
| Pilot production | VM container có HTTPS reverse proxy, PostgreSQL managed, GCS, secret manager, backup/cleanup |

Worker phải thường trú để nhận job; không xử lý lâu bên trong Next.js route handler hoặc dựa vào lifecycle của serverless request. File production không lưu bền vững trong filesystem container. API và frontend cùng origin, `/api/v1` proxy tới NestJS; migration chạy một lần trước rollout.

## Docker (dev)

Chi tiết lệnh: [docs/deployment/docker.md](../docs/deployment/docker.md).

| File | Việc |
| --- | --- |
| `docker/compose.database.yml` | Chỉ Postgres 17 — `npm run db:up` |
| `docker/compose.yml` | Postgres + profile `app` (API + Web) |
| `docker/Dockerfile.api` / `Dockerfile.web` | Multi-stage Node 24 |
| `docker/.env.example` | Biến mẫu cho Compose |

Cổng host Postgres mặc định **5433**. Volume `edulit_pg_data`. Không đặt `container_name` cố định.

`environments/development`, `staging`, `production` dành cho cấu hình khác biệt giữa các môi trường (bổ sung sau).

Chỉ commit template và cấu hình không chứa secret. Credentials cấp qua môi trường triển khai. Lệnh bảo trì: `scripts/maintenance/`.
