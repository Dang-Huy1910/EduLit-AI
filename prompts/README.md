# Prompt theo phân hệ

Bốn thư mục `grounding`, `socratic`, `assessment`, `analytics` giữ các chỉ dẫn mô hình tương ứng với bốn phân hệ trong SRS.

Khi bổ sung prompt, dùng tên thể hiện vai trò và phiên bản, ví dụ `system.v1.md`, kèm mô tả đầu vào, đầu ra và bộ đánh giá liên quan. Ứng dụng nạp prompt bằng cơ chế phù hợp với môi trường build/deploy đã chọn.

Nội dung học liệu, rubric và bài làm được đưa vào lúc xử lý yêu cầu, không được ghi cố định vào prompt chung. Thay đổi prompt Socratic phải kiểm tra guardrail; thay đổi prompt đánh giá phải kiểm tra schema và chất lượng chấm.

Prompt hiện chưa được triển khai; quy tắc Socratic tham chiếu mục 4.4 của [SRS](../SRS.md).

## Prompt giao diện (UI)

- [Google Stitch MVP Prompt](stitch-prompt.md): Prompt tự chứa ngữ cảnh để thiết kế 10 màn hình cho bốn phân hệ trong `SRS.md`, dùng bảng màu từ `DESIGN.md`. Bao gồm luồng giáo viên/học sinh, trạng thái xử lý và bố cục mobile.
- [Gemini Clickable Prototype Prompt](gemini-prototype.md): Prompt tự chứa ngữ cảnh để Gemini dựng prototype Next.js có điều hướng từ 10 màn Stitch đã render, token EduLit Serene Paper, mock data thống nhất, trường **THPT Đan Phượng**, và bốn luồng SRS. Không gọi AI/OCR thật.

Sao chép toàn bộ khối prompt trong file vào Stitch hoặc Gemini. Nếu thiết kế theo từng đợt, dùng chung phần quy tắc và dữ liệu minh họa, rồi lần lượt yêu cầu nhóm màn hình giáo viên (01–05), học sinh (06–10) và các biến thể trạng thái/mobile. Các giả định UX chưa chốt được ghi rõ trước khối prompt. Khi code prototype, đính kèm `prototype/stitch_edulit_ai_platform_mvp/` nếu công cụ đọc được repository.
