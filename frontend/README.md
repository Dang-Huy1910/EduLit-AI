# Frontend

Giao diện dành cho giáo viên và học sinh. Thư mục được chuẩn bị độc lập với framework; `src/app` sẽ chứa điểm khởi tạo, bố cục và định tuyến phù hợp với công nghệ được chọn.

| Thư mục | Trách nhiệm |
| --- | --- |
| `src/app/` | Khởi tạo ứng dụng, route, layout và provider toàn cục |
| `src/features/` | Màn hình, trạng thái, hook và lời gọi API theo từng nghiệp vụ |
| `src/components/` | Thành phần giao diện dùng chung giữa các feature |
| `src/lib/` | API client và tiện ích dùng chung |
| `src/styles/` | Style toàn cục và token giao diện |
| `public/` | Tài nguyên tĩnh công khai của sản phẩm |
| `tests/unit/` | Kiểm thử thành phần và logic giao diện |
| `tests/integration/` | Kiểm thử phối hợp giữa màn hình, trạng thái và API client |

`features` gồm bốn phân hệ cốt lõi và vị trí dự kiến cho `identity`, `classrooms`, `assignments`. Quy trình đăng nhập và quản lý lớp/bài tập cần được chốt theo SRS trước triển khai.

`features/grounding` dành cho màn hình giáo viên tải tài liệu, xem trạng thái xử lý và kiểm tra rubric. `features/socratic` dành cho giao diện chat, chọn đề và theo dõi dàn ý. Lịch sử chat được lưu theo phiên ở backend; parsing tài liệu, chọn ngữ cảnh và gọi mô hình cũng do backend thực hiện.

Các route giáo viên/học sinh dùng lại feature phù hợp. Backend kiểm tra quyền truy cập vào tài liệu, đề và phiên chat cho từng yêu cầu; việc ẩn nút hoặc phân route trên frontend chỉ phục vụ trải nghiệm giao diện.

Khi feature phát triển, có thể chia thành `components/`, `hooks/`, `api/`, `types/` bên trong feature đó. Chỉ tạo thư mục con khi có nhu cầu thực tế.

Ảnh bài làm học sinh không được đặt trong `public/`. Ứng dụng web gọi backend để thực hiện nghiệp vụ; khóa dịch vụ AI/OCR thuộc cấu hình backend.

Chưa có mã chạy, dependency hoặc lệnh khởi động. Bổ sung hướng dẫn sau khi chọn framework.
