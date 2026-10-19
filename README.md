# EduLit-AI 📚✍️
### Nền tảng Trợ lý AI đồng hành Dạy – Học & Đánh giá môn Ngữ văn THPT theo định hướng GDPT 2018

> **Đơn vị thí điểm:** Trường THPT Đan Phượng (Hà Nội) — Lớp 12A1  
> **Nhân vật minh họa:** Cô Đặng Loan (Giáo viên Ngữ văn) & Bùi Hà My (Học sinh)  
> **Phiên bản:** Prototype v1.0 (Interactive Prototype)

**Trạng thái triển khai:** Giao diện prototype trên `main` chạy mock. Nhánh hiện tại nối **kho ngữ liệu / đề nguồn / giao bài** với FastAPI + PostgreSQL (cookie auth). Xem [luồng giáo viên](docs/development/teacher-assignment-flow.md), [ADR-0002](docs/architecture/decisions/0002-python-auth.md) và [handoff auth](docs/development/python-auth-handoff.md).

---

## 🌟 1. Bối cảnh & Bài toán giải quyết (Problem Statement)

Chương trình Giáo dục phổ thông (GDPT) 2018 đặt trọng tâm vào **phát triển phẩm chất và năng lực** của học sinh. Đối với môn Ngữ văn cấp THPT, điều này đòi hỏi sự chuyển dịch căn bản:
- **Từ:** Học thuộc lòng, sao chép văn mẫu sáo rỗng, đối phó điểm số.
- **Sang:** Tư duy phản biện, lập luận đa chiều độc lập, tự chủ sáng tạo và hình thành cảm xúc thẩm mỹ cá nhân.

### Những thách thức thực tế (Pain Points)
1. **Đối với Giáo viên:**
   - Mỗi tuần giáo viên phải chấm hàng trăm bài viết tay với khối lượng chữ đồ sộ (trung bình 600–800 từ/bài), gây kiệt sức và khó nhận xét chi tiết từng lỗi dùng từ, ngữ pháp cho từng em.
   - Thiếu công cụ thống kê phổ điểm theo tiêu chí kỹ năng và khó phát hiện các điểm nghẽn nhận thức chung của lớp để điều chỉnh giáo án kịp thời.
2. **Đối với Học sinh:**
   - Lúng túng trong khâu lập dàn ý (đặc biệt là luận điểm phản đề và dẫn chứng thời sự).
   - Dễ sa vào bẫy phụ thuộc các bài văn mẫu trên mạng khi gặp đề bài mở.
   - Không được phản hồi kịp thời trong quá trình xây dựng ý tưởng trước khi cầm bút viết.
3. **Thách thức đối với AI trong Giáo dục:**
   - Nguy cơ AI làm thay/viết hộ học sinh, triệt tiêu tư duy tự chủ sáng tạo.
   - Nguy cơ lộ lọt thông tin cá nhân (PII: họ tên, mã học sinh, trường lớp) khi gửi ảnh bài viết lên đám mây.
   - Nguy cơ AI chấm điểm cảm tính, bịa đặt (hallucination) do không có barem và ngữ liệu nguồn chuẩn.

---

## 💡 2. Giải pháp EduLit-AI (Core Pillars)

EduLit-AI được thiết kế như một **Trợ lý sư phạm đồng hành (Pedagogical Co-pilot)**, kết hợp giữa công nghệ AI hiện đại và chuẩn mực sư phạm của Bộ Giáo dục & Đào tạo:

```text
 ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
 │ 1. KHO HỌC LIỆU │ ────> │  2. SƠ CẤP Ý    │ ────> │  3. PII-SHIELD  │
 │   (Grounding)   │       │ (Socratic AI)   │       │  & OCR ĐỐI CHIẾU│
 └─────────────────┘       └─────────────────┘       └─────────────────┘
                                                              │
 ┌─────────────────┐       ┌─────────────────┐                │
 │ 5. BÁO CÁO LỚP  │ <──── │ 4. CHẤM RUBRIC  │ <──────────────┘
 │ (Analytics GV)  │       │ (4 Tiêu chí)    │
 └─────────────────┘       └─────────────────┘
```

