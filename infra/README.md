# Hạ tầng triển khai

`docker/` dành cho Dockerfile và cấu hình container sau khi xác định ứng dụng cần chạy. `environments/development`, `staging`, `production` dành cho cấu hình khác biệt giữa các môi trường.

Chỉ commit template và cấu hình không chứa secret. Credentials và giá trị cấu hình nhạy cảm được cấp qua môi trường triển khai. Tài liệu vận hành nằm trong `docs/deployment/`; lệnh hỗ trợ bảo trì nằm trong `scripts/maintenance/`.

Hiện chưa có container, dịch vụ, tài nguyên cloud hoặc môi trường được triển khai.
