# Cấu trúc dự án EduLit-AI

Ngày tạo: 12/10/2026. Trạng thái: khung tổ chức mã ban đầu; công nghệ triển khai vẫn cần chốt theo TBD-11 của [SRS](../../SRS.md).

## 1. Cách tổ chức

Repository dùng monorepo để giữ giao diện, backend, hợp đồng và tài liệu cùng phiên bản. Backend dự kiến là modular monolith: các phân hệ có ranh giới nghiệp vụ riêng trong một ứng dụng. Cách tổ chức này giúp nhóm nhỏ phát triển và kiểm thử chu trình liên quan đến rubric, hướng dẫn, bài nộp và báo cáo trong cùng repository.

Các tích hợp AI/OCR, storage, database và queue nằm ở lớp hạ tầng. Các use case nghiệp vụ làm việc qua interface để có thể thay adapter khi công nghệ hoặc nhà cung cấp thay đổi.

## 2. Cây thư mục

```text
EduLit-AI/
├── .github/
│   └── workflows/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   │   ├── analytics/
│   │   │   ├── assessment/
│   │   │   ├── assignments/
│   │   │   ├── classrooms/
│   │   │   ├── grounding/
│   │   │   ├── identity/
│   │   │   └── socratic/
│   │   ├── lib/
│   │   └── styles/
│   ├── tests/
│   │   ├── integration/
│   │   └── unit/
│   └── README.md
├── backend/
│   ├── migrations/
│   ├── src/
│   │   ├── core/
│   │   ├── infrastructure/
│   │   │   ├── ai/
│   │   │   ├── database/
│   │   │   ├── queue/
│   │   │   ├── storage/
│   │   │   └── vision/
│   │   ├── jobs/
│   │   │   └── ingestion/
│   │   └── modules/
│   │       ├── analytics/
│   │       ├── assessment/
│   │       ├── assignments/
│   │       ├── classrooms/
│   │       ├── grounding/
│   │       │   └── application/
│   │       │       ├── ingestion/
│   │       │       ├── retrieval/
│   │       │       └── rubrics/
│   │       ├── identity/
│   │       └── socratic/
│   │           └── application/
│   │               ├── conversations/
│   │               └── guardrails/
│   ├── tests/
│   │   ├── integration/
│   │   └── unit/
│   └── README.md
├── contracts/
│   ├── examples/
│   ├── openapi/
│   ├── schemas/
│   └── README.md
├── prompts/
│   ├── analytics/
│   ├── assessment/
│   ├── grounding/
│   ├── socratic/
│   └── README.md
├── tests/
│   ├── contracts/
│   ├── e2e/
│   └── performance/
├── evaluations/
│   ├── datasets/
│   ├── grading/
│   ├── ocr/
│   ├── socratic/
│   └── README.md
├── docs/
│   ├── api/
│   ├── architecture/
│   │   ├── decisions/
│   │   ├── knowledge-and-chatbot.md
│   │   └── project-structure.md
│   ├── deployment/
│   └── development/
├── infra/
│   ├── docker/
│   ├── environments/
│   │   ├── development/
│   │   ├── production/
│   │   └── staging/
│   └── README.md
├── scripts/
│   ├── dev/
│   └── maintenance/
├── .editorconfig
├── .gitignore
├── CONTRIBUTING.md
├── README.md
└── SRS.md
```

## 3. Ánh xạ SRS vào mã

| Nghiệp vụ | Module backend và feature frontend | Yêu cầu SRS |
| --- | --- | --- |
| Nạp tri thức, học liệu, rubric | `grounding` | FR-01–FR-05 |
| Hướng dẫn lập dàn ý | `socratic` | FR-06–FR-10, BR-01–BR-04 |
| Nộp ảnh, OCR và chấm bài | `assessment` | FR-11–FR-17, BR-05–BR-08 |
| Phân tích và điều chỉnh dạy học | `analytics` | FR-18–FR-21 |
| Tài khoản và phân quyền | `identity` | TBD-01; phạm vi chi tiết cần chốt |
| Lớp và thành viên | `classrooms` | TBD-01, TBD-07; phạm vi chi tiết cần chốt |
| Mã đề, bài tập và liên kết rubric | `assignments` | FR-05, FR-06, TBD-02 |

## 4. Ranh giới trách nhiệm

