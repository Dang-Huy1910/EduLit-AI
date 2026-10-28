# Gemini Prompt — EduLit-AI Clickable Prototype

> **Prompt lịch sử — rà lại 2026-10-28:** Nội dung giao việc bên dưới phản ánh thời điểm tạo, không phải hiện trạng hay lệnh vận hành hiện tại. Dữ liệu lớp/ảnh demo đã dời sang `backend/demo/`; các file store/mock prototype đã bỏ. Backend hiện dùng Python theo [ADR-0004](../docs/architecture/decisions/0004-python-monolith.md); không áp dụng nguyên trạng yêu cầu scaffold, tạo nhánh hoặc khôi phục mock trong prompt này.

Phiên bản: 1.1 · Cập nhật: 12/10/2026.

Prompt tự chứa ngữ cảnh để Gemini (hoặc mô hình code tương đương) dựng **prototype web có điều hướng**, bám 10 màn Google Stitch đã render. Sao chép toàn bộ khối `text` bên dưới vào Gemini. Nếu Gemini đọc được repository, hãy đính kèm thêm các file trong `prototype/stitch_edulit_ai_platform_mvp/` (mỗi màn có `screen.png` + `code.html`) và `prototype/stitch_edulit_ai_platform_mvp/edulit_serene_paper/DESIGN.md`.

## Nguồn đã đối chiếu

- 10 màn Stitch đã render trong `prototype/stitch_edulit_ai_platform_mvp/`
- Token **EduLit Serene Paper** (Stitch `DESIGN.md`), không dùng palette NomadKit cũ ở `DESIGN.md` gốc
- `SRS.md` (bốn phân hệ, rubric, schema điểm, NFR quyền riêng tư)
- `docs/architecture/project-structure.md` và `frontend/README.md` (vị trí mã)
- `prompts/stitch-prompt.md` (giả định UX MVP)

## Khác biệt đã chốt cho prototype

Stitch render phong phú hơn spec 10 màn gốc. Prototype **bám màn đã render**. Dữ liệu minh họa lấy từ màn Stitch, rồi **thống nhất nội bộ** (xem mục 6 trong khối prompt). Vai trò “Xem trước vai trò” trên sidebar giáo viên chỉ là lối tắt demo; tài khoản thật không tự đổi quyền. Trường học trong prototype là **THPT Đan Phượng** (không dùng THPT Chu Văn An hay “THPT Chuyên” trên header bài thi).

