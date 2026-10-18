# Hạ tầng triển khai

Kiến trúc MVP chọn PostgreSQL 17, frontend Next.js và backend NestJS chạy hai tiến trình API/worker; pg-boss dùng schema riêng trong PostgreSQL. Tham khảo [system design](../docs/architecture/system-design.md#9-triển-khai-theo-môi-trường) và [ADR-0001](../docs/architecture/decisions/0001-mvp-stack.md).

| Môi trường | Hạ tầng đích |
| --- | --- |
| Development | Docker Compose cho PostgreSQL; frontend/API/worker local; file riêng tư ở `var/` |
| Staging | Container API/worker/frontend, database và GCS bucket riêng, credentials riêng |
| Pilot production | VM container có HTTPS reverse proxy, PostgreSQL managed, GCS, secret manager, backup/cleanup |

Worker phải thường trú để nhận job; không xử lý lâu bên trong Next.js route handler hoặc dựa vào lifecycle của serverless request. File production không lưu bền vững trong filesystem container. API và frontend cùng origin, `/api/v1` proxy tới NestJS; migration chạy một lần trước rollout.

`docker/` dành cho Dockerfile và cấu hình container sau khi xác định ứng dụng cần chạy. `environments/development`, `staging`, `production` dành cho cấu hình khác biệt giữa các môi trường.

Chỉ commit template và cấu hình không chứa secret. Credentials và giá trị cấu hình nhạy cảm được cấp qua môi trường triển khai. Tài liệu vận hành nằm trong `docs/deployment/`; lệnh hỗ trợ bảo trì nằm trong `scripts/maintenance/`.

Compose xác thực local: [`docker/compose.auth.yml`](docker/compose.auth.yml) (PostgreSQL, Mailpit, API Python, frontend). Không dùng làm cấu hình production. Hướng dẫn: [python-auth-handoff](../docs/development/python-auth-handoff.md).
