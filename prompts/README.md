# Prompt theo phân hệ

Bốn thư mục `grounding`, `socratic`, `assessment`, `analytics` giữ các chỉ dẫn mô hình tương ứng với bốn phân hệ trong SRS.

Khi bổ sung prompt, dùng tên thể hiện vai trò và phiên bản, ví dụ `system.v1.md`, kèm mô tả đầu vào, đầu ra và bộ đánh giá liên quan. Ứng dụng nạp prompt bằng cơ chế phù hợp với môi trường build/deploy đã chọn.

Nội dung học liệu, rubric và bài làm được đưa vào lúc xử lý yêu cầu, không được ghi cố định vào prompt chung. Thay đổi prompt Socratic phải kiểm tra guardrail; thay đổi prompt đánh giá phải kiểm tra schema và chất lượng chấm.

Prompt hiện chưa được triển khai; quy tắc Socratic tham chiếu mục 4.4 của [SRS](../SRS.md).
