# Prompt runtime và prompt lịch sử

Rà lại 2026-10-28 theo `backend/app/ai/prompt_assets.py`, `_prompt_build.py` và Settings. Provider do `AI_PROVIDER=openai|gemini|fake` chọn, model qua `AI_MODEL` và override theo tác vụ; không cố định mọi task vào Gemini 2.5 Flash.

## Prompt runtime đã có

| Thư mục | File / vai trò | Cấu hình version mặc định |
| --- | --- | --- |
| `socratic/` | `system.v1.md`, `outline-init.v1.md`, `outline-init.v2.md` | `SOCRATIC_PROMPT_VERSION=v1`, `OUTLINE_INIT_PROMPT_VERSION=v2` |
| `catalog/` | `document-extract.v1.md`: tách ngữ liệu/đề/barem từ Markdown | `IMPORT_PROMPT_VERSION=v1` |
| `ocr/` | `transcribe-page.v1.md`: chép nguyên văn từng trang | `OCR_PROMPT_VERSION=v1` |
| `assessment/` | `grade-essay.v1.md`, `class-insight.v1.md` | `ASSESSMENT_PROMPT_VERSION=v1`, `INSIGHT_PROMPT_VERSION=v1` |
| `assessment/` | `writing-profile.v1.md`, `writing-profile.v2.md` | `WRITING_PROFILE_PROMPT_VERSION=v2` |

Checkout đọc prompt canonical ở đây; build đóng gói asset vào `app.ai.prompts` để wheel không phụ thuộc cwd. Loader kiểm version và hash; thiếu phiên bản yêu cầu thì báo lỗi. Schema/output validation thực thi bằng Pydantic và mã nghiệp vụ backend. Chi tiết ở [pipeline AI](../docs/architecture/gemini-pipeline.md).

Không ghi cứng bài làm/học liệu vào prompt chung. OCR giữ lỗi nguyên văn; chấm chỉ nhận bản chép đã xác nhận, đề/barem đã chốt; profile lấy nguồn đã công bố và không tham gia chấm. Thay prompt cần kiểm schema, guardrail và chất lượng liên quan; `evaluations/` còn dành sẵn M6, chưa có runner.

## Prompt giao việc lịch sử

Các file ở gốc `prompts/` là yêu cầu tại thời điểm tạo, không phải hướng dẫn chạy code hiện tại:

- [Stitch](stitch-prompt.md), [Gemini prototype](gemini-prototype.md): thiết kế UI và prototype. Archive giữ ở `prototype/stitch_edulit_ai_platform_mvp/`; design tokens tại [DESIGN.md](../prototype/stitch_edulit_ai_platform_mvp/edulit_serene_paper/DESIGN.md).
- [Grok database](grok-database.md), [Grok auth](grok-python-auth.md): yêu cầu triển khai theo nhánh/stack tại thời điểm đó; backend hiện theo [ADR-0004](../docs/architecture/decisions/0004-python-monolith.md).
- [Cập nhật lớp demo](antigravity-update-mock-11a14.md): dữ liệu đã dời sang `backend/demo/`, seed tại `backend/scripts/seed_classroom_demo.py`; các store prototype đã bỏ.
- [Hồ sơ văn phong](claude-student-writing-profile.md): prompt giao tính năng lịch sử; code hiện ở service/router/model writing profile và `frontend/src/features/writing-profile/`.

Không chạy lại yêu cầu tạo nhánh/mock/scaffold trong prompt lịch sử như kế hoạch phát triển hiện tại. Lệnh chạy/kiểm tra theo [CONTRIBUTING](../CONTRIBUTING.md), chức năng và phần còn mở theo [roadmap](../docs/development/implementation-roadmap.md).