- **Frontend:** Hiển thị và tương tác, tổ chức theo feature. Logic chấm điểm, quyền truy cập và gọi dịch vụ AI do backend thực hiện.
- **Module backend:** Sở hữu use case và quy tắc nghiệp vụ. Tách mã HTTP, nghiệp vụ và persistence khi bắt đầu triển khai.
- **Infrastructure:** Triển khai adapter theo interface của ứng dụng. Quy tắc sư phạm và điểm số thuộc module nghiệp vụ.
- **Jobs:** Điều phối việc chạy use case nền. Có thể chạy trong tiến trình riêng và dùng lại mã của backend.
- **Contracts:** Giữ đặc tả giao tiếp dùng chung. `docs/api` giải thích cách dùng API; `contracts/openapi` giữ đặc tả có thể xử lý bằng công cụ.
- **Prompts:** Quản lý chỉ dẫn mô hình có phiên bản. Dữ liệu bài làm và học liệu được nạp ở thời điểm xử lý.
- **Docs:** Lưu hướng dẫn và quyết định. `docs/architecture/decisions` dùng cho quyết định về framework, persistence, nhà cung cấp hoặc deployment khi được chốt.

Luồng giáo viên nhập học liệu và chatbot sử dụng ngữ cảnh được mô tả tại [luồng học liệu và chatbot](knowledge-and-chatbot.md). Các thư mục `grounding/application` và `socratic/application` được chuẩn bị riêng cho các use case này.

## 5. Vị trí kiểm tra

| Loại kiểm tra | Vị trí | Ví dụ |
| --- | --- | --- |
| Unit / integration frontend | `frontend/tests/` | Hiển thị báo cáo, phối hợp trạng thái và API |
| Unit / integration backend | `backend/tests/` | FSM, giới hạn điểm, truy cập persistence |
| Contract | `tests/contracts/` | Kiểm tra rubric và báo cáo đúng schema |
| E2E | `tests/e2e/` | Giáo viên tạo đề → học sinh lập dàn ý/nộp bài → giáo viên xem thống kê |
| Performance | `tests/performance/` | TTFT và xử lý bài hai trang theo NFR-03, NFR-04 |
| AI evaluation | `evaluations/` | Chất lượng OCR, đồng thuận điểm và guardrail Socratic |

Các thư mục chỉ dành vị trí cho kiểm tra; runner, fixture và ngưỡng chấp nhận được bổ sung theo phạm vi chức năng thực tế.

## 6. Dữ liệu và môi trường

Dữ liệu minh họa dùng chung nằm trong `contracts/examples`; fixture riêng đặt gần kiểm thử sử dụng nó. Bộ dữ liệu đánh giá AI nằm trong `evaluations/datasets` và phải có nguồn cùng trạng thái ẩn danh rõ ràng.

Nếu cần lưu cục bộ lúc phát triển, dùng `var/` hoặc `data/` ở gốc repository; cả hai đường dẫn được Git bỏ qua và chưa được tạo trong khung này. Cấu hình lưu trữ thật phải thực hiện kiểm soát truy cập, lưu giữ và xóa theo SRS. Tài nguyên tĩnh `frontend/public` chỉ chứa tài nguyên công khai của sản phẩm.

`.github/workflows` dành cho CI/CD; `infra` dành cho cấu hình hạ tầng; `scripts` dành cho tiện ích. Hiện các vị trí này chưa có workflow hoặc cấu hình thực thi.

## 7. Mở rộng khi bắt đầu viết mã

1. Chốt framework, runtime, package manager và cơ sở dữ liệu; ghi quyết định kiến trúc và cập nhật README ứng dụng.
2. Thêm manifest, lockfile, entrypoint, cấu hình lint/format và lệnh phát triển cho ứng dụng tương ứng.
3. Hoàn thiện hợp đồng dữ liệu theo SRS và các điểm TBD; sau đó triển khai module với kiểm tra phù hợp.
4. Thêm cấu hình container, CI và hướng dẫn triển khai khi ứng dụng đã có lệnh chạy/kiểm tra thực tế.

Khi phát sinh mã dùng chung giữa các ứng dụng với cùng hệ công nghệ, có thể thêm `packages/` cho thư viện đó. Khi cần triển khai worker độc lập, có thể thêm `worker/` và tách thư viện nghiệp vụ dùng chung. Mỗi bước mở rộng cần có nhu cầu cụ thể và được phản ánh trong tài liệu.
