# EduLit-AI

Trợ lý số hóa và đánh giá bài viết môn Ngữ văn THPT theo định hướng GDPT 2018.

Dự án hiện có đặc tả yêu cầu và khung thư mục ban đầu. Mã ứng dụng, dependency, lệnh chạy và pipeline CI/CD sẽ được bổ sung khi chốt công nghệ.

## Tài liệu

- [Đặc tả yêu cầu phần mềm](SRS.md)
- [Cấu trúc dự án và quy tắc tổ chức mã](docs/architecture/project-structure.md)
- [Luồng học liệu giáo viên và chatbot](docs/architecture/knowledge-and-chatbot.md)
- [Hướng dẫn đóng góp](CONTRIBUTING.md)

## Cấu trúc chính

```text
EduLit-AI/
├── frontend/                 # Giao diện giáo viên và học sinh
├── backend/                  # Backend chia module theo nghiệp vụ
├── contracts/                # OpenAPI, JSON Schema và dữ liệu minh họa
├── prompts/                  # Prompt có phiên bản theo từng phân hệ
├── tests/                    # Kiểm thử hợp đồng, đầu cuối và hiệu năng
├── evaluations/              # Đánh giá chất lượng OCR, chấm bài, Socratic
├── docs/                     # Kiến trúc, API, phát triển và triển khai
├── infra/                    # Cấu hình container và môi trường triển khai
├── scripts/                  # Công cụ phát triển và bảo trì
├── .github/workflows/        # Vị trí dành cho workflow CI/CD
├── .editorconfig
├── .gitignore
├── CONTRIBUTING.md
├── README.md
└── SRS.md
```

Backend dự kiến tổ chức theo **modular monolith**: một ứng dụng với ranh giới module rõ ràng. Bốn module `grounding`, `socratic`, `assessment`, `analytics` ánh xạ trực tiếp với SRS. Chi tiết trách nhiệm, vị trí kiểm thử và hướng mở rộng nằm trong tài liệu cấu trúc.

Luồng nhập tài liệu thuộc `grounding`, còn phiên chatbot và guardrail thuộc `socratic`. Chatbot lấy ngữ cảnh phù hợp từ học liệu đã xử lý, đúng đề bài và quyền truy cập; việc bổ sung tài liệu cập nhật kho học liệu của ứng dụng. Chi tiết luồng và những quyết định còn mở được mô tả trong tài liệu học liệu và chatbot.

Các file `.gitkeep` giúp Git lưu những thư mục đang trống; có thể xóa chúng khi thư mục đã có mã hoặc cấu hình thực tế.
