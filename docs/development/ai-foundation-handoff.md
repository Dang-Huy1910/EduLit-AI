# AI foundation handoff

Branch: `feat/ai-foundation`.

## Đã hoàn thành

- `AI_MODE`, `AI_PROVIDER`, model shared/task override và legacy `GEMINI_MODEL` được resolve một lần ở factory. Gemini mặc định `gemini-2.5-flash`; OpenAI yêu cầu model rõ ràng.
- Gemini và OpenAI đều triển khai Socratic, assessment và writing-profile port. OpenAI dùng Responses API structured JSON; kết quả vẫn qua validation nghiệp vụ tại backend.
- Fake adapter ghi model `mock/*`; không còn báo kết quả mock là Gemini/OpenAI. Live adapter không fallback âm thầm sang mock.
- Migration `20261013193000_ai_provenance` bỏ default model ở assessment và thêm provenance nullable cho historical chat/assessment/observations. Row cũ giữ unknown/null, không bị suy diễn từ cấu hình mới.
- Socratic scaffold giữ network ngoài transaction, kiểm tra lại actor/assignment/submission trước commit, increment outline revision khi scaffold được ghi, và không thay outline trống mà học sinh đã chủ động lưu. Provider/network errors được trả để retry; chỉ output invalid mới dùng fallback có giới hạn.

## Kiểm chứng

- `npm run prisma:validate`
- `npm run prisma:generate`
- `npm run typecheck`
- `npm test`
- `npm run test:db` (55 integration tests, DB test riêng)

Live Gemini/OpenAI chưa chạy: không có live smoke opt-in với key/model do người dùng chọn. Fake transport và database tests xác nhận integration, không đánh giá chất lượng sư phạm hoặc OCR.

## Điều kiện cho pipeline

Pipeline tiếp theo dùng `createAssessmentAiFromEnv` và `createWritingObservationAiFromEnv`; OCR sẽ có vision port riêng nhưng theo cùng quy tắc config/provenance. API/UI vẫn cần teacher CRUD, private file storage, OCR review và workflow publish.
