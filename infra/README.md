# Hạ tầng triển khai

Rà lại 2026-10-28 theo [Compose](docker/compose.auth.yml), [Dockerfile API](docker/Dockerfile.api) và [Dockerfile web](docker/Dockerfile.web). Stack hiện có là PostgreSQL 17, Mailpit, FastAPI/Python 3.12 và Next.js; các worker mặc định chạy trong process API theo [ADR-0004](../docs/architecture/decisions/0004-python-monolith.md).

## Compose local

Từ gốc repo, tạo `backend/.env` theo `backend/.env.example`, rồi chạy:

```bash
docker compose -f infra/docker/compose.auth.yml up --build
```

| Dịch vụ | Host port mặc định | Ghi chú |
| --- | --- | --- |
| PostgreSQL | `5434` | DB `edulit_auth`, init script tạo DB test; volume giữ dữ liệu |
| Mailpit | `1025`, `8025` | SMTP sink và giao diện xem thư |
| API | `4000` | Health `/api/health`; nội bộ DB host `postgres:5432` |
| Web | `3000` | Rewrite `/api/*` tới API; build dùng `API_PROXY_TARGET=http://api:4000` |

Muốn chỉ chạy DB/mail cho phát triển local: thêm `up -d postgres mailpit` thay cho `up --build`; lệnh chạy backend/frontend ở [README](../README.md#khởi-chạy-local). Settings Python mặc định DB port `5433`, nên khi kết nối từ host tới Compose cần đặt `DATABASE_URL` dùng `5434`.

Dockerfile API copy **`backend/demo/` vào `/app/demo`**, đặt `DEMO_DATA_ROOT=/app/demo`; không cần copy dữ liệu từ frontend để seed. Manifest và roster giữ tên lịch sử 11A14, seed lớp hiện là 12A14. File tài liệu/ảnh runtime lưu bytes trong PostgreSQL. Image còn copy `docs/` cho hướng dẫn chatbot; prompt runtime được đóng gói vào package backend ở bước build.

CMD API chạy `alembic upgrade head` trước Uvicorn. Có thể bootstrap giáo viên qua container:

```bash
docker compose -f infra/docker/compose.auth.yml exec api python -m app.cli bootstrap-teacher
```

OCR/outline/chấm dùng job/lease PostgreSQL và helper vòng lặp; writing profile sweep riêng. Nếu tách một trong ba worker có CLI ra process riêng, cần tắt cờ worker đó trong API. Xem [README backend](../backend/README.md#cli-vận-hành).

## Phần vận hành còn lại

Compose này phục vụ local, chưa là bộ cấu hình production được kiểm chứng. HTTPS/reverse proxy cùng origin `/api`, email thật, secret riêng, backup/restore, retention, quota và cách chạy migration khi có nhiều replica cần hoàn thiện ở [M6](../docs/development/implementation-roadmap.md#m6--contracts-đánh-giá-và-thí-điểm-còn-mở). Chưa có storage GCS hoặc cấu hình môi trường staging/production thực thi trong cây repo.

Chỉ commit template không chứa secret. Hành vi kiểm cấu hình production và biến `RUN_MIGRATIONS` phải đối chiếu `backend/app/config.py`; không suy ra từ tên Compose có chữ auth rằng API chỉ phục vụ xác thực.
