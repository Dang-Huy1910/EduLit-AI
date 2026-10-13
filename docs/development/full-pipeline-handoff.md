# Bàn giao full pipeline

Ngày: 13/10/2026. Nhánh hiện tại: `feat/writing-profile-integration`.

## Nhánh và phạm vi

| Nhánh | Việc |
| --- | --- |
| `feat/ai-foundation` | Config provider/model, adapter Gemini/OpenAI, provenance |
| `feat/teacher-assignments` | Teacher CRUD/publish/close, trang đọc, mã đề |
| `feat/submission-ocr` | Upload private, mask burn-in, OCR, xác nhận bản chép |
| `feat/assessment-integration` | Grade AI_DRAFT, review/publish, student PENDING vs official |
| `feat/writing-profile-integration` | Job extraction, profile UI, seed:demo, progress, e2e |

Không merge/push trong bàn giao này.

## Migration mới

- `backend/prisma/migrations/20261013230000_profile_extraction_jobs/` — bảng `profile_extraction_jobs` (PENDING/PROCESSING/COMPLETED/FAILED, lease, `noObservations`).

Dữ liệu Submission/Assessment văn bản cũ không bị gán OCR confirmed.

## Cách chạy API mode

```bash
# backend
cd backend
cp .env.example .env   # điền mật khẩu DB/seed, không commit
npm install
npm run db:setup
npm run seed:demo      # additive DEMO-*
AI_MODE=mock npm run dev

# frontend
cd frontend
PORT=3000 NEXT_PUBLIC_DATA_MODE=api NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api npm run dev
```

Mở `http://localhost:3000/login`. Teacher tạo đề mới hoặc học sinh `tran.minhquan` mở `DEMO-NLXH-12`.

## Kiểm tra thủ công (không SQL)

1. Giáo viên `dang.loan` → Tạo đề mới → nhập ngữ liệu/barem → Lưu nháp → Công bố → sao chép mã.
2. Học sinh mở mã → bấm **Tôi đã đọc đề và ngữ liệu** → Socratic, lưu dàn ý → sang viết tay.
3. Tải `nlxh-p1.png` và `nlxh-p2.png`, đổi thứ tự, Che đầu trang, gửi duyệt.
4. Giáo viên Hàng chờ: Duyệt ảnh → Chạy OCR → sửa/xác nhận bản chép.
5. Học sinh báo lỗi đoạn OCR nếu cần; không tự đổi bản chép.
6. Giáo viên Chấm bằng AI. Học sinh vào kết quả chỉ thấy **chờ công bố**, không thấy điểm nháp.
7. Giáo viên Duyệt & công bố. Học sinh thấy điểm official + evidence.
8. Hồ sơ văn phong của học sinh hiện excerpt; đề NLXH sau dùng observation đó ở Socratic. Grader không nhận profile.

## Checks

Đã chạy trên nhánh `feat/writing-profile-integration` (13/10/2026):

- `backend`: `npm run typecheck`, `npm test` (56), `npm run test:db` (63, gồm `http-pipeline` + `seed:demo`).
- `frontend`: `npm run typecheck`.
- Playwright API mode + `AI_MODE=mock`: `full-pipeline.spec.ts` và `socratic-integration.spec.ts` pass.

Live Gemini/OpenAI/OCR chữ viết tay **chưa kiểm chứng** trong lượt này. `AI_MODE=mock` dùng fake có provenance `mock/*`. Không tuyên bố CER/WER hay chất lượng sư phạm.

## Ngoài scope

Lớp/phân phối từng học sinh, email, thanh toán, RAG/queue/Redis, dashboard nâng cao, parse PDF/DOCX thành rubric, reopen/regrade lịch sử.