```text
You are a senior frontend engineer. Build a clickable, high-fidelity web prototype of EduLit-AI inside this repository. EduLit-AI is a Vietnamese high-school Literature teaching and assessment assistant for THPT Đan Phượng, aligned with GDPT 2018.

GOAL
Reproduce the 10 Google Stitch screens as one coherent Next.js app with real client-side navigation, shared shells, mock data, and interactive demo states. Visual fidelity to the Stitch screenshots is the primary success criterion. This is a UI prototype with synthetic data. Do not call real AI, OCR, Vision, or authentication services.

IF THE REPO IS AVAILABLE
Treat these as pixel and copy sources of truth, in this order:
1. PNG screenshots in prototype/stitch_edulit_ai_platform_mvp/*/screen.png
2. HTML in the same folders (layout, Tailwind tokens, Vietnamese copy, demo-state scripts)
3. Design tokens in prototype/stitch_edulit_ai_platform_mvp/edulit_serene_paper/DESIGN.md
4. This prompt, for routing, data consistency, and implementation rules

Do not paste the Stitch HTML as a single static page. Rebuild as React components. Do not hotlink Stitch/Googleusercontent images. Recreate icons with Material Symbols and avatars as local SVG/initials.

IF THE REPO IS NOT AVAILABLE
Follow this prompt exactly, including tokens, copy, and mock data.

────────────────────────────────────────
0. SCHOOL BRANDING — THPT Đan Phượng
────────────────────────────────────────

The prototype belongs to one school: **THPT Đan Phượng** (Hà Nội). Apply this on every user-facing string, even when the Stitch PNG/HTML still says otherwise.

Replace rules:
- “THPT Chu Văn An”, “THPT Chuyên”, “Trường THPT Chuyên”, and any other school name → “THPT Đan Phượng”
- Standalone or product chrome “Ngữ văn THPT” → “Ngữ văn THPT Đan Phượng”
- “Khối 12 THPT” → “Khối 12 THPT Đan Phượng”
- Class selector / header school: “Lớp 12A1 • THPT Đan Phượng (40 HS)”
- Teacher account line: “Cô Nguyễn Thu Hà / GV Ngữ văn • THPT Đan Phượng”
- Login subtitle: “Nền tảng hỗ trợ dạy – học môn Ngữ văn THPT Đan Phượng theo định hướng phát triển phẩm chất và năng lực học sinh.”
- Sidebar brand: “GDPT 2018 • Ngữ văn THPT Đan Phượng”
- Student shell chip “Ngữ văn THPT” → “Ngữ văn THPT Đan Phượng”
- Prefill login email: nguyen.thuha@thptdanphuong.edu.vn
  (never thptchuvanan.edu.vn). Student demo email if shown: tran.minhquan@thptdanphuong.edu.vn
- OCR / exam-paper header: “SỞ GD&ĐT HÀ NỘI — TRƯỜNG THPT ĐAN PHƯỢNG”
  Paper subtitle may stay “BÀI KIỂM TRA ĐỊNH KỲ — MÔN NGỮ VĂN KHỐI 12”
- Extra class options in the report dropdown, if kept: “Lớp 12A2 • THPT Đan Phượng”, “Lớp 12 Văn • THPT Đan Phượng”
- Email domains, footer credits, toasts, empty states, PDF mock titles, and alt text follow the same school name

Do not change:
- “GDPT 2018” (national curriculum, not a school)
- “Bộ GD&ĐT” / “CSDL ngành GD&ĐT” when referring to the ministry
- Assignment literary titles (Chí Phèo, sông Hương, Tây Tiến, …)

Search the implemented UI for “Chu Văn An”, “chuvanan”, “THPT Chuyên”, and bare “Ngữ văn THPT” before finishing. The visible school name must be THPT Đan Phượng only.

────────────────────────────────────────
1. TECH STACK AND PLACEMENT
────────────────────────────────────────

Scaffold the running app in `frontend/` (the folder already exists and is empty of framework code).

- Next.js 15 App Router + React 19 + TypeScript
- Tailwind CSS 3.4+ with the exact token map below (do not invent a new palette)
- next/font for Inter and Merriweather
- Material Symbols Outlined via Google Fonts
- Client state: Zustand (persist role/session in sessionStorage)
- No backend, no database, no API keys, no `.env` secrets
- Dữ liệu seed hiện ở `backend/demo/`; mock client và simulated delays của prototype đã bỏ.
- Charts: Recharts (score distribution on the class report)
- Package manager: npm
- App language: Vietnamese UI copy; English code identifiers

Map features to existing folders:

frontend/src/app/
  (auth)/login/page.tsx
  (teacher)/layout.tsx
  (teacher)/assignments/page.tsx
  (teacher)/assignments/[id]/page.tsx          // Screen 04 editor
  (teacher)/materials/page.tsx
  (teacher)/reports/page.tsx
  (teacher)/reports/[assignmentId]/students/[studentId]/page.tsx  // teacher view of Screen 10
  (student)/layout.tsx
  (student)/assignments/page.tsx
  (student)/assignments/[id]/socratic/page.tsx
  (student)/assignments/[id]/submit/page.tsx
  (student)/assignments/[id]/ocr/page.tsx
  (student)/assignments/[id]/result/page.tsx
  (student)/materials/page.tsx                 // read-only ngữ liệu
frontend/src/components/                       // shells, buttons, badges, dialogs
frontend/src/features/{assignments,catalog,socratic,submission,assessment,classrooms,chatbot,writing-profile}/
backend/demo/
frontend/src/styles/tokens.css + globals.css

Teacher nav item “Trợ lý chấm & Rubric” routes to `/assignments/assign-nlxh-01` (Screen 04).
Student nav item “Tra cứu ngữ liệu đọc hiểu” routes to `/materials` showing the linked reading text for the current assignment.

Run:
  cd frontend && npm install && npm run dev
Dev server: http://localhost:3000
Add a short “How to run the prototype” section to frontend/README.md. Do not rewrite the rest of that file’s architecture notes.

────────────────────────────────────────
2. DESIGN TOKENS (EduLit Serene Paper)
────────────────────────────────────────

Use these Tailwind theme tokens. Do not mix in #FFFDF7 as the page canvas; Stitch uses the cool paper surface below.

colors:
  background / surface: #f8f9ff
  surface-container-lowest: #ffffff
  surface-container-low: #eff4ff
  surface-container: #e6eeff
  surface-container-high: #dee9fc
  surface-container-highest / surface-variant: #d9e3f6
  on-surface / on-background: #121c2a
  on-surface-variant: #50453b
  outline: #82756a
  outline-variant: #d4c4b7
  primary: #7d562d
  on-primary: #ffffff
  primary-container: #d4a373
  on-primary-container: #5b3912
  primary-fixed: #ffdcbd
  secondary: #006780
  on-secondary: #ffffff
  secondary-container: #76dcff
  on-secondary-container: #006077
  tertiary: #1f6c3a
  tertiary-container: #72bd82
  on-tertiary-container: #004b22
  error: #ba1a1a
  error-container: #ffdad6
  on-error-container: #93000a

typography:
  Headlines, essay titles, literary body, quotes: Merriweather 400/700, italic allowed
  UI, nav, labels, rubrics, metrics, chat chrome: Inter 400/500/600/700
  display-lg 36/48, headline-lg 28/40, headline-md 22/32, headline-sm 18/28
  literary-body-lg 18/32, literary-body-md 16/28
  body-lg 16/26, body-md 14/22
  label-md 14/20 weight 600, label-sm 12/16 weight 500, caption 11/16
  Preserve Vietnamese diacritics; give tone marks vertical room.

shape / elevation:
  inputs/buttons radius 8px (Tailwind rounded-lg in the Stitch config)
  cards/dialogs radius 12px (rounded-xl)
  pills 9999px
  Card: white surface, 1px divider using outline-variant at ~30–40% opacity, shadow 0 1px 8px rgba(0,0,0,0.04)
  Primary CTA: bg-primary-container, text-on-primary-container, hover slightly darker
  Secondary links/info: secondary / #006780
  Success: tertiary
  Sidebar width 288px (w-72), header height 64px, content offset pl-72 pt-16
  Focus-visible: 2px outline secondary with 2px offset

Icons: Material Symbols Outlined, 18–24px. Do not use emoji as the only status indicator; chips may keep a leading symbol plus a Vietnamese label.

────────────────────────────────────────
3. SHARED SHELLS AND ROUTING
────────────────────────────────────────

Public
  GET / and GET /login  → Screen 01

Teacher shell (left sidebar + top header + “Chế độ xem thử” chip)
  Sidebar brand: EduLit-AI / “GDPT 2018 • Ngữ văn THPT Đan Phượng”
  Group “Không gian Giáo viên”:
    - Bài tập & Đề kiểm tra        → /assignments
    - Kho ngữ liệu & Chuyên đề     → /materials
    - Báo cáo năng lực lớp         → /reports
    - Trợ lý chấm & Rubric         → /assignments/assign-nlxh-01
  Group “Xem trước vai trò” (prototype-only, labeled as such):
    - Bài tập của em               → switch session to student and go /assignments
    - Bài đã nộp & Nhận xét        → switch session to student and go /assignments?tab=submitted
  Footer card: “Mô hình Văn học AI” / “Chuẩn ma trận GDPT 2018”
  Header left: breadcrumb context of current class/assignment
  Header right: “Đã khớp Rubric Bộ GD&ĐT”, account “Cô Nguyễn Thu Hà / GV Ngữ văn • THPT Đan Phượng”, avatar initials “TH”, logout

Student shell
  Brand block: square “E” on primary-container + EduLit-AI + GDPT 2018 chip
  School chip under brand: “Ngữ văn THPT Đan Phượng”
  Nav:
    - Bài tập của em
    - Bài đã nộp                   → /assignments?tab=submitted
    Group “Trợ lý học tập”:
    - Trợ lý lập dàn ý Socratic    → current assignment socratic page
    - Tra cứu ngữ liệu đọc hiểu
  Footer card: “Mô hình Văn học AI” / “Chuẩn GDPT 2018 & Quy chuẩn bảo mật học sinh.”
  Header: “Khối 12 - Lớp 12A1 / Bài viết số 1 — Nghị luận xã hội”
  Header right: chip “Chế độ xem thử: Học sinh”, “Học sinh 48 / Lớp 12A1”, person avatar
  Account menu: switch to teacher (prototype-only) and logout

Guards
  Unauthenticated users hitting teacher/student routes redirect to /login.
  Teacher routes require role=teacher; student routes require role=student.
  Prototype role switch is always labeled “Chế độ xem thử” and never presented as self-service permission change.

Mobile (<768px)
  Sidebar becomes a drawer. Dual-pane screens (Socratic, OCR) become labeled tabs and keep entered content. Tables become stacked cards. Dialogs become bottom sheets. No whole-page horizontal overflow.

────────────────────────────────────────
4. SCREENS — LAYOUT, COPY, INTERACTIONS
────────────────────────────────────────

SCREEN 01 — Đăng nhập  `/login`
Centered paper card on surface background, max-width ~36rem.

Top row: chip “GDPT 2018 STANDARD” + green-dot “Hệ thống trực tuyến”.
Icon auto_stories in a circle. Title Merriweather “EduLit-AI”.
Tagline italic primary: “Tự lập dàn ý, nhận phản hồi, tiến bộ qua từng bài viết.”
Subtitle: “Nền tảng hỗ trợ dạy – học môn Ngữ văn THPT Đan Phượng theo định hướng phát triển phẩm chất và năng lực học sinh.”

Prototype state switcher (keep, labeled demo):
  Bình thường | Sai mật khẩu | Bảo trì máy chủ

Form:
  Label “Tên đăng nhập / Mã định danh học đường”
  Prefill nguyen.thuha@thptdanphuong.edu.vn
  Hint: “Dùng mã học sinh, mã định danh giáo viên hoặc email miền giáo dục cấp.”
  Password with show/hide. Link “Trợ giúp đăng nhập” can be a no-op toast.
  Notice: “Sử dụng tài khoản được nhà trường cung cấp đồng bộ theo Cơ sở dữ liệu ngành GD&ĐT.”
  CTA: “Đăng nhập vào Hệ thống”

Auth rules (mock):
  Any non-empty password in Bình thường mode succeeds.
  Teacher emails (contain “thuha” or role chosen as teacher) → /assignments
  Student emails / “tran.minhquan” → /assignments (student shell)
  Sai mật khẩu: banner “Xác thực không thành công” + recovery links
  Bảo trì: banner “Hệ thống đang đồng bộ học liệu”, disable submit
  Submitting: spinner on CTA for ~700ms

Quote card: “Văn học là nhân học — giúp người học hiểu mình, thấu suốt con người và bồi đắp lòng trắc ẩn.”

Chế độ xem thử block (separate from the form):
  Card Giáo viên Ngữ văn — Cô Nguyễn Thu Hà — “Chấm điểm rubric GDPT 2018”
  Card Học sinh lớp 12A1 — Trần Minh Quân — “Lập dàn ý & Luyện viết nghị luận”
  Clicking a card signs in as that role immediately.

Footer: “Phiên bản v2.4 — Dự án Sáng kiến Số Giáo dục Phổ thông” + Điều khoản / Bảo mật dữ liệu / Hỗ trợ kỹ thuật (static pages or toasts).

SCREEN 02 — Giáo viên: Bài tập theo lớp  `/assignments`
Title “Quản lý Bài tập theo Lớp”.
Actions: “Quản lý Kho học liệu”, “+ Tạo bài tập mới” (goes to Screen 04 for a new draft).

Class selector: “Lớp 12A1 • THPT Đan Phượng (40 HS)”, học kỳ I 2024-2025.
Metric strip: “78/80 lượt bài nộp đã được chấm AI đối chiếu Rubric”, ring “97% đã nộp”.
Pedagogy callout (dismissible): mỗi bài cần 01 học liệu chuẩn + Barem đã xác nhận; Socratic đi cùng học sinh khi lập dàn ý.

Filter chips: Tất cả 4 | Đã giao 2 | Bản nháp 1 | Chưa đủ học liệu 1
Demo control: “Thử nghiệm Xem Trống (Empty State)” → empty copy “Lớp này chưa có bài tập” + “Tạo bài tập đầu tiên”.

Four assignment cards (see mock data). Actions:
  Đã giao → “Xem báo cáo lớp” (Screen 05), “Chi tiết đề” (Screen 04)
  Bản nháp → “Tiếp tục soạn đề”, “Xóa bản nháp” (confirm dialog, local state)
  Thiếu học liệu → “Bổ sung học liệu ngay” (Screen 03), “Cài đặt rubric” (Screen 04)

SCREEN 03 — Giáo viên: Kho học liệu  `/materials`
Title “Kho Học liệu & Quản lý Ngữ liệu GDPT 2018”.
Intro: học liệu sẵn sàng dùng cho Socratic và đánh giá; chỉ học liệu trạng thái “Sẵn sàng” mới chọn được khi soạn đề.
CTA “+ Thêm học liệu mới” opens a right drawer/dialog:
  method: upload PDF/DOCX/TXT OR paste text
  fields: title, purpose (Ngữ liệu | Giáo án | Đề bài | Barem), class/assignment
  accepted formats shown; size limit described as “cấu hình theo nhà trường”, no invented megabyte cap
  After “Tải lên”, simulate Đã tải lên → Đang xử lý (~1.5s) → Sẵn sàng. A toggle in the demo bar can force “Xử lý thất bại”.

Toolbar: search by title, filter type, class, status.

Left list (4 items, see mock data) + right “Bảng Bóc Tách Xem Trước” for the selected item:
  purpose chips, source excerpt, Socratic starter questions, extracted rubric candidates
  Failed item: error “Quét scan mờ”, actions “Thử lại phân tích” and “Chọn tài liệu khác thay thế”
  Ready item: “Áp dụng Barem này” links to Screen 04 with that rubric preselected.

SCREEN 04 — Giáo viên: Soạn đề & rubric  `/assignments/[id]` and `/assignments/new`
Breadcrumb: Quản lý bài tập / Soạn đề bài mới & Cấu hình Rubric
Actions: “Lưu bản nháp” (toast “Đã lưu bản nháp”), “Xác nhận Rubric & Giao bài”

Banner: Barem Rubric v1.4, “Bản chuẩn sư phạm 2024”, note that later edits keep the version already used for graded submissions.

Main column
  1. Thông tin đề bài & Yêu cầu sư phạm
     Title: “Nghị luận xã hội: Ý nghĩa của tinh thần tự chủ trong kỷ nguyên chuyển đổi số”
     Khối 12 THPT Đan Phượng, Lớp 12A1 (40 HS), Hạn nộp 25/10/2024 23:59
     Rich-text-looking textarea (simple formatting toolbar B / I / quote is enough)
     Prompt body ≈ 600 chữ, two paragraphs, Vietnamese
  2. Barem Rubric — four criteria totaling 10.0, Hợp lệ 100%
     C1 Bố cục 2.0 with levels Xuất sắc 2.0 / Khá 1.5 / Cần cố gắng 1.0
     C2 Luận điểm & Dẫn chứng 4.0 with levels 4.0 / 3.0 / 1.5 and required-element warning
     C3 Chính tả, ngữ pháp 2.0 with “Không quá 02 lỗi +2.0đ” and “Quy chuẩn trừ điểm vi phạm −0.25đ / lỗi”
     C4 Sáng tạo 2.0 with anti-pattern quote
     Each criterion editable; “Thêm tiêu chí đánh giá mới”; live total. If sum ≠ 10, show validation error and disable publish.

Right column
  Học liệu liên kết: 2 mục đã chọn (ngữ liệu sẵn sàng + barem)
  “+ Thêm học liệu từ Kho lưu trữ” → Screen 03
  Mục tiêu học tập (3 teacher-entered goals), each linked to a criterion
  Checklist before publish: linked ready material, rubric totals 10.0, required elements present, report visible to students (last box unchecked by default)

Publish: if checklist incomplete, toast the missing item. If complete, mark assignment Đã giao and go to Screen 02.

SCREEN 05 — Giáo viên: Báo cáo lớp  `/reports`
Filters: class “Lớp 12A1 • THPT Đan Phượng (40 HS)” and the NLXH assignment. Keep this context when opening a student result. Extra dropdown options, if shown, also use THPT Đan Phượng.

Transparency banner:
  Sĩ số 40 | Đã nộp 38 | Đã đối chiếu Rubric AI 35 (87.5%)
  Flag: “3 bài flagged (1 lỗi lệch dòng OCR, 2 bản chụp chữ tay mờ)”

KPI cards:
  Đã hoàn tất Rubric 35 / 40
  Điểm trung bình lớp 7.42 / 10.0
  Phân hạng: Giỏi 9 (26%), Khá 21 (60%), Cần cố gắng 5 (14%) — these 35 must sum to 35
  Cần can thiệp sư phạm: 3 bài

Score distribution bar chart (assessed n=35):
  [4.0–5.5) 2 · [5.5–6.5) 15 · [6.5–7.5) 9 · [7.5–8.5) 7 · [8.5–10] 2
  Counts must sum to 35. Show numeric labels on bars. Do not invent a “rubric coverage %”.

Insight card: common weakness = missing counterargument / dẫn chứng công nghệ.
Heatmap-style criterion cards (4): Bố cục ĐTB 1.78/2, Luận điểm 2.85/4, Ngữ pháp 1.55/2, Sáng tạo 1.24/2 with issue frequencies.

Teaching plan table: goal ↔ criterion ↔ frequency ↔ concrete next action
  Example: 15-minute group discussion “Đâu là phản đề?” and a 10-minute sentence-revision micro-writing task.

Student table (sample rows, search + status filter):
  Lê Hoàng Yến 9.0 · Trần Minh Quân (HS 48) 7.5 · Nguyễn Đắc Anh 6.0 · Phạm Thu Ngân “Chờ duyệt ảnh / OCR đang xử lý”
  “Xem chi tiết chấm” on a graded row opens Screen 10 in teacher mode, preserving class/assignment filters.
Empty/partial: if no assessed submissions, hide mean/distribution and explain that pending/flagged papers are excluded from the 35.

Export PDF/XLS and “Gửi phản hồi chung” → toast “Chức năng xuất/gửi là mô phỏng trong prototype”.

SCREEN 06 — Học sinh: Bài tập của em  `/assignments`
Hero: “Không gian học tập & Bài viết của em”
Chip “Học sinh 48 (Lớp 12A1)” + “Dữ liệu minh họa (Prototype Demo)”
Code box: placeholder VAN12-NLXH-01, button “Mở bài”. Invalid code (anything other than VAN12-NLXH-01 / VAN12-NLVH-02) shows error “Mã không hợp lệ hoặc đã hết hạn truy cập”. Demo link “Mô phỏng lỗi”.

Metrics: Bài tập cần làm 02 · Đã chấm 01 · Tiến độ Socratic 50% dàn ý · Điểm trung bình 7.5 / 10

Tabs: Bài tập cần làm (2) | Bài đã nộp & Lịch sử chấm (1)
Demo bar: Trạng thái Rỗng | Tải dữ liệu | Khôi phục mặc định

Card 1 — Bài viết số 1, status “Đang lập dàn ý (Bước 2/4)”, deadline 25/10/2024 23:59
  Topic: “Ý chí và lòng kiên định của giới trẻ”
  Instructions excerpt (~600 chữ prompt, collapsible)
  Progress: 1 Đọc hiểu done · 2 Lập dàn ý current · 3 Viết bài · 4 Phản hồi AI
  Linked material “Ngữ liệu số 04…” ready
  Rubric summary 10.0d / 4 tiêu chí, expandable
  Actions: “Xem hướng dẫn chi tiết”, “Tiếp tục lập dàn ý” → Screen 07

Card 2 — Bài viết số 2 NLVH sông Hương, “Chưa bắt đầu”, deadline 05/11/2024 23:59
  Action: “Bắt đầu lập dàn ý”

Submitted tab: one row for Bài viết số 1, status “Đã có kết quả (7.5đ)”, action “Xem kết quả” → Screen 10.

SCREEN 07 — Socratic  `/assignments/assign-nlxh-01/socratic`
Desktop split: chat left (~55%), student-authored outline right.

Header: assignment title, chips “Ngữ liệu liên kết” (drawer) and “Tiêu chí đánh giá” (drawer).
Stepper: 1 Khởi tạo đề bài done · 2 Xác định vấn đề done · 3 Lập dàn ý Socratic current · 4 Rà soát & Viết tay upcoming
Note: “Trợ lý gợi mở để em tự xây dựng ý tưởng và dàn ý. AI không viết thay bài.”

Seeded transcript (must appear on first load):
  Student 09:15: “Em muốn nêu luận điểm: Người trẻ cần có lòng kiên định theo đuổi đam mê đến cùng dù gặp khó khăn.”
  AI (≤4 sentences, ends with a question): “Em đã nêu được ý nghĩa cốt lõi của lòng kiên định trong việc theo đuổi mục tiêu cá nhân. Để bài viết có chiều sâu và đa chiều hơn, em hãy thử xem xét ranh giới khi nào sự kiên định có nguy cơ biến thành bảo thủ hoặc mù quáng. Theo em, người trẻ nên phân biệt hai điều này bằng dấu hiệu cụ thể nào trong thực tế?”
  Button on that bubble: “Chuyển ý này vào Dàn ý” appends a student-editable bullet under Thân bài / Phản đề.
  Student 09:18: “AI viết giúp em 1 đoạn mở bài mẫu thật hay với.”
  AI refusal (no model paragraph): “Trợ lý EduLit-AI không viết đoạn văn thay học sinh để bảo đảm quyền tự chủ sáng tạo của em. Thay vào đó, em hãy thử liên hệ trực tiếp từ một hiện tượng mạng hoặc một câu chuyện thực tế về sự nỗ lực mà em tâm đắc nhất. Em dự định dẫn dắt người đọc từ hình ảnh thực tế nào trước khi đi vào vấn đề lòng kiên định?”

Quick chips: Xem lại phản đề · Kiểm tra dẫn chứng · Gợi ý liên hệ bản thân · Soát lại luận điểm
Composer: textarea, 400-character hint, send. Simulate 600–900ms “Đang phản hồi…”.

Mock reply engine (scripted, not an LLM):
  If the student message matches /viết hộ|viết giúp|đoạn mẫu|bài mẫu/i → refusal template (BR-01–BR-04): max 4 sentences, end with one question, never supply a complete paragraph.
  Else pick a guiding question from a small bank tied to the assignment (phản đề, dẫn chứng, bố cục, liên hệ bản thân). Still max 4 sentences + one question.
  Connection-error demo state: keep unsent text, banner “Mất kết nối”, explicit Retry. Do not auto-resend.

Outline (student-authored, editable bullets; AI never silently fills it):
  I Mở bài — Đặt vấn đề
  II Thân bài — 3 luận điểm (khái niệm, dẫn chứng thực tế “Cần chi tiết hóa”, phản đề)
  III Kết bài — Đánh giá & bài học
  “Thêm ý mới”, “Lưu nháp dàn ý” toast
  Completeness card ~82%: Mở bài đủ, luận điểm/phản đề present, warning “Cần chi tiết hóa dẫn chứng thực tế số 2”
  CTA enabled in this sample ready-enough state: “Chuyển sang viết tay (Nộp ảnh bài viết)” → Screen 08
  Incomplete demo state: disable CTA with “Em cần bổ sung dẫn chứng hoặc phản đề trước khi chuyển” — no numeric pass threshold presented as official policy.

SCREEN 08 — Nộp ảnh  `/assignments/assign-nlxh-01/submit`
Demo state chips: 1 Đã che hợp lệ (default) · 2 Đang phân tích & che PII · 3 Ảnh mờ / Lỗi nhận dạng PII

Title + deadline 25/10/2024 23:59
Pipeline stepper: 1 Tải & Kiểm tra ảnh done · 2 Bảo vệ thông tin PII current · 3 Nhận dạng OCR · 4 Kiểm tra bản chép · 5 Đánh giá Rubric

Photo guidance + PII policy card: “Họ tên, SBD và mã trường được tự động che trên máy client trước khi trích xuất văn bản nhằm đảm bảo chấm thi công bằng và minh bạch tuyệt đối.”
Success banner: “Bảo vệ thông tin cá nhân: Hoàn tất 2/2 trang” + “Thuật toán PII-Shield v2.4”

Pages: max 4. Default 2 JPEG pages with local illustrated placeholders (lined paper + masked name bar). Each page: preview, page index, replace, remove, move earlier/later (buttons, not drag-only), file size label.
Add-page card: file picker + “Chụp ảnh mới” (file input capture=environment). Remaining slots shown.
Disable “Xác nhận nộp bài” when 0 pages, >4 pages, or a page is in PII-failed state; explain the specific problem.

Checklist: thử tự mạch lạc · độ phân giải đủ · không lộ tên
Primary: “Xác nhận nộp bài & Chuyển sang OCR đối chiếu” → simulate pipeline 1.2s then Screen 09
Secondary: “Lưu nháp nộp bài”

Failed PII state: block submit, “Chưa thể gửi ảnh đến dịch vụ nhận dạng”, action “Cung cấp ảnh khác”.
Unreadable / upload-failure / interrupted-connection variants with Retry.

Never claim identifying information has been masked unless the simulated PII state is success.

SCREEN 09 — Bản chép OCR  `/assignments/assign-nlxh-01/ocr`
Stepper: Giai đoạn 4 / Kiểm tra bản chép OCR. Substates: Cần kiểm tra (1 đoạn) default · Sẵn sàng đối chiếu · Đã xác nhận
Confidence 94% with copy: “Độ tin cậy trung bình cao không thay thế việc rà soát các đoạn bị đánh dấu. Độ tin cậy đo độ nhận dạng, không phải chất lượng bài viết.” Pending review: “Chờ kiểm tra bản chép • Chưa xuất điểm chính thức”. No score on this screen.

Desktop: masked image left, line-numbered transcript right. Page tabs 1/2 and 2/2. Zoom +/− / 100% / rotate.

Image: school header “SỞ GD&ĐT HÀ NỘI — TRƯỜNG THPT ĐAN PHƯỢNG”, PII lock overlay “Vùng danh tính học sinh đã được mã hóa PII”, anonymous code VN-12A1-048, lined-paper body. Do not display a real student name on the page image. Do not keep “THPT Chuyên” from the Stitch mock.

Transcript ~28 lines. Flag line 14 (or the phrase “sáng suốt”) at 71% confidence.
Student: transcript is read-only. Button “Báo đoạn chưa đọc đúng” → toast, does not rewrite the essay, does not regrade.
Teacher (when opened from class report, or via “Bật chế độ sửa lỗi bóc tách của GV” demo toggle): inline correct flagged span, “Lưu chỉnh sửa”, then “Xác nhận bản chép”. Preserve original text in metadata.
Primary student CTA after ready/confirmed: “Xác nhận bản chép & Chờ phản hồi chấm Rubric” → Screen 10 (or a short pending state then Screen 10).
Recognition-failed variant: no transcript, “Không đọc được chữ viết tay”, “Nộp lại ảnh”.

Do not mark OCR uncertainty as a student spelling error.

SCREEN 10 — Kết quả rubric  `/assignments/assign-nlxh-01/result`
Banner: “Phản hồi đánh giá bằng AI (Tham vấn sư phạm)”, Barem GDPT 2018 v1.4, “Dữ liệu minh họa Prototype”
Disclaimer: “Điểm số và nhận xét từ mô hình AI là căn cứ tham vấn hỗ trợ học tập, không tự động thay thế điểm số chính thức của Giáo viên bộ môn.”
Role toggle: Học sinh (current) | Giáo viên (opens teacher shell on the same result, back-link to filtered class report).

Hero: 7.5 / 10.0, chip “Khá (Mức Khá - Phát triển năng lực)” as SAMPLE classification, not official policy.
Actions: Bài tập của em · Bản chép OCR · Xuất PDF (toast mock)

Four criteria, scores MUST sum to 7.5:
  C1 Bố cục 2.0 / 2.0
  C2 Luận điểm & Dẫn chứng 3.0 / 4.0
  C3 Chính tả, ngữ pháp 1.25 / 2.0  (include −0.50 and −0.25 penalty rows with icons + labels, not color alone)
  C4 Sáng tạo 1.25 / 2.0
Each: strengths, gaps, “Xem trích dẫn” which highlights the matching transcript lines in the right rail.

Right rail: “Trích đoạn đối chiếu trực tiếp” with numbered lines; clicking a criterion scrolls/highlights.
Pedagogical tasks as questions/exercises, never replacement paragraphs:
  1. Câu hỏi gợi mở về mục tiêu sai lầm
  2. Bài tập ngữ pháp viết lại câu
  3. Cam kết hành vi 45 phút
Buttons: Viết lại đoạn văn (goes to Socratic with a review prompt) · Lưu sổ tay (toast) · Hỏi cô giáo (toast)

Pending / unavailable variants must not show 7.5. Demo cycle chips at the bottom: Đã có kết quả · Đang chấm AI · Chờ giáo viên duyệt.

Teacher view of this screen: same scores + “Quay lại báo cáo lớp 12A1” restoring filters.

────────────────────────────────────────
5. REQUIRED SHARED BEHAVIOR
────────────────────────────────────────

- Every primary action has a next route or a visible result (toast/dialog).
- Empty, loading skeleton, validation error, service error, access-unavailable states exist where listed. Skeletons are loading only, not “offline mode”.
- Errors say what happened and the next action.
- Network-drop demo: keep typed unsent text, show “Mất kết nối”, explicit retry. Do not claim offline AI or unsaved-as-saved.
- Combine color + icon + text for status. Charts have numeric labels.
- Visible focus, logical tab order, labeled inputs. Tooltips also work on focus/tap.
- “Dữ liệu minh họa” / “Chế độ xem thử” visible on data-heavy screens.
- All user-facing copy in Vietnamese. No raw JSON, provider names as product UI, stack traces, or English status enums in the UI (map them: READY → Sẵn sàng, FAILED → Xử lý thất bại, etc.).
- Buttons: default / hover / active / focus-visible / disabled / loading.

────────────────────────────────────────
6. CANONICAL MOCK DATA
────────────────────────────────────────

Unify Stitch inconsistencies as follows:
- Logged-in student is Trần Minh Quân, display “Học sinh 48”, class 12A1, anonymous code VN-12A1-048 / HS_ANONYMOUS_48
- Teacher is Cô Nguyễn Thu Hà, THPT Đan Phượng
- School name everywhere: THPT Đan Phượng. Email domain @thptdanphuong.edu.vn
- Do not use “Nguyễn Hoàng Nam” as the account name (it appeared on a Stitch upload header). The masked paper uses VN-12A1-048 only
- Class size 40. Assignment 1 submissions: 38 submitted, 35 assessed, 3 flagged/pending. Mean of the 35 = 7.42
- Học sinh 48 individual result = 7.5/10 (SRS + Screen 10). Class table must show 7.5 for Trần Minh Quân, not 8.25
- Rubric maxima 2 + 4 + 2 + 2 = 10. Criterion scores 2.0 + 3.0 + 1.25 + 1.25 = 7.5
- Distribution counts 2+15+9+7+2 = 35
- Issue rates computed on 35 assessed papers, e.g. missing counterargument 19/35 ≈ 54% if you follow Screen 05 cards; keep whatever number you display consistent with its denominator
- Assignment code VAN12-NLXH-01
- Rubric id RUBRIC_V12_NLXH_2026 / display v1.4
- Dates: hạn nộp 25/10/2024 23:59; second assignment 05/11/2024 23:59

Assignments
  assign-nlxh-01  published  “Nghị luận xã hội: Ý nghĩa của tinh thần tự chủ…” / student-facing title “Bài viết số 1 — Nghị luận xã hội” / topic “Ý chí và lòng kiên định của giới trẻ”
  assign-nlvh-huong  published  sông Hương / Hoàng Phủ Ngọc Tường, 40/40 graded
  assign-nlvh-chipheo  draft  Chí Phèo, rubric not confirmed
  assign-nlvh-sosanh  blocked  “Chưa đủ học liệu”  Mùa xuân nho nhỏ vs Tây Tiến

Materials
  mat-ngulieu-04  READY  “Văn bản đọc hiểu số 04: Ý nghĩa của tinh thần tự chủ…”
  mat-barem-2024  READY  “Barem thang điểm 2024…”
  mat-chipheo     PROCESSING
  mat-scan-02     FAILED  scan mờ

Socratic mock bank: 6–8 guiding replies + 1 refusal template. Each ≤4 sentences and ends with one question. Stay inside the assignment and the reading excerpt.

OCR transcript: reuse the lined-paper paragraphs from Stitch Screen 09 (kiên định / thuyền / biển lớn). Flag one span at 71%. Overall 0.94.

────────────────────────────────────────
7. IMPLEMENTATION RULES
────────────────────────────────────────

- Rebuild Stitch as components; do not iframe the HTML files.
- Keep Stitch spacing, type hierarchy, chips, and sidebar/header chrome.
- Simulate processing with setTimeout; expose demo state switchers on Screens 01, 06, 07, 08, 09, 10, clearly marked “Prototype”.
- Store session { role, userId } in sessionStorage. Mock mutations (save draft, add material, confirm rubric, append outline bullet, report OCR span) stay in memory/sessionStorage.
- Do not add a real backend, Prisma, Firebase, OpenAI, Gemini API, or file-upload-to-cloud.
- Do not put real handwritten student photos or PII in the repo. Use illustrated placeholders.
- Do not implement school admin, payments, self-registration, model settings, or full lesson-plan authoring.
- TypeScript strict. Shared types for Assignment, Rubric, Material, Submission, GradingResult mirroring SRS §7 (rubric_id, weight as max score, total = sum of criterion scores).
- Accessible names on icon-only buttons.
- `frontend/README.md`: how to install/run, which routes exist, that data is synthetic.

Suggested build order
  1. Tailwind tokens, fonts, shared Button/Chip/Card/Sidebar/Header
  2. Mock data module + Zustand session
  3. Screen 01 + route guards
  4. Teacher 02 → 03 → 04 → 05
  5. Student 06 → 07 → 08 → 09 → 10
  6. Wire the two journeys end-to-end with the demo data
  7. Empty/error/loading/mobile pass

Acceptance checklist
  [ ] npm run dev shows Screen 01
  [ ] Teacher demo card → Screen 02; student demo card → Screen 06
  [ ] Teacher journey 02 → 03 → 04 → publish → 02 → 05 → student result 10 → back to 05 with same class
  [ ] Student journey 06 → 07 → 08 → 09 → 10
  [ ] Socratic refusal path works; outline remains student-editable
  [ ] Submit disabled with 0 photos; PII-failed blocks submit
  [ ] OCR 94% copy present; flagged span ≠ spelling error; no score while pending
  [ ] 7.5 = 2 + 3 + 1.25 + 1.25; report 35 = 2+15+9+7+2; mean 7.42; HS 48 is 7.5 in both table and result
  [ ] All four SRS capabilities visible: grounding, Socratic, assessment, class feedback
  [ ] Vietnamese UI only; “Dữ liệu minh họa” visible; no provider console in the learning flow
  [ ] Visible school name is THPT Đan Phượng only; no Chu Văn An, chuvanan, or THPT Chuyên leftover
```
