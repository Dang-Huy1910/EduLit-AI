# Hướng dẫn đóng góp

## Trước khi triển khai

Đọc [SRS](SRS.md) và [cấu trúc dự án](docs/architecture/project-structure.md). Khi một thay đổi giải quyết yêu cầu cụ thể, ghi mã `FR`, `BR`, `NFR` hoặc `AC` liên quan trong mô tả thay đổi.

Framework, package manager và công nghệ lưu trữ chưa được chốt. Sau khi lựa chọn, bổ sung manifest, lockfile, cấu hình kiểm tra mã và hướng dẫn chạy trong README của từng ứng dụng.

## Tổ chức mã

- Đặt nghiệp vụ trong module tương ứng, tích hợp dịch vụ bên ngoài trong `infrastructure`.
- Giữ controller/route và tác vụ nền tập trung vào nhận đầu vào, gọi use case và trả kết quả.
- Chỉ đưa vào `core` các thành phần thực sự dùng chung; giữ quy tắc chấm điểm và FSM trong module sở hữu chúng.
- Đặt xử lý và cung cấp học liệu trong `backend/src/modules/grounding`; đặt phiên chat và guardrail trong `backend/src/modules/socratic`. Tham khảo [luồng học liệu và chatbot](docs/architecture/knowledge-and-chatbot.md) khi thay đổi hai phần này.
- Thay đổi hợp đồng dữ liệu phải cập nhật schema, ví dụ, bên sử dụng và kiểm thử liên quan cùng lúc.
- Đặt thay đổi kiến trúc có tác động lâu dài trong `docs/architecture/decisions/`, theo tên `NNNN-ten-quyet-dinh.md`.

## Kiểm tra thay đổi

Chọn kiểm thử phù hợp với hành vi thay đổi: unit cho quy tắc nghiệp vụ, integration cho tích hợp, contract cho schema, e2e cho luồng sử dụng, performance cho thời gian xử lý. Với thay đổi prompt hoặc nhà cung cấp AI, chạy bộ đánh giá tương ứng trong `evaluations` khi bộ đánh giá đã được triển khai.

Hiện chưa có lệnh kiểm thử hoặc build vì repository mới chứa khung thư mục. Không coi thư mục kiểm thử hay workflow trống là một kiểm tra đã được triển khai.

## Dữ liệu và cấu hình

- Chỉ đưa dữ liệu tổng hợp giả lập hoặc dữ liệu đã được kiểm tra ẩn danh vào fixture và bộ đánh giá được commit.
- Ảnh bài làm thật, dữ liệu định danh học sinh, token và API key không thuộc repository.
- Cấu hình thật đặt trong môi trường hoặc cơ chế quản lý secret của nền tảng triển khai; file `.env.example` tương lai chỉ ghi tên biến và giá trị minh họa.
- Việc Git bỏ qua file chỉ ngăn theo dõi ngoài ý muốn; chính sách truy cập, lưu giữ và xóa dữ liệu vẫn phải được triển khai theo SRS.
