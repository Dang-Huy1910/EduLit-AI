# Đánh giá chất lượng AI

Đây là **chỗ dành sẵn cho M6, chưa có nội dung thực thi**: chưa có dataset, runner hoặc báo cáo đánh giá chất lượng.

| Thư mục | Mục tiêu dự kiến |
| --- | --- |
| `ocr/` | CER/WER tiếng Việt, thiếu dòng/trang, sai do tự sửa và latency |
| `grading/` | Đồng thuận điểm/tiêu chí, nhận xét và bằng chứng so với giáo viên |
| `socratic/` | Hỏi gợi mở, viết hộ, guardrail và độ trễ nội dung đã duyệt |
| `datasets/` | Dataset có quyền sử dụng, đã kiểm tra ẩn danh và nguồn |

Đánh giá hồ sơ viết cũng nằm trong M6 nhưng chưa có thư mục/bộ đo riêng: đối chiếu observations/evidence và lịch sử tiến bộ qua bài tiếp theo. Mỗi lần đánh giá cần ghi provider/model cấu hình, phiên bản prompt, dữ liệu, cách đo và ngưỡng chấp nhận; không mặc định một model Gemini cho mọi task.

Tách tuning/holdout; profile dựng từ bài trước rồi kiểm tra trên bài sau. Confidence do model tự khai không phải accuracy đã hiệu chuẩn. Các ngưỡng còn mở tại TBD-10 trong [SRS](../SRS.md). Bộ đo chi tiết ở [pipeline AI](../docs/architecture/gemini-pipeline.md#8-quota-retry-và-evaluation).

Kiểm thử phần mềm hiện nằm ở `backend/tests/`, unit tests frontend cạnh feature và Playwright ở `frontend/tests/`; lệnh ở [CONTRIBUTING](../CONTRIBUTING.md#lint-test-và-ci). Kết quả local có thể ghi vào `evaluations/results/` (Git bỏ qua); báo cáo chia sẻ phải loại dữ liệu riêng tư. Theo dõi phần còn lại tại [M6](../docs/development/implementation-roadmap.md#m6--contracts-đánh-giá-và-thí-điểm-còn-mở).