1. **Kho tri thức học liệu chuẩn (Grounding):** Cung cấp văn bản đọc hiểu, barem và giáo án theo đúng đề để giảm nguy cơ nhận xét thiếu căn cứ. MVP truy xuất theo đề và metadata; kiểm tra nguồn và đánh giá chất lượng vẫn cần thiết.
2. **Trợ lý gợi mở tư duy Socratic (Socratic Writing Assistant):** Hướng dẫn học sinh lập dàn ý 3 phần (Mở bài - Thân bài - Kết bài) bằng các câu hỏi gợi ý mở. **Tuyệt đối không viết văn hộ**; kiên quyết từ chối yêu cầu "viết giúp mở bài/bài mẫu".
3. **Bảo vệ quyền riêng tư & Nhận dạng chữ viết tay (OCR):** Học sinh xem trước ảnh sẽ gửi, có thể khoanh vùng che kín họ tên/lớp/mã định danh; hệ thống xuất ảnh đã che thành file thật rồi mới gửi OCR. Học sinh tự đối chiếu, sửa bản chép và xác nhận để nộp bài chính thức. Không có bước giáo viên duyệt OCR.
4. **Đánh giá đa tiêu chí Rubric GDPT 2018:** Chấm điểm theo Barem chuẩn 4 tiêu chí (Tổng 10.0đ), chỉ rõ điểm mạnh, đoạn cần bổ sung, bắt lỗi chính tả/ngữ pháp và giao bài tập khắc phục cá nhân hóa.
5. **Báo cáo năng lực & Kế hoạch điều chỉnh giáo án:** Thống kê phổ điểm lớp 12A1, chỉ ra các lỗi phổ biến (ví dụ: 54.3% thiếu phản đề, 37.1% lỗi câu ghép) và gợi ý giải pháp điều chỉnh tiết học tiếp theo cho giáo viên.

---

## 🔄 3. Chu trình tương tác 2 chiều (End-to-End Interactive Flow)

Hệ thống cho phép trải nghiệm trực tiếp chu trình hoạt động khép kín giữa Giáo viên và Học sinh:

```mermaid
sequenceDiagram
    autonumber
    actor GV as Cô Đặng Loan (GV)
    participant SYS as Hệ thống EduLit-AI
    actor HS as Bùi Hà My (HS)

    Note over GV,SYS: 1. CẤU HÌNH & GIAO ĐỀ
    GV->>SYS: Vào /assignments, mở đề nháp "Chí Phèo"
    GV->>SYS: Cấu hình Barem Rubric 4 tiêu chí (chuẩn 10.0đ)
    GV->>SYS: Bấm "Xác nhận Rubric & Giao bài"
    SYS-->>SYS: Cập nhật trạng thái đề sang 'published'

    Note over HS,SYS: 2. HỌC SINH LÀM BÀI (5 BƯỚC)
    HS->>SYS: Mở /assignments, thấy đề mới có nhãn ✨ Đề mới được giao
    HS->>SYS: Bước 1-2: Vào /socratic, tương tác với AI để hoàn thiện Dàn ý
    HS->>SYS: Bước 3: Vào /submit, chụp/tải 1–4 trang, rà soát/che vùng riêng tư, nộp
    HS->>SYS: Bước 4: Vào /ocr, đối chiếu ảnh với bản chép, sửa nếu cần, bấm "Xác nhận và nộp bài"
    SYS-->>SYS: Attempt sang READY_TO_GRADE; nộp chính thức; enqueue chấm rubric

    Note over HS,GV: 3. CHẤM, CÔNG BỐ, BÁO CÁO
    SYS-->>HS: Bước 5: đang chấm / chờ giáo viên công bố / điểm sau khi công bố
    GV->>SYS: Rà soát điểm, lưu, công bố hoặc ẩn; mở lại bản chép nếu cần
    GV->>SYS: /reports: thống kê bài đã nộp/công bố và gợi ý dạy học từ số liệu server
    Note over GV,HS: Bấm "⚡ Khôi phục Demo (Reset)" để khôi phục trạng thái ban đầu bất cứ lúc nào
```

---

## 🛠️ 4. Công nghệ sử dụng (Tech Stack)

