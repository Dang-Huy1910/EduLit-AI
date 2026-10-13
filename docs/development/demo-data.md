# Dataset demo pipeline

Lệnh opt-in, additive, không phải `prisma db seed` thường. Từ chối `NODE_ENV=production`. Không reset DB, không đổi mật khẩu tài khoản đã có.

```bash
cd backend
npm run seed:demo
```

Password lấy `DEV_SEED_PASSWORD`. IDs namespace `edulit-demo-v1:` / mã đề `DEMO-*`. Chạy lại idempotent; record demo đã sửa tay được giữ nguyên.

## Tài khoản

| loginId | Vai trò | Ghi chú |
| --- | --- | --- |
| `dang.loan` | Giáo viên | Giáo viên chính; sở hữu hầu hết đề DEMO. |
| `pham.thuha` | Giáo viên | Giáo viên thứ hai, đề `DEMO-NLVH-DRAFT` để thử ownership. |
| `tran.minhquan` | Học sinh | **Chưa bắt đầu** `DEMO-NLXH-12`. Dùng để chạy mới năm bước trên UI. |
| `bui.hamy` | Học sinh | Nhiều bài NLXH + một bài NLVH; có profile. |
| `nguyen.an` | Học sinh | Có bài trên đề CLOSED. |
| `le.thuong` … `mai.son` | Học sinh | 9 học sinh demo còn lại, phân bố 24 hồ sơ tiến độ. |

Nút 1-click: `dang.loan`, `bui.hamy`, `nguyen.an`, `tran.minhquan`.

## Đề DEMO-*

| Mã | Trạng thái | Thể loại | Khối | Rubric |
| --- | --- | --- | --- | --- |
| `DEMO-NLXH-10` | PUBLISHED | NLXH | 10 | 3 tiêu chí, max 8, step 0.50 |
| `DEMO-NLXH-11` | PUBLISHED | NLXH | 11 | 4 tiêu chí, max 10, step 0.25 |
| `DEMO-NLXH-12` | PUBLISHED | NLXH | 12 | 4 tiêu chí; đề chạy pipeline mới |
| `DEMO-NLVH-12` | PUBLISHED | NLVH | 12 | 3 tiêu chí |
| `DEMO-NLXH-NEXT` | PUBLISHED | NLXH | 12 | Đề cùng genre sau khi có profile |
| `DEMO-NLXH-DRAFT` | DRAFT | NLXH | 12 | Nháp giáo viên Loan |
| `DEMO-NLVH-DRAFT` | DRAFT | NLVH | 11 | Nháp giáo viên Thu Hà |
| `DEMO-NLXH-CLOSED` | CLOSED | NLXH | 12 | Học sinh đã tham gia vẫn xem được |

`dueAt` chỉ mang tính thông tin, không chặn nộp.

## Kịch bản chạy mới trên UI

1. `cd backend && AI_MODE=mock npm run dev`
2. Frontend: `PORT=3000 NEXT_PUBLIC_DATA_MODE=api NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api npm run dev`
3. Đăng nhập `tran.minhquan`, mở mã `DEMO-NLXH-12`.
4. Đọc đề → xác nhận đã đọc → Socratic → nộp 2 ảnh fixture → giáo viên `dang.loan` duyệt/OCR/chấm/công bố.
5. Mở `DEMO-NLXH-NEXT` để Socratic đọc profile cùng genre.

## Fixtures ảnh

Sinh bằng `cd backend && npm run ocr:fixtures`. File nằm ở `frontend/tests/e2e/fixtures/ocr/`. Đây là **ảnh in tổng hợp**, không dùng để đánh giá OCR chữ viết tay.

| File | Nội dung |
| --- | --- |
| `nlxh-p1.png` | Trang 1 NLXH, header PII giả (18% trên cùng) |
| `nlxh-p2.png` | Trang 2, có emoji |
| `illegible.png` | Đoạn `needsReview` |
| `unicode.png` | Tiếng Việt + ký tự ngoài BMP |

Fake OCR khớp `sourceHash` của PNG gốc. Ảnh lạ ở `AI_MODE=mock` trả lỗi fixture, không bịa bài chung.

Provenance seed: `provider=mock`, `modelName=demo-fixture/mock`. Không giả kết quả Gemini/OpenAI live.
