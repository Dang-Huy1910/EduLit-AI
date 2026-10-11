# Backend API

Ứng dụng backend dự kiến tổ chức theo modular monolith. Module giữ quyền sở hữu nghiệp vụ; hạ tầng và tác vụ nền dùng lại các use case của module.

| Thư mục | Trách nhiệm |
| --- | --- |
| `src/modules/grounding/` | Nhập học liệu, parsing/chunking, quản lý rubric và cung cấp ngữ cảnh theo đề |
| `src/modules/socratic/` | Phiên hướng dẫn, FSM lập dàn ý, guardrail và rà soát dàn ý |
| `src/modules/assessment/` | Bài nộp, xử lý ảnh, điều phối OCR, đánh giá và kiểm tra điểm |
| `src/modules/analytics/` | Tổng hợp lớp/khối, heatmap, chênh lệch mục tiêu và kiến nghị sư phạm |
| `src/modules/identity/` | Vị trí dự kiến cho xác thực và phân quyền |
| `src/modules/classrooms/` | Vị trí dự kiến cho lớp học và thành viên |
| `src/modules/assignments/` | Vị trí dự kiến cho bài tập, mã đề và liên kết rubric |
| `src/core/` | Cấu hình, chuẩn lỗi và các thành phần nền tảng dùng chung |
| `src/infrastructure/ai/` | Adapter nhà cung cấp mô hình ngôn ngữ |
| `src/infrastructure/vision/` | Adapter dịch vụ Vision/OCR |
| `src/infrastructure/database/` | Kết nối cơ sở dữ liệu và cơ chế persistence |
| `src/infrastructure/storage/` | Tích hợp lưu trữ tệp có kiểm soát truy cập |
| `src/infrastructure/queue/` | Adapter hàng đợi nếu cần xử lý bất đồng bộ |
| `src/jobs/` | Điểm vào tác vụ nền, gọi use case của module |
| `migrations/` | Thay đổi schema cơ sở dữ liệu có phiên bản |
| `tests/unit/` | Kiểm thử quy tắc nghiệp vụ độc lập |
| `tests/integration/` | Kiểm thử API và tích hợp hạ tầng |

Các vị trí đã chuẩn bị cho luồng tài liệu và chatbot:

| Thư mục | Trách nhiệm dự kiến |
| --- | --- |
| `src/modules/grounding/application/ingestion/` | Điều phối tiếp nhận, parsing, chunking và lưu metadata học liệu |
| `src/modules/grounding/application/retrieval/` | Chọn ngữ cảnh từ học liệu đã xử lý, theo đề bài và phạm vi truy cập |
| `src/modules/grounding/application/rubrics/` | Trích xuất, kiểm tra và cung cấp rubric tương ứng |
| `src/modules/socratic/application/conversations/` | Điều phối lượt chat, lịch sử phiên và tiến trình FSM |
| `src/modules/socratic/application/guardrails/` | Áp dụng quy tắc hỏi gợi mở, giới hạn phản hồi và từ chối viết hộ |
| `src/jobs/ingestion/` | Điểm vào tác vụ xử lý tài liệu nền khi cần |

Đây là khung trách nhiệm, chưa có pipeline thực thi. Xem [luồng học liệu và chatbot](../docs/architecture/knowledge-and-chatbot.md) để hiểu cách phối hợp và các điểm cần chốt.

Khi triển khai một module, nhóm mã theo các trách nhiệm sau, với tên file phù hợp ngôn ngữ/framework được chọn:

```text
modules/<module>/
├── domain/          # Thực thể, giá trị và quy tắc nghiệp vụ
├── application/     # Use case và interface cho dịch vụ phụ thuộc
├── presentation/    # Route/controller và ánh xạ đầu vào, đầu ra
└── persistence/     # Repository cụ thể thuộc module, nếu cần
```

Đây là hướng dẫn mở rộng; hiện chỉ có một số thư mục `application` được chuẩn bị cho luồng tài liệu và chatbot. Các phần còn lại được tạo khi triển khai mã. `domain` giữ độc lập với HTTP, ORM và SDK nhà cung cấp; các adapter phụ thuộc interface của tầng ứng dụng. Module trao đổi qua interface/use case rõ ràng, giữ thao tác dữ liệu trong module sở hữu.

Tác vụ OCR/chấm có thể chạy từ `src/jobs` trong tiến trình riêng khi cần. Backend và tiến trình nền dùng cùng mã nghiệp vụ; chỉ bổ sung ứng dụng worker riêng khi yêu cầu triển khai thực tế làm điều đó cần thiết.

Chưa có mã chạy, dependency, database hay dịch vụ queue được cấu hình. Bổ sung hướng dẫn sau khi chốt công nghệ.
