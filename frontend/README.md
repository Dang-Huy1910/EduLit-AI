# Frontend — EduLit-AI

Ứng dụng web Next.js 15 dành cho Giáo viên (**Cô Đặng Loan**) và Học sinh (**Bùi Hà My**) trường **THPT Đan Phượng**, hỗ trợ chu trình Dạy – Học và Đánh giá môn Ngữ văn theo chương trình GDPT 2018.

Hai chế độ: **mock** (prototype Zustand/sessionStorage) và **api** (login/HTTP/PostgreSQL thật). [Bàn giao Socratic integration](../docs/development/socratic-integration.md). Gemini 2.5 Flash chỉ gọi từ backend; không đưa API key vào bundle trình duyệt.

---

## 🏛️ Cấu trúc thư mục

| Thư mục | Trách nhiệm |
| :--- | :--- |
| `src/app/` | Next.js 15 App Router: Định tuyến, Layout và Providers toàn cục |
| `src/app/assignments/` | Danh sách bài tập, Soạn đề & Cấu hình Rubric 10.0đ |
| `src/app/assignments/[id]/` | Chu trình 5 bước làm bài: `/socratic`, `/submit`, `/ocr`, `/result` |
| `src/app/materials/` | Kho học liệu & Quản lý ngữ liệu đọc hiểu, barem GDPT 2018 |
| `src/app/reports/` | Báo cáo năng lực lớp 12A1 & Kế hoạch điều chỉnh giáo án |
| `src/app/login/` | Màn hình đăng nhập phong cách VLearn với nền trường THPT Đan Phượng |
| `src/components/` | Shell giao diện (`TeacherShell`, `StudentShell`), Stepper 5 bước, Toasts |
| `src/features/` | Components nghiệp vụ (`assignments`, `assessment`, `reports`) |
| `src/lib/` | Zustand Store (`store.ts`), Types (`types.ts`), Dữ liệu mẫu THPT Đan Phượng (`mock/`) |
| `public/` | Tài nguyên tĩnh (ảnh trường THPT Đan Phượng `anh-truong.jpg`, favicon) |

---

## 🚀 Hướng dẫn khởi chạy (Local Development)

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Truy cập trình duyệt: **[http://localhost:3000](http://localhost:3000)** (tự động chuyển hướng về `/login`).

| `NEXT_PUBLIC_DATA_MODE` | Việc |
| --- | --- |
| `mock` (mặc định) | Prototype 1-click, dữ liệu Zustand |
| `api` | Cookie session tới `NEXT_PUBLIC_API_BASE_URL` (`http://localhost:4000/api`) |

API mode cần backend `AI_MODE=mock npm run dev` trên cổng 4000, cùng hostname `localhost`. Đăng nhập `bui.hamy` / `DEV_SEED_PASSWORD`, mở đề `VAN12-NLXH-SOC`. Không dùng `VAN12-NLXH-01` để thử chat mới.

```bash
npm run typecheck
npm run build
# Backend đang chạy, DATA_MODE=api:
npm run test:e2e
```

---

## 🔑 Tài khoản đăng nhập nhanh (1-Click Demo)

Tại màn hình đăng nhập, hệ thống cung cấp sẵn 2 nút đăng nhập 1-click để kiểm thử nhanh hai vai trò:

1. **Giáo viên:** Bấm **"Cô Đặng Loan"** (GV Ngữ văn • Lớp 12A1 THPT Đan Phượng)
   - Quản lý đề bài, giao đề mới, cấu hình Rubric 4 tiêu chí.
   - Theo dõi báo cáo năng lực lớp và điều chỉnh giáo án.
2. **Học sinh:** Bấm **"Bùi Hà My"** (Học sinh Lớp 12A1 • Mã định danh: `VN-12A1-048`)
   - Xem bài tập cần làm & bài đã nộp.
   - Trải nghiệm chu trình 5 bước: Đọc hiểu &rarr; Lập dàn ý Socratic &rarr; Viết tay & Nộp ảnh (PII-Shield) &rarr; Soát lỗi OCR &rarr; Nhận bảng điểm Rubric 7.5đ.

---

## ⚡ Nút "Khôi phục Demo (Reset)"

Ở thanh Header và Sidebar của cả hai vai trò đều có nút **⚡ Khôi phục Demo (Reset)**.  
Bấm nút này sẽ xóa sạch cache `sessionStorage` và đưa toàn bộ đề bài, dàn ý, bài nộp về trạng thái xuất phát ban đầu để sẵn sàng chạy lại kịch bản thuyết trình.
