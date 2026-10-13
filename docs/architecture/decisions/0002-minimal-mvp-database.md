# ADR-0002 — Database MVP tối giản

- Ngày: 13/10/2026.
- Trạng thái: chấp nhận cho nhánh `feat/database`.
- Phạm vi: data layer thí điểm; chưa có HTTP CRUD, đăng nhập, chatbot hay gọi Gemini.
- Bổ sung, không thay thế: [ADR-0001](0001-mvp-stack.md), [data-model.md](../data-model.md).

## Bối cảnh

[data-model.md](../data-model.md) mô tả nền tảng đầy đủ (trường/lớp, revision học liệu, OCR, outbox, analytics). Người dùng thống nhất MVP nhỏ hơn: nhập học liệu/bài viết bằng văn bản, Socratic, chấm rubric và hồ sơ văn phong. OCR, PDF/DOCX, dashboard, queue/outbox và nhiều trường để sau.

## Quyết định

1. Chín bảng nghiệp vụ: `users`, `auth_sessions`, `assignments`, `socratic_sessions`, `chat_messages`, `submissions`, `assessments`, `writing_observations`, `writing_profiles`. Không tạo bảng School, Classroom, FileAsset, Material, RubricVersion, Outbox, AiRun.
2. PostgreSQL 17 và Prisma ORM **7.10.0** (`prisma`, `@prisma/client`, `@prisma/adapter-pg` cùng patch). Workflow Prisma 7: URL trong `prisma.config.ts`, client ESM + driver adapter `pg`, `migrate dev` khi phát triển, `migrate deploy` khi test/deploy. Không dùng `db push` làm cách triển khai.
3. Rubric nằm JSONB trên `assignments`. Kết quả chấm và hồ sơ dùng snapshot đã đóng băng; không lấy rubric mới nhất để chấm bài cũ.
4. UUID nội bộ; timestamp `timestamptz` UTC; điểm `numeric`/Decimal; offset evidence UTF-16 theo `String.slice` của JS/TS, khoảng `[start, end)`.
5. Foreign key `ON DELETE RESTRICT`. Không cascade xóa bài/hồ sơ theo user. Session token có vòng đời riêng.
6. Cột `assessments.student_id` được denormalize và khóa kép với submission để observation không thể gán nhầm học sinh. Đây là cột toàn vẹn, không phải bảng thứ mười.
7. Tài khoản cấp sẵn, một giáo viên và nhóm học sinh cố định. Quyền chi tiết do backend quản lý sau; database không thay thế authorization.
8. Local Compose dùng user bootstrap (tạo DB/schema). Môi trường thật: role ứng dụng không phải superuser, chỉ quyền trên schema nghiệp vụ.
9. Điểm `numeric(8,2)`: từ chối input không biểu diễn đúng hai chữ số thập phân; không làm tròn âm thầm. CHECK `total_score <= max_score`.
10. Nộp bài chỉ khi đề `PUBLISHED`. `dueAt` là thông tin, không chặn nộp trong MVP. Nộp kèm `socraticSessionId` dùng `contextSnapshot` của phiên; nộp không session dùng hàng assignment hiện tại. Cả hai đường đóng băng trong transaction có khóa hàng.
11. Ghi observation/profile khóa hàng `users` của học sinh trước, để hai assessment đồng thời không mất dữ liệu khi tạo profile lần đầu.
12. Retry trích xuất không đổi `INVALIDATED`/`RESOLVED`. Đổi vòng đời qua `setObservationStatus`. `RESOLVED` là lịch sử/tiến bộ, không đưa vào nhu cầu luyện hiện tại.

## Phạm vi cố ý để sau

OCR/ảnh/file, PDF/DOCX, revision học liệu riêng, FSM Socratic bốn bước, nộp lại, nhiều lần chấm, queue/pg-boss/outbox, embeddings, Redis, nhiều trường/lớp, dashboard/heatmap, HTTP/auth, gọi `gemini-2.5-flash`.

## Hệ quả

- Cộng sự xây API trên schema này; mọi thay đổi breaking cần migration mới, không sửa migration đã apply.
- Hồ sơ chỉ đọc assessment `PUBLISHED`. Điểm AI_DRAFT chưa phải điểm chính thức.
- Snapshot bảo toàn lịch sử khi giáo viên sửa đề sau khi học sinh đã nộp hoặc đã mở phiên.
