# Lộ trình MVP tối giản theo feature

Ngày: 13/10/2026. Lộ trình này ưu tiên phạm vi nhỏ đã thống nhất; [lộ trình nền tảng đầy đủ](implementation-roadmap.md) giữ làm tham chiếu dài hạn.

Người dùng sở hữu database và pipeline AI/văn phong. Cộng sự phụ trách backend auth/CRUD và HTTP API. MVP nhập đề, học liệu, rubric và bài viết bằng văn bản; chưa làm OCR, queue, nhiều trường/lớp hoặc dashboard nâng cao.

| Thứ tự | Nhánh | Phạm vi | Trạng thái |
| --- | --- | --- | --- |
| 1 | `feat/database` | Chín bảng, migrations, helpers, evidence/profile, seed và tests | Đã triển khai; commit sửa review `0f481f0`; kiểm tra lại 13/10: typecheck, 11 unit + 17 integration tests đạt, hai migrations apply được trên DB mới |
| 2 | `feat/socratic` | Adapter Gemini 2.5 Flash, context đúng phiên, đọc profile, hỏi gợi mở, guardrail, lưu lượt chat và demo | Đã triển khai application/CLI/tests trên nhánh `feat/socratic`; live smoke và chất lượng model báo riêng |
| 3 | `feat/assessment` | Chấm bài văn bản theo snapshot rubric, validate điểm/evidence, lưu AI_DRAFT; cộng sự nối công bố điểm | Chưa triển khai |
| 4 | `feat/writing-profile` | Trích xuất observations từ bài đã công bố, evidence thật, cập nhật profile; Socratic dùng profile ở lượt sau | Chưa triển khai AI; bảng và persistence đã có từ database |

Mỗi hàng là một feature. Adapter/context/tests cùng thuộc `feat/socratic`; không tách chúng thành nhiều nhánh nhỏ. Với feature mới, tạo nhánh từ base đã chứa các feature phụ thuộc; không tự merge/push để đổi base.

## Feature hiện tại: Socratic

Application layer chạy được bằng use cases và CLI trước khi có HTTP server. Bàn giao: [socratic-handoff.md](socratic-handoff.md). Khi API được nối, actor đến từ phiên đăng nhập đã xác thực và endpoint gọi lại cùng use cases.

Chỉ đọc profile đã có; chưa trích xuất văn phong từ cuộc chat. Không đưa profile vào context chấm điểm của feature assessment.

## Điểm kiểm tra trước khi chuyển feature

- Database: migrations apply được trên DB mới, validation/constraints và các regression tests đạt.
- Socratic: hội thoại persist/resume, request chéo student bị chặn, retry/concurrency không tạo lượt trùng, output được kiểm tra trước khi trả; báo riêng kết quả gọi model thật.
- Assessment: đúng rubric snapshot, điểm và quote hợp lệ, draft khác điểm công bố; chấm không dùng profile.
- Writing profile: chỉ nguồn PUBLISHED, observations có evidence, không khôi phục nhận xét đã loại bỏ khi retry, không kết luận văn phong ổn định theo số bài cố định.

Auth/CRUD có thể chuẩn bị song song theo trách nhiệm cộng sự; không coi CLI/fake adapter là API hay chất lượng model thật đã hoàn thành.
