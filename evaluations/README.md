# Đánh giá chất lượng AI

| Thư mục | Mục tiêu |
| --- | --- |
| `ocr/` | Đánh giá nhận dạng chữ viết tay tiếng Việt và confidence |
| `grading/` | So sánh điểm, nhận xét AI với đánh giá giáo viên |
| `socratic/` | Đánh giá khả năng hỏi gợi mở và tuân thủ guardrail |
| `writing-profile/` (dự kiến) | Đối chiếu observation/evidence, nhầm thể loại và tiến bộ qua bài tiếp theo |
| `datasets/` | Dataset giả lập hoặc đã được kiểm tra ẩn danh, có mô tả nguồn |

Mỗi bộ đánh giá cần mô tả dữ liệu, phiên bản prompt/mô hình, cách đo và ngưỡng chấp nhận. Các ngưỡng chất lượng còn mở tại TBD-10 của [SRS](../SRS.md).

Kết quả chạy cục bộ có thể ghi vào `evaluations/results/`, được Git bỏ qua. Báo cáo được chọn để chia sẻ cần loại bỏ dữ liệu riêng tư và lưu trong tài liệu phù hợp.

Thư mục này dành cho chất lượng mô hình; kiểm tra phần mềm đầu cuối, schema và thời gian xử lý nằm trong `tests/`. Socratic có fixture tình huống tại `evaluations/socratic/cases.v1.json`; chưa có runner chấm điểm model tự động.

Model lựa chọn là `gemini-2.5-flash`. [Gemini pipeline](../docs/architecture/gemini-pipeline.md#8-quota-retry-và-evaluation) quy định bộ đo OCR, chấm, Socratic và profile. Confidence do model tự khai chưa là accuracy đã đo; benchmark cần bản chép chuẩn và teacher judgments. Tách tuning/holdout; profile được dựng từ bài trước rồi kiểm tra trên bài tiếp theo.
