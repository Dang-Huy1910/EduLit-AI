# Lộ trình MVP tối giản theo feature

Ngày: 13/10/2026. Lộ trình này ưu tiên phạm vi nhỏ đã thống nhất; [lộ trình nền tảng đầy đủ](implementation-roadmap.md) giữ làm tham chiếu dài hạn.

Người dùng sở hữu database và pipeline AI/văn phong. Phạm vi ban đầu giao backend auth/CRUD và HTTP API cho cộng sự, chỉ nhập bài bằng văn bản. Yêu cầu mới mở rộng sang năm bước có nộp ảnh/OCR và cho Codex hoàn thiện cả DB/API/UI. Chưa làm queue, nhiều trường/lớp hoặc dashboard nâng cao. Bảng dưới ghi lại các feature nền đã triển khai; không đồng nghĩa pipeline giao diện đã hoàn thành.

| Thứ tự | Nhánh | Phạm vi | Trạng thái |
| --- | --- | --- | --- |
| 1 | `feat/database` | Chín bảng, migrations, helpers, evidence/profile, seed và tests | Đã triển khai; commit sửa review `0f481f0`; kiểm tra lại 13/10: typecheck, 11 unit + 17 integration tests đạt, hai migrations apply được trên DB mới |
| 2 | `feat/socratic` | Adapter Gemini 2.5 Flash, context đúng phiên, đọc profile, hỏi gợi mở, guardrail, lưu lượt chat và demo | Đã triển khai application/CLI/tests trên nhánh `feat/socratic`; live smoke và chất lượng model báo riêng |
| 3 | `feat/socratic-integration` | Auth/HTTP tối thiểu, nối giao diện học sinh, chat/lưu dàn ý/resume và kiểm tra trình duyệt | Đã triển khai trên `feat/socratic-integration`; bàn giao [socratic-integration.md](socratic-integration.md). Live Gemini báo riêng |
| 4 | `feat/assessment` | Chấm bài văn bản theo snapshot rubric, validate điểm/evidence, lưu AI_DRAFT; use case xác nhận công bố; cộng sự nối HTTP/UI | Đã triển khai application/CLI/tests trên `feat/assessment`; HTTP/UI và live smoke chất lượng model báo riêng |
| 5 | `feat/writing-profile` | Trích xuất observations từ bài đã công bố, evidence thật, cập nhật profile; Socratic dùng profile ở lượt sau | Đã triển khai application/CLI/tests trên `feat/writing-profile`; HTTP/UI và live smoke chất lượng model báo riêng |

Mỗi hàng là một feature. Adapter/context/tests cùng thuộc `feat/socratic`; không tách chúng thành nhiều nhánh nhỏ. Với feature mới, tạo nhánh từ base đã chứa các feature phụ thuộc; không tự merge/push để đổi base.

## Pipeline giao diện đầy đủ

Đã triển khai trên chuỗi nhánh `feat/ai-foundation` → `feat/writing-profile-integration`. Live provider chưa kiểm chứng. Chi tiết [full-pipeline-handoff.md](full-pipeline-handoff.md).

| Thứ tự | Nhánh | Phạm vi | Trạng thái |
| --- | --- | --- | --- |
| 6 | `feat/ai-foundation` | Config Gemini/OpenAI, provenance | Đã code; live báo riêng |
| 7 | `feat/teacher-assignments` | Form đề/barem, draft/publish/close, đọc, progress | Đã code |
| 8 | `feat/submission-ocr` | Upload private, mask, OCR, xác nhận bản chép | Đã code (mock fixture) |
| 9 | `feat/assessment-integration` | HTTP/UI chấm, PENDING vs official | Đã code |
| 10 | `feat/writing-profile-integration` | Job extraction, profile UI, seed:demo, e2e | Đã code; live báo riêng |

Mỗi feature bao gồm migrations cần thiết, API, UI, tests và tài liệu. Dataset demo thêm dần, chốt ở feature cuối, dùng namespace riêng và không reset/overwrite dữ liệu đang có. Chia sẻ mã đề cho học sinh trong pilot; chưa có giao riêng theo lớp/người nhận. Barem nhập bằng form, ngữ liệu văn bản; tự đọc file PDF/DOCX thành rubric nằm ngoài yêu cầu này.

Điều kiện nghiệm thu mới: teacher tạo/công bố đề trên UI; student đọc, lưu dàn ý, upload ảnh riêng tư; teacher duyệt ảnh và xác nhận bản chép OCR; AI chấm draft, teacher duyệt/công bố; student xem điểm chính thức/profile; Socratic đề sau dùng đúng evidence. Test fake AI với DB/HTTP/storage thật và kiểm chứng model live được báo riêng.

## Writing profile

Assessment application/CLI đã có trên `feat/assessment`. Bàn giao: [assessment-handoff.md](assessment-handoff.md). Hồ sơ văn phong: [writing-profile-handoff.md](writing-profile-handoff.md). Teacher CRUD và HTTP nộp/chấm/profile chưa có; prompt Codex full pipeline tiếp quản việc nối theo handoff.

Chỉ trích xuất từ assessment `PUBLISHED`. Không đưa profile vào context chấm điểm. HTTP/UI quản lý thuộc yêu cầu full pipeline mới.

Hai feature cuối: [assessment](../../prompts/grok-assessment.md) (đã làm) → [writing profile](../../prompts/grok-writing-profile.md) (đã làm trên `feat/writing-profile`).

## Điểm kiểm tra trước khi chuyển feature

- Database: migrations apply được trên DB mới, validation/constraints và các regression tests đạt.
- Socratic: hội thoại persist/resume, request chéo student bị chặn, retry/concurrency không tạo lượt trùng, output được kiểm tra trước khi trả; báo riêng kết quả gọi model thật.
- Socratic integration: browser dùng auth/HTTP/DB thật; refresh giữ chat/dàn ý, retry không trùng và đổi tài khoản không lẫn dữ liệu; báo riêng fake AI/live Gemini.
- Assessment: đúng rubric snapshot, điểm và quote hợp lệ, draft khác điểm công bố; chấm không dùng profile.
- Writing profile: chỉ nguồn PUBLISHED, observations có evidence, không khôi phục nhận xét đã loại bỏ khi retry, không kết luận văn phong ổn định theo số bài cố định.

Auth/CRUD có thể chuẩn bị song song theo trách nhiệm cộng sự; không coi CLI/fake adapter là API hay chất lượng model thật đã hoàn thành.
