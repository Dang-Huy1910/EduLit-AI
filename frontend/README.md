# Frontend — EduLit-AI

Ứng dụng Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 3, Recharts và Zustand. Giao diện giáo viên/học sinh dùng FastAPI qua `/api`; dữ liệu nghiệp vụ nằm ở backend. Rà lại 2026-10-28 theo `src/app/`, các client trong `src/features/` và `src/lib/`.

## Chạy local

Khởi động backend/PostgreSQL theo [README backend](../backend/README.md) hoặc [Quick start](../README.md#khởi-chạy-local), sau đó ở cửa sổ khác:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Mở `http://localhost:3000`. `next.config.ts` rewrite `/api/:path*` tới `API_PROXY_TARGET` (mặc định `http://localhost:4000`). Client gửi cookie với `credentials: include`; mutation có header `X-Edulit-CSRF: 1`. Không đưa khóa AI vào frontend.

## Đăng nhập và dữ liệu

`/login` gửi `loginId`, `password`, `rememberMe` qua `authClient.login`. Giáo viên dùng tài khoản bootstrap của backend; học sinh tự đăng ký tại `/register`, được đánh dấu email đã xác minh và cấp phiên ngay. `AuthGate` lấy người dùng từ `/api/auth/me` sau refresh. Các trang xác minh email, quên/đặt lại mật khẩu và quản lý phiên vẫn có.

Store chung `src/lib/store.ts` giữ user đang hiển thị, toast và trạng thái sidebar; chỉ persist `sidebarCollapsed` trong `sessionStorage`. API auth quyết định danh tính. Store Socratic nằm riêng theo phiên. Dữ liệu seed lớp và ảnh demo thuộc `backend/demo/`; frontend không nạp bộ dữ liệu đó vào bundle.

## Các vị trí chính

| Vị trí | Trách nhiệm |
| --- | --- |
| `src/app/login/`, `register/`, `account/security/` | Đăng nhập, đăng ký, mật khẩu/phiên |
| `src/app/classrooms/` | Lớp, thành viên, tham gia bằng mã |
| `src/app/materials/` | Kho ngữ liệu, đề nguồn, barem và import tài liệu |
| `src/app/assignments/` | Danh sách, tạo/giao bài và xem bài được giao |
| `src/app/assignments/[id]/` | Chi tiết giáo viên; các bước học sinh `socratic`, `submit`, `ocr`, `result` |
| `src/app/assignments/[id]/students/[studentId]/assessment/` | Giáo viên rà soát bài chấm |
| `src/app/reports/` | Báo cáo năng lực nhiều bài |
| `src/app/chatbot/`, `src/app/profile/` | Tra cứu học liệu và hồ sơ văn phong |
| `src/features/` | API/types/components theo feature, gồm catalog, submission, assessment, socratic, classrooms, writing-profile |
| `src/components/`, `src/lib/` | Shell, auth, toast, HTTP client và state dùng chung |
| `public/` | Tài nguyên công khai của giao diện |

## Lệnh kiểm tra và build

Theo [CONTRIBUTING](../CONTRIBUTING.md#lint-test-và-ci), từ `frontend/`:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run test:ui
npm run build
npm start
```

`npm test` dùng Node test runner và cần Node 22.7 trở lên. `test:ui` dùng cấu hình Playwright `playwright.ui.config.ts`; `test:e2e` dùng cấu hình Playwright mặc định. `build`/`start` tạo và chạy bản production Next.js. CI hiện chạy lint, typecheck và unit tests; không chạy Playwright.

Kiến trúc và các phần cần kiểm chứng tiếp ở [ADR-0004](../docs/architecture/decisions/0004-python-monolith.md) và [roadmap](../docs/development/implementation-roadmap.md).
