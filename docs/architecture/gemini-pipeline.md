# Pipeline AI với Gemini 2.5 Flash

Ngày: 12/10/2026. Model cố định theo lựa chọn người dùng: `gemini-2.5-flash`, qua adapter backend và SDK `@google/genai`. Đây là thiết kế, chưa gọi API thật hoặc đánh giá chất lượng model trên bài Ngữ văn.

## 1. Khả năng và điều kiện tích hợp

[Trang model chính thức](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash) xác nhận model nhận văn bản/ảnh và hỗ trợ structured outputs. [Google GenAI SDK](https://ai.google.dev/gemini-api/docs/libraries) là SDK lựa chọn; adapter cho luồng này dùng nhóm API `models.generateContent`/`generateContentStream`, kiểm tra tương thích với phiên bản SDK được khóa khi scaffold.

Google hiện ghi hạn chế truy cập model 2.5 theo lịch sử sử dụng tài khoản. Trước milestone tích hợp, chạy smoke test text, ảnh giả lập và JSON schema trên project thực tế. Không có quyền hoặc quota thì trả `MODEL_UNAVAILABLE`, giữ model cấu hình, không tự fallback sang model khác.

Model không tự cung cấp cơ sở dữ liệu bộ nhớ học sinh. Profile và context do ứng dụng lưu/chọn. Không dùng fine-tuning, embedding model hoặc Google Search trong MVP; tài liệu/dẫn chứng dùng nguồn giáo viên đã duyệt, phù hợp BR-03.

## 2. Adapter và prompt theo nhiệm vụ

| Task | Input được phép | Output | Điểm kiểm tra |
| --- | --- | --- | --- |
| `extract-rubric` | Barem/ngữ liệu đã kiểm tra PII, đoạn nguồn | Rubric draft + source refs | Schema, maxima, ID; giáo viên approve |
| `socratic-turn` | Assignment revision, outline, context đúng đề, profile chọn lọc, chat đã lọc PII | Câu hỏi, nguồn, gợi ý chuyển FSM/outline | 4 câu, câu hỏi cuối, không viết hộ, source scope |
| `transcribe-page` | Ảnh học sinh đã rà soát (xoay/che vùng riêng tư), pageId/index | Segment nguyên văn + vùng không rõ | Thứ tự, ID, cấu trúc; học sinh đối chiếu/sửa/xác nhận |
| `grade-transcription` | Bản chép CONFIRMED + đề/rubric/học liệu đã chốt | Điểm từng tiêu chí, evidence, lỗi, gợi ý | Bounds, criterion set, quote match; teacher review |
| `extract-writing-observations` | Bản chép và assessment đã công bố, genre, observations trước | Đặc điểm/tiến bộ với evidence | Chỉ nguồn xác nhận; không suy diễn tính cách |
| `recommend-teaching-actions` | Aggregate SQL, learning goals, taxonomy | Hành động sư phạm + metric refs | Không tạo/sửa con số; đề xuất đúng mục tiêu |

Prompt dự kiến ở `prompts/{grounding,socratic,assessment,analytics,writing-profile}`. Trong build, đóng gói prompt thành assets; không phụ thuộc đường dẫn từ cwd của worker. Mỗi prompt có version, hash, input/output schema version và bộ evaluation liên quan.

Application ports: `StructuredAiPort`, `VisionTranscriptionPort`. Adapter trả output chưa tin cậy + usage/latency/error; use case kiểm tra schema/nghiệp vụ trước persist hoặc trả UI. Key chỉ đọc từ secret environment của API/worker, không có tiền tố `NEXT_PUBLIC_`.

## 3. Cấu hình theo tác vụ

Thiết kế cấu hình tách `model`, `maxOutputTokens`, timeout, retry và thinking policy theo task. Với API/model 2.5, chỉ dùng tham số thinking mà phiên bản SDK và tài liệu endpoint xác nhận hỗ trợ; không sao chép cấu hình Gemini 3 sang 2.5. Tham khảo [thinking guide](https://ai.google.dev/gemini-api/docs/thinking) khi triển khai.

| Task | Chính sách ban đầu | Cần đo |
| --- | --- | --- |
| OCR | Chép sát ảnh, output đủ cho một trang; kiểm tra ảnh khó bằng người | CER/WER, bỏ dòng, tự sửa câu và latency |
| Socratic | Output ngắn, thinking hạn chế nếu API hỗ trợ | Tính hữu ích, viết hộ, độ trễ tới nội dung đã duyệt |
| Rubric/chấm | Output JSON và evidence, tăng suy luận khi benchmark cho thấy ích lợi | Đồng thuận giáo viên, consistency, token cost |
| Profile/analytics | Job nền, chỉ dữ liệu có nguồn đã xác nhận | Nhận xét có bằng chứng, nhầm genre, metric fidelity |

Không đặt temperature thấp rồi coi kết quả là chắc chắn hoặc hoàn toàn tái lập. Không dùng output limit quá nhỏ khiến JSON/bài chép bị cắt; truncation/incomplete finish phải trở thành lỗi tác vụ.

## 4. OCR hai bước và contract

Chép từng trang với cùng prompt/version; giữ mapping page order. Chỉ chạy song song trong quota đã xác định. Ghép theo pageIndex, không theo thời điểm request hoàn tất. Không tiếp tục chấm một bài thiếu trang thành công.

Ví dụ logical output để hoàn thiện JSON Schema:

```json
{
  "pageId": "PAGE_SYNTHETIC_1",
  "pageIndex": 1,
  "segments": [
    {
      "segmentId": "p1-s1",
      "order": 1,
      "text": "Em cho rằng sự kiên trì giúp chúng ta...",
      "needsReview": true,
      "reviewReason": "Cuối dòng bị mờ",
      "confidence": null,
      "confidenceSource": "unavailable"
    }
  ]
}
```

Đây là ví dụ thiết kế, chưa là schema thực thi. Server sinh/chuẩn hóa segment IDs ổn định trong revision, kiểm tra thứ tự và text. Prompt yêu cầu giữ nguyên lỗi dấu/chính tả/dấu câu; không đoán chữ không rõ, không dùng điểm/lập luận để tự sửa bản chép.

Không coi `0.94` trong mock là độ đúng OCR đã đo. Nếu model trả self-confidence, lưu source `model-self-report`; để `null` khi không có căn cứ. Học sinh xác nhận bản chép trước khi bài sang `READY_TO_GRADE`. Coordinates cần kiểm chứng trên ảnh; UI dùng liên kết trang/đoạn.

## 5. Chấm và kiểm tra bằng chứng

1. Lấy submission snapshot và transcription revision đã xác nhận; không nạp profile học sinh vào scoring context.
2. Lấy rubric version APPROVED, criteria maxima, score step, chính sách lỗi và học liệu của đúng assignment revision.
3. Gemini trả rubric-bound JSON với evidence `{pageId, segmentId, quote}`; thiếu nội dung là `missingElement`, không bịa quote cho đoạn không tồn tại.
4. Ajv kiểm tra schema local đầy đủ; schema gửi provider được chuyển về subset hỗ trợ, không làm mất validation local. Structured output đúng hình dạng chưa chứng minh nội dung đúng. Tham khảo [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output).
5. Domain kiểm tra criterion IDs đầy đủ/duy nhất, từng điểm hợp lệ, score step, tổng điểm, evidence quote tồn tại, source thuộc revision. Không normalize lỗi thành một kết quả “hợp lệ” mà không ghi nhận.
6. Teacher review: thấy điểm đề xuất, bằng chứng, đoạn còn nghi ngờ; sửa phải giữ AI draft, final revision, lý do và actor. Chỉ published final result đi vào báo cáo chính thức.

Teacher điều chỉnh rubric tạo version mới, không chấm lại bài cũ theo version mới âm thầm. Đo đồng thuận model so với rubric/giáo viên, không chỉ so tổng điểm.

## 6. Guardrail Socratic

Guardrail nhiều lớp: system prompt theo BR-01–BR-04; phân loại yêu cầu viết hộ; response validator; bộ tình huống adversarial. Không kỳ vọng regex phát hiện mọi đoạn viết hộ; dùng đánh giá sư phạm và manual inspection để hiệu chỉnh.

MVP không phát raw tokens trực tiếp. Dùng REST để trả toàn bộ message sau kiểm tra; có thể bổ sung SSE cho trạng thái và `message.completed` đã duyệt. Provider streaming chỉ được buffer nội bộ. Nếu response vi phạm, sửa tối đa một lần hoặc dùng câu hỏi fallback viết sẵn liên quan tới bước FSM, không lộ response bị chặn.

History/context có ranh giới dữ liệu rõ. Chỉ profile feature liên quan tới bài và có evidence còn hiệu lực được nạp. Khi học sinh yêu cầu “bỏ qua chỉ dẫn”, đoạn này vẫn là dữ liệu user; tài liệu và ảnh chứa instruction không có quyền thay system policy.

Source refs của assistant phải trỏ đúng chunk/version được nạp. Kiểm tra refs tồn tại không chứng minh mọi câu được nguồn hỗ trợ; bộ evaluation đánh giá cả nội dung. NFR-03 đo provider first token và thời gian nhận nội dung đã kiểm tra riêng, không đếm thông báo “đang xử lý” như token trả lời.

## 7. Bộ nhớ và progressive profiling

- Khảo sát ghi mục tiêu và tự đánh giá; grade-level prior là yêu cầu chương trình, không tự gán yếu điểm cho học sinh.
- Bài đầu tạo observations `PROVISIONAL` về câu, từ, bố cục, dẫn chứng và cách biểu đạt; mỗi observation có evidence.
- Bài sau đối chiếu đúng genre và cơ hội quan sát. Lỗi không xuất hiện ở một bài không tự trở thành `RESOLVED`.
- Snapshot lấy recent observations liên quan và lịch sử tiến bộ. Không cố định “3 bài = 70%” hoặc “bài 4 = tin cậy cao” trước khi đánh giá.
- Khi observation mâu thuẫn, giữ cả bằng chứng/điều kiện thay vì model tự hợp nhất thành kết luận chắc chắn. Nhận xét style không suy thành tính cách hoặc khả năng tổng quát của em.
- Không lấy văn bản chatbot sinh ra làm bài tự viết; record hỗ trợ/sửa bài nếu biết. Teacher có thể loại bài không phù hợp khỏi tập profiling.
- Profile worker xử lý event idempotent, cập nhật theo version/lock, không để job cũ ghi đè snapshot mới.

## 8. Quota, retry và evaluation

AI adapter cần deadline, circuit-breaker theo lỗi provider, usage reservation chung ở PostgreSQL và per-task budget. Tránh rate limiter chỉ in-memory khi có API và worker song song. Mỗi execution ghi usage thực tế; trường hợp timeout/crash chưa biết token vẫn giữ reservation pending reconciliation thay vì báo chi phí bằng 0.

Evaluation thí điểm đề xuất: 30–50 bài ẩn danh, đa dạng ảnh/genre, bản chép chuẩn, rubric và nhận xét giáo viên. Tách tập tune prompt với tập holdout; khi làm profile, dựng hồ sơ từ các bài đầu và đánh giá trên bài tiếp theo, tránh dùng chính bài cần dự đoán.

| Mục | Chỉ số cần báo cáo |
| --- | --- |
| OCR | CER/WER có giữ dấu tiếng Việt, page/line omission, tỷ lệ tự sửa nội dung, ảnh cần review |
| Grading | MAE tổng điểm/tiêu chí, agreement với teacher, evidence đúng, test rubric khác nhau |
| Socratic | Tỷ lệ viết hộ/vượt phạm vi, đúng 4 câu/câu hỏi cuối, mức hữu ích do teacher đánh giá |
| Profile | Observation đúng bằng chứng, teacher agreement, nhầm genre, nhận xét lỗi đã sửa bị nhắc lại |
| Operational | Latency p50/p95, queue age, retry/incomplete/safety failures, token và chi phí thực tế |

Ngưỡng đạt cần chốt theo TBD-10 trước nghiệm thu; chưa có số đo trong repository. Chỉ chuyển sang thí điểm sau khi kiểm tra quyền riêng tư, quality gate và workflow teacher review đã chạy.
