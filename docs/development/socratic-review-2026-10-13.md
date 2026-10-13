# Review Socratic Grok — 13/10/2026

Commit được review: `faf82c4`, nhánh `feat/socratic`. Kết luận: application layer và demo chạy được, nhưng cần sửa các lỗi dưới đây trước khi nghiệm thu feature và chuyển sang assessment. Review không sửa implementation.

## Kết quả kiểm tra thực tế

| Kiểm tra | Kết quả |
| --- | --- |
| Prisma validate/generate, TypeScript typecheck | Đạt |
| Unit tests | 21/21 đạt |
| Integration tests trên PostgreSQL mới | 23/23 đạt |
| Build và test prompt assets trong dist từ cwd khác | 1/1 đạt |
| Ba migrations apply trên DB mới | Đạt |
| CLI mock qua các process riêng: open, turn, replay, outline, resume | Đạt; không nhân đôi messages |
| Adapter Gemini với HTTP giả lập, không gọi mạng | Gửi đúng system/schema/model; timeout thành AI_TIMEOUT; 429 thử hai lần rồi RATE_LIMITED |

Database review tách biệt database dev. Các ca bổ sung dùng tài khoản, đề và phản hồi tổng hợp. Không gọi Gemini thật trong lần review này; fake adapter và HTTP giả lập không chứng minh chất lượng model. Bộ 12 evaluation cases đã có nhưng chưa có kết quả nghiệm thu hành vi model trên bộ đó.

## 1. P1 — Guardrail vẫn chấp nhận và lưu đoạn mở bài viết hộ

Vị trí: [validate-socratic-output.ts](../../backend/src/modules/socratic/application/guardrails/validate-socratic-output.ts), `looksLikeSampleEssay` dòng 106; [send-socratic-turn.ts](../../backend/src/modules/socratic/application/send-socratic-turn.ts), kiểm tra output rồi persist.

Tái hiện với fake adapter, câu hỏi học sinh: “Viết giúp em một mở bài để em chép vào bài văn.” Output giả lập:

> Trong cuộc sống, ý chí và lòng kiên định là ngọn lửa soi đường cho con người vượt qua nghịch cảnh. Nhờ giữ vững niềm tin và bền bỉ theo đuổi mục tiêu, người trẻ có thể biến khó khăn thành cơ hội để trưởng thành. Em có muốn dùng hai câu trên làm phần mở bài không?

Kết quả: `inspectSocraticOutput` trả hợp lệ; `sendSocraticTurn` trả `responseMode=model` và lưu nguyên đoạn vào assistant message. Output chỉ có ba câu và kết thúc bằng câu hỏi nên qua kiểm tra cấu trúc; không có những cụm từ regex đang chặn. Quy tắc không viết hộ bị vi phạm dù toàn bộ tests sẵn có qua.

Chiều ngược lại, lời từ chối hợp lệ “Thầy/Cô không cung cấp bài mẫu cho em. Em muốn tự phát triển ý nào trước?” bị chặn `WRITE_FOR_STUDENT` vì regex bắt mọi lần xuất hiện “bài mẫu”, không xét phủ định.

Sửa: bổ sung xử lý yêu cầu viết hộ rõ ràng trước khi gọi provider và chuyển sang lời từ chối/câu hỏi đã duyệt; kiểm tra output dựa trên ngữ cảnh yêu cầu, không chỉ từ khóa. Thêm regression tests cho đoạn mẫu không có nhãn và lời từ chối có từ “bài mẫu”. Giữ validation cấu trúc; đánh giá ngữ nghĩa bằng evaluation/manual review, không cam kết một regex hay classifier là bảo đảm tuyệt đối.

## 2. P1 — Context mất nội dung chi tiết của rubric

Vị trí: [build-socratic-context.ts](../../backend/src/modules/socratic/application/conversations/build-socratic-context.ts), `criterionList` dòng 104.

Tái hiện: rubric có criterion gồm `descriptor` và `requiredElements`, đặt marker riêng trong mỗi field; mở session và gửi một lượt, kiểm tra payload fake adapter nhận.

Kết quả: cả hai field đều vắng trong payload. Context chỉ gửi criterionId, name và weight. Ví dụ yêu cầu “phân biệt kiên định với bảo thủ” hoặc “dẫn chứng từ tình huống lớp học” trong rubric không đến được model, dù snapshot lưu đủ.

Hệ quả: chatbot có thể hướng dẫn theo tên tiêu chí chung nhưng không biết yêu cầu giáo viên dùng để đánh giá. Kiểm tra schema/criterion IDs đúng không khắc phục được thông tin thiếu.

Sửa: serialize rubric của session đầy đủ, gồm descriptor/requiredElements và cấu hình điểm cần thiết; giữ ranh giới dữ liệu không tin cậy và context budget. Thêm test xác nhận yêu cầu chi tiết còn nguyên trong payload, không chỉ kiểm tra mã tiêu chí.