| Lớp | Công nghệ | Trạng thái |
| --- | --- | --- |
| Giao diện | Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 3, Recharts | Đã có prototype |
| Trạng thái | Zustand cho UI; TanStack Query cho dữ liệu API | Zustand hiện có; Query sẽ bổ sung |
| API | NestJS/TypeScript, modular monolith | Đã chọn cho thiết kế MVP, chưa scaffold |
| Runtime/gói | Node.js 24 LTS, npm | Khóa patch khi scaffold MVP |
| Dữ liệu | PostgreSQL 17 + Prisma | Chưa triển khai |
| Tác vụ nền | pg-boss trên PostgreSQL; worker cùng codebase backend | Chưa triển khai |
| Model | **Gemini 2.5 Flash**, `gemini-2.5-flash`, SDK `@google/genai` | Người dùng đã chọn; chưa gọi API thật |
| File/ảnh | Local private storage khi dev; GCS khi deploy; Canvas + Sharp | Thiết kế đích; chưa tích hợp thật |
| Auth | Tài khoản cấp trước, Argon2id, session PostgreSQL và cookie HttpOnly | Chưa triển khai; đăng nhập hiện là demo |
| Contract | OpenAPI, JSON Schema + Ajv | Đã thiết kế danh sách contract; chưa có schema thực thi |

Backend gồm `identity`, `classrooms`, `assignments`, `grounding`, `socratic`, `assessment`, `writing-profile`, `analytics`. API và worker dùng chung database; OCR/chấm chạy nền, chatbot trả nội dung sau kiểm tra guardrail. Học liệu và rubric được chốt phiên bản theo đề; hồ sơ viết lưu nhận xét có bằng chứng.

Luồng MVP thật bổ sung privacy review và giáo viên xác nhận bản chép/công bố điểm; demo hiện tại vẫn minh họa luồng tương tác. Xem [Gemini pipeline](docs/architecture/gemini-pipeline.md) và [API design](docs/api/api-design.md). Các mục tiêu độ trễ và chất lượng phải được đo, không suy từ prototype.

Theo [tài liệu Google](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash), quyền truy cập Gemini 2.5 Flash hiện phụ thuộc lịch sử sử dụng tài khoản. Milestone đầu tiên kiểm tra model trên project thực tế; hệ thống không tự đổi model khi không truy cập được.

---

## 📂 5. Cấu trúc thư mục dự án

```text
EduLit-AI/
├── frontend/                     # Ứng dụng Next.js (Giao diện GV & HS)
│   ├── src/
│   │   ├── app/                  # App Router
│   │   │   ├── assignments/      # Quản lý đề bài, Soạn đề & Barem Rubric
│   │   │   │   └── [id]/         # Workflow 5 bước: /socratic, /submit, /ocr, /result
│   │   │   ├── login/            # Màn hình đăng nhập kèm chọn vai trò 1-click
│   │   │   ├── materials/        # Kho học liệu & Quản lý ngữ liệu GDPT 2018
│   │   │   └── reports/          # Báo cáo năng lực lớp & Đánh giá cá nhân
│   │   ├── components/           # TeacherShell, StudentShell, WorkflowStepper, ToastContainer
│   │   ├── features/             # Logic và giao diện theo từng phân hệ nghiệp vụ
│   │   └── lib/                  # Zustand Store, Types, Mock Data THPT Đan Phượng
│   └── public/                   # Ảnh trường, tài nguyên minh họa
├── backend/                      # Thiết kế module backend (Modular Monolith)
├── contracts/                    # Schema Rubric, OpenAPI specs và dữ liệu mẫu
├── docs/                         # Tài liệu kiến trúc hệ thống và hướng dẫn
├── prompts/                      # Kỹ nghệ Prompt có phiên bản (Socratic, OCR, Rubric)
├── evaluations/                  # Bộ tiêu chuẩn đánh giá độ chính xác của AI
├── DESIGN.md                     # Quy chuẩn hệ thống thiết kế (Design Tokens)
├── SRS.md                        # Đặc tả yêu cầu phần mềm chi tiết (Software Requirements)
└── README.md                     # Tài liệu tổng quan dự án
```

---

## 🚀 6. Hướng dẫn cài đặt & Khởi chạy (Quick Start)

### Yêu cầu môi trường
- **Node.js:** Chọn Node.js 24 LTS cho MVP; khóa patch chung frontend/backend khi scaffold.
- **Trình quản lý gói:** `npm`, giữ `frontend/package-lock.json`.

### Các bước thực hiện

1. **Clone mã nguồn về máy:**
   ```bash
   git clone https://github.com/Dang-Huy1910/EduLit-AI
   cd EduLit-AI/frontend
   ```

2. **Cài đặt thư viện dependencies:**
   ```bash
   npm install
   ```

3. **Khởi chạy máy chủ phát triển (Development Server):**
   ```bash
   npm run dev
   ```

