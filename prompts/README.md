# Prompt theo phân hệ

Bốn thư mục `grounding`, `socratic`, `assessment`, `analytics` giữ các chỉ dẫn mô hình tương ứng với bốn phân hệ trong SRS.

Thiết kế MVP dùng **Gemini 2.5 Flash** (`gemini-2.5-flash`) cho các task riêng; bổ sung `writing-profile` khi triển khai cá nhân hóa. [Gemini pipeline](../docs/architecture/gemini-pipeline.md) mô tả input/output, version, schema và guardrail. Prompt OCR chép nguyên văn; prompt chấm chỉ nhận bản chép đã xác nhận; profile không đưa vào scoring context.

Khi bổ sung prompt, dùng tên thể hiện vai trò và phiên bản, ví dụ `system.v1.md`, kèm mô tả đầu vào, đầu ra và bộ đánh giá liên quan. Ứng dụng nạp prompt bằng `import.meta.url` + copy vào `dist/` lúc build; không phụ thuộc cwd.

Nội dung học liệu, rubric và bài làm được đưa vào lúc xử lý yêu cầu, không được ghi cố định vào prompt chung. Thay đổi prompt Socratic phải kiểm tra guardrail; thay đổi prompt đánh giá phải kiểm tra schema và chất lượng chấm.

Socratic v1 đã có `prompts/socratic/system.v1.md` và `output.v1.schema.json` (sao vào `backend/src/modules/socratic/assets/`). Quy tắc BR-01–BR-04 tham chiếu mục 4.4 của [SRS](../SRS.md).

## Prompt triển khai database

- [Grok — Database MVP trên nhánh feat/database](grok-database.md): Prompt triển khai PostgreSQL/Prisma cho phạm vi MVP tối giản mới nhất. Toàn bộ schema, migrations, seed, kiểm tra và bàn giao nằm trong một nhánh `feat/database`; chuyển sang chức năng khác mới tạo nhánh mới. Chưa yêu cầu gọi AI hoặc xây CRUD HTTP.

## Prompt triển khai AI

- [Grok — Gemini và Socratic trên nhánh feat/socratic](grok-socratic.md): Feature kế tiếp sau database. Gồm adapter Gemini 2.5 Flash, context/profile, guardrail, lưu lượt chat atomic, retry/concurrency, CLI demo và kiểm tra. Chưa triển khai HTTP/auth, chấm bài hoặc AI trích xuất văn phong.
- [Lộ trình MVP theo feature](../docs/development/minimal-mvp-roadmap.md): Thứ tự database → Socratic → assessment → writing profile và ranh giới công việc với cộng sự.

## Prompt giao diện (UI)

- [Google Stitch MVP Prompt](stitch-prompt.md): Prompt tự chứa ngữ cảnh để thiết kế 10 màn hình cho bốn phân hệ trong `SRS.md`, dùng bảng màu từ `DESIGN.md`. Bao gồm luồng giáo viên/học sinh, trạng thái xử lý và bố cục mobile.
- [Gemini Clickable Prototype Prompt](gemini-prototype.md): Prompt tự chứa ngữ cảnh để Gemini dựng prototype Next.js có điều hướng từ 10 màn Stitch đã render, token EduLit Serene Paper, mock data thống nhất, trường **THPT Đan Phượng**, và bốn luồng SRS. Không gọi AI/OCR thật.

Sao chép toàn bộ khối prompt trong file vào Stitch hoặc Gemini. Nếu thiết kế theo từng đợt, dùng chung phần quy tắc và dữ liệu minh họa, rồi lần lượt yêu cầu nhóm màn hình giáo viên (01–05), học sinh (06–10) và các biến thể trạng thái/mobile. Các giả định UX chưa chốt được ghi rõ trước khối prompt. Khi code prototype, đính kèm `prototype/stitch_edulit_ai_platform_mvp/` nếu công cụ đọc được repository.