## 3. P2 — Live smoke không nạp cấu hình từ .env

Vị trí: [socratic-live-smoke.ts](../../backend/scripts/socratic-live-smoke.ts), imports đầu file và kiểm tra key dòng 38.

Tái hiện trong process riêng: cwd có `.env` chứa API key giả lập, process không export key; chạy script với `--live`. Chặn toàn bộ network trong test.

Kết quả: exit code 2, báo “thiếu GEMINI_API_KEY”. Script không import dotenv/config; các imports hiện tại cũng không nạp dotenv. Key khai trong .env theo workflow backend không được đọc. Nếu chỉ đặt SOCRATIC_LIVE trong .env, flag cũng chưa được nạp.

Sửa: nạp env trước khi đọc LIVE_FLAG/key hoặc dùng bootstrap env thống nhất. Thêm test process riêng với .env tổng hợp. Live smoke nên dùng context builder thật và rubric fixture đầy đủ; hiện payload smoke cũng chỉ có tiêu đề/ngữ liệu/câu hỏi, chưa kiểm tra toàn bộ context production.

## 4. P2 — Tài khoản bị vô hiệu hóa trong lúc chờ model vẫn commit lượt mới

Vị trí: [send-socratic-turn.ts](../../backend/src/modules/socratic/application/send-socratic-turn.ts), kiểm tra actor dòng 51; [persist-turn.ts](../../backend/src/modules/socratic/application/persist-turn.ts), kiểm tra trong transaction dòng 35.

Tái hiện: bắt đầu lượt với student ACTIVE; giữ fake provider chờ; chuyển user sang INACTIVE; trả response hợp lệ.

Kết quả: lượt vẫn thành công và lưu hai messages. Transaction kiểm tra session/assignment/submission nhưng không kiểm tra lại role/status của user sau thời gian gọi mạng.

Sửa: revalidate actor tại bước commit với policy khóa/thứ tự khóa nhất quán. Thêm test vô hiệu hóa hoặc đổi role trong lúc generation, bảo đảm response không được commit khi quyền đã bị thu hồi.

## 5. P2 — Request trùng đồng thời trả sai responseMode

Vị trí: [persist-turn.ts](../../backend/src/modules/socratic/application/persist-turn.ts), nhánh trả cặp đã tồn tại dòng 62; [send-socratic-turn.ts](../../backend/src/modules/socratic/application/send-socratic-turn.ts), return dùng responseMode cục bộ dòng 149.

Tái hiện: hai request cùng session/requestId/message đều bắt đầu trước commit. Provider A trả output sai → ứng dụng chọn fallback. Provider B trả output hợp lệ → ứng dụng chọn model. Cho A commit trước, sau đó B persist.

Kết quả: đúng hai messages được lưu, cả hai request trả cùng nội dung fallback. Tuy nhiên request B gắn `responseMode=model`, vì persistence trả messages cũ còn use case giữ metadata của generation B. Kết quả đã lưu và thông tin nguồn phản hồi không nhất quán.

Sửa: persistence báo rõ created/replayed; use case trả mode phù hợp với kết quả thực sự trả cho client. Nếu cần lưu origin mode/promptVersion để audit, thêm metadata tối thiểu qua migration mới. Không gắn usage của một generation khác như nguồn của assistant message được replay. Thêm test trùng request với hai output khác nhau, thay vì chỉ test hai FakeSocraticAi trả cùng default.

## Những phần đã làm phù hợp

- Adapter tách khỏi use case; SDK/schema/system instruction chạy được trong kiểm tra offline.
- Network call nằm ngoài transaction; transaction lưu USER/ASSISTANT cùng nhau.
- Khóa assignment rồi session, kiểm tra optimistic sequence và outlineRevision.
- Idempotency dựa trên database; replay qua process mới không tạo messages trùng.
- Ownership/actor ban đầu được kiểm tra; context lấy snapshot phiên, history đúng phiên và profile đọc lại mỗi lượt.
- Nguồn profile RESOLVED/INVALIDATED bị loại khỏi nhu cầu luyện hiện hành.
- Prompt assets đóng gói vào dist, có demo CLI và tài liệu bàn giao.

## Thứ tự hoàn thiện

Sửa hai lỗi P1 trước, tiếp theo env/live smoke, quyền tại commit và metadata replay. Bổ sung regression tests, chạy lại bộ tests và CLI. Sau đó chạy live smoke bằng dữ liệu tổng hợp khi bật chế độ live, rồi đánh giá bộ tình huống tiếng Việt và kiểm tra thủ công hành vi viết hộ/phạm vi nguồn. Chưa nên kết luận chất lượng Gemini đạt hoặc chuyển sang nghiệm thu assessment chỉ từ các test phần mềm đang qua.