4. **Truy cập ứng dụng:**  
   Mở trình duyệt tại: [http://localhost:3000](http://localhost:3000) (tự động chuyển hướng đến `/login`).

---

## 🎭 7. Hướng dẫn trải nghiệm Demo 1-Click (Demo Walkthrough)

Tại màn hình đăng nhập, hệ thống tích hợp sẵn **2 tài khoản mẫu 1-Click**:

### Cách 1: Đăng nhập vai trò Giáo viên
- Bấm nút **"Cô Đặng Loan"** (hoặc dùng email `dang.loan@thptdanphuong.edu.vn`).
- **Trải nghiệm:**
  1. Vào `/assignments` xem danh sách đề bài Lớp 12A1.
  2. Bấm vào đề nháp **"Bi kịch cự tuyệt quyền làm người của Chí Phèo"** &rarr; kiểm tra thang điểm 10.0 &rarr; Bấm **"Xác nhận Rubric & Giao bài"**.
  3. Vào `/reports` xem phổ điểm lớp 12A1 và kế hoạch điều chỉnh tiết học tiếp theo.

### Cách 2: Đăng nhập vai trò Học sinh
- Bấm nút **"Bùi Hà My"** (hoặc dùng nút *"Xem trước vai trò: Bài tập của em"* ở sidebar).
- **Trải nghiệm chu trình 5 bước:**
  1. Thấy đề bài mới giao xuất hiện với huy hiệu **`✨ Đề mới được giao • Cô Đặng Loan`**.
  2. Bấm **"Bắt đầu lập dàn ý Socratic"** &rarr; trò chuyện với AI để xây dựng dàn ý 3 phần &rarr; chuyển sang viết tay.
  3. Tại bước **Nộp ảnh**, thử nghiệm cơ chế **PII-Shield** che mờ danh tính &rarr; nộp ảnh.
  4. Tại bước **Kiểm tra OCR**, đối chiếu ảnh với bản chép, sửa nếu cần &rarr; bấm *"Xác nhận và nộp bài"*. Bài được nộp chính thức.
  5. Xem bảng điểm Rubric 7.5đ, nhận xét chi tiết và các bài tập luyện tập khắc phục lỗi.
  6. Quay lại danh sách bài tập &rarr; đề bài đã chuyển sang tab **"Bài đã nộp & Lịch sử chấm"**.

### ⚡ Nút "Khôi phục Demo (Reset)"
Ở góc trên bên phải thanh tiêu đề (Top Header) hoặc Sidebar của cả hai vai trò, luôn có nút **"Khôi phục Demo"**.  
Bấm nút này bất cứ lúc nào để xóa sạch dữ liệu chạy thử và đưa toàn bộ hệ thống về trạng thái ban đầu để trình diễn lại từ đầu!

---

## 📖 8. Tài liệu kỹ thuật chi tiết

- 📋 [Đặc tả yêu cầu phần mềm chi tiết (SRS.md)](SRS.md)
- 🎨 [Quy chuẩn thiết kế giao diện & Design Tokens (DESIGN.md)](DESIGN.md)
- 🏗️ [Cấu trúc dự án và quy tắc tổ chức mã nguồn (docs/architecture/project-structure.md)](docs/architecture/project-structure.md)
- 🧩 [Kiến trúc và công nghệ MVP](docs/architecture/system-design.md)
- 🗃️ [Mô hình dữ liệu, phiên bản và trạng thái](docs/architecture/data-model.md)
- 🧠 [Pipeline Gemini 2.5 Flash và hồ sơ văn phong](docs/architecture/gemini-pipeline.md)
- 🔌 [Thiết kế API MVP](docs/api/api-design.md)
- 🛣️ [Lộ trình từ prototype đến thí điểm](docs/development/implementation-roadmap.md)
- 📝 [ADR-0001 — Quyết định công nghệ](docs/architecture/decisions/0001-mvp-stack.md)
- 🤖 [Chi tiết luồng học liệu và Trợ lý Socratic (docs/architecture/knowledge-and-chatbot.md)](docs/architecture/knowledge-and-chatbot.md)
- 🤝 [Hướng dẫn đóng góp phát triển (CONTRIBUTING.md)](CONTRIBUTING.md)

---

## 📄 Bản quyền & Đóng góp
Dự án được xây dựng phục vụ nghiên cứu và ứng dụng đổi mới phương pháp giảng dạy môn Ngữ văn THPT theo định hướng phát triển năng lực GDPT 2018 tại **Trường THPT Đan Phượng**. Mọi đóng góp xin vui lòng tạo Issue hoặc Pull Request theo hướng dẫn tại [CONTRIBUTING.md](CONTRIBUTING.md).
