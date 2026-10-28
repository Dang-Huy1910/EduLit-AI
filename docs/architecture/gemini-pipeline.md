# Pipeline AI — OpenAI, Gemini và fake

Rà lại **2026-10-28** theo `backend/app/config.py`, `app/ai/adapters.py`, `prompt_assets.py`, các service và worker. Tên file giữ để các liên kết cũ tiếp tục hoạt động; model không cố định là Gemini 2.5 Flash. [ADR-0004](decisions/0004-python-monolith.md) ghi nhận cấu hình hiện tại.

## 1. Adapter và cấu hình thực thi

`AI_PROVIDER` chọn `openai`, `gemini` hoặc `fake`; mặc định `openai`. `AI_MODEL` mặc định trống và cần điền cho provider thật. OpenAI dùng SDK Responses API với structured parse; Gemini dùng REST qua HTTPX; fake tạo dữ liệu kiểm thử. Khóa tương ứng là `OPENAI_API_KEY`, `GEMINI_API_KEY`, chỉ đọc ở backend.

Factory mặc định báo lỗi khi thiếu key/model; nhánh `allow_missing_key` là tùy chọn nội bộ, không phải cơ chế frontend chuyển sang dữ liệu giả khi API lỗi. Dịch vụ ánh xạ lỗi cấu hình/hạ tầng phù hợp sang `AI_UNAVAILABLE` hoặc lỗi tác vụ. Không suy luận quyền/quota một model từ tên model ghi trong tài liệu; muốn dùng provider thật cần smoke test project được cấp.

| Cấu hình | Vai trò hiện tại |
| --- | --- |
| `AI_TIMEOUT_SECONDS`, `AI_MAX_OUTPUT_TOKENS`, `AI_MAX_RETRIES` | Giới hạn chung; retry transport OpenAI do SDK quản lý |
| `OCR_MODEL`, `OCR_TIMEOUT_SECONDS`, `OCR_MAX_OUTPUT_TOKENS` | Override OCR; model trống kế thừa `AI_MODEL` |
| `ASSESSMENT_MODEL`, `ASSESSMENT_TIMEOUT_SECONDS`, `ASSESSMENT_MAX_OUTPUT_TOKENS` | Override chấm |
| `WRITING_PROFILE_MODEL`, `WRITING_PROFILE_TIMEOUT_SECONDS`, `WRITING_PROFILE_MAX_OUTPUT_TOKENS` | Override tổng hợp profile |
| `IMPORT_AI_TIMEOUT_SECONDS`, `IMPORT_AI_MAX_OUTPUT_TOKENS`, `IMPORT_AI_MAX_INPUT_CHARS` | Phân tích tài liệu sau chuyển Markdown |
| `INSIGHT_TIMEOUT_SECONDS`, `INSIGHT_MAX_OUTPUT_TOKENS` | Gợi ý dạy học từ số liệu |

Đây là cấu hình có trong Settings, không phải cam kết độ trễ/chi phí hay chất lượng model.

## 2. Prompt và nhiệm vụ đang có

| Luồng | Prompt canonical | Version setting | Kiểm tra/cách chạy |
| --- | --- | --- | --- |
| Hội thoại Socratic | `prompts/socratic/system.v1.md` | `SOCRATIC_PROMPT_VERSION=v1` | LangGraph pre/post guardrail, schema và source refs |
| Chuẩn bị dàn ý | `prompts/socratic/outline-init.v2.md` (còn v1) | `OUTLINE_INIT_PROMPT_VERSION=v2` | Job theo học sinh, worker outline-prep |
| Import catalog | `prompts/catalog/document-extract.v1.md` | `IMPORT_PROMPT_VERSION=v1` | Pydantic/validator barem; giáo viên rà soát và confirm |
| OCR | `prompts/ocr/transcribe-page.v1.md` | `OCR_PROMPT_VERSION=v1` | Worker OCR, chép từng trang, học sinh xác nhận |
| Chấm | `prompts/assessment/grade-essay.v1.md` | `ASSESSMENT_PROMPT_VERSION=v1` | Bản chép CONFIRMED, rubric/đề đã chốt, kiểm điểm/evidence |
| Insight lớp | `prompts/assessment/class-insight.v1.md` | `INSIGHT_PROMPT_VERSION=v1` | Assessment worker nhận job từ POST; GET không tạo AI call |
| Hồ sơ viết | `prompts/assessment/writing-profile.v2.md` (còn v1) | `WRITING_PROFILE_PROMPT_VERSION=v2` | Nguồn là bài đã công bố, kiểm bằng chứng và source hash |

`prompt_assets.py` đọc file canonical khi chạy trong checkout, hoặc asset đóng gói khi cài wheel. Hook `backend/_prompt_build.py` đồng bộ prompt vào package; phiên bản không tồn tại là lỗi, không tự lấy bản khác. Schema/validator thực thi nằm ở `app/ai/schemas.py` và service/workflow Python, không phải Ajv. `contracts/schemas/` chưa có schema xuất riêng.

## 3. OCR rồi chấm rubric

1. Học sinh tải ảnh, tự rà soát/che vùng riêng tư; backend kiểm tra ảnh JPEG/PNG thật, giới hạn trang/dung lượng/kích thước và chuẩn hóa bằng Pillow.
2. Submit đóng băng bộ ảnh và xếp OCR trên `submission_attempts`; worker claim lease, chép theo trang và lưu output/segments/bản chép. Không dùng output một trang để coi cả bộ ảnh là đã xong.
3. Học sinh đối chiếu, sửa và xác nhận transcription revision. Đây là nộp chính thức, ghi `official_submitted_at` và xếp assessment job. Không có bước giáo viên duyệt OCR.
4. Chấm nhận assignment revision/barem đã chốt và bản chép CONFIRMED, không nhận profile học sinh để tính điểm. Mã Python kiểm tra tiêu chí, điểm và bằng chứng trước lưu.
5. Giữ AI payload, bản rà soát giáo viên và snapshot công bố riêng. Học sinh thấy điểm sau công bố; thay đổi bản nộp/version gây conflict cho mutation cũ.

OCR không phải tự sửa văn. Confidence do model khai không phải accuracy đã hiệu chuẩn; học sinh vẫn cần đối chiếu ảnh. Privacy detection tự động và OCR tài liệu PDF scan nhập kho chưa có pipeline hoàn chỉnh.

## 4. Socratic và chatbot

Socratic dùng session/FSM, outline và ngữ cảnh revision có quyền. LangGraph áp dụng pre-guardrail và post-validation, giới hạn phản hồi gợi mở và kiểm tra nguồn. Lượt chat có reservation và idempotency; không giữ transaction claim trong thời gian chờ provider. Response trả sau kiểm tra, chưa có raw token streaming/SSE.

Chatbot tra cứu là `/api/chatbot`, dùng keyword retrieval trên chunks có quyền và tài liệu hướng dẫn, không dùng vector database. Xem [luồng học liệu và chatbot](knowledge-and-chatbot.md). Chất lượng gợi mở, từ chối viết hộ và độ đúng trích dẫn vẫn cần evaluation riêng.

## 5. Hồ sơ văn phong

`WritingProfileService` tổng hợp từ những bài đã công bố và bản chép tương ứng, giới hạn nguồn/input theo Settings, kiểm observation/evidence rồi lưu cache cùng source hash và history version. GET đọc; POST refresh tổng hợp khi cần. Worker sweep tạo profile đầu tiên cho học sinh đủ nguồn, backoff lỗi trong bộ nhớ; chưa có bảng job profile.

Không lấy câu chatbot sinh làm bằng chứng bài tự viết, không suy tính cách từ lỗi văn, không coi số bài là confidence đã đo. Goal survey và bảng observation độc lập của thiết kế ban đầu chưa có. Profile phục vụ hướng dẫn, không tham gia chấm điểm.

## 6. Job và lỗi

OCR/outline-prep/chấm có job trạng thái, lease, concurrency và số lần thử trong PostgreSQL; dùng helper `workers/_loop.py`. Assessment còn xử lý class insights. Bốn worker gắn vào process API theo cờ Settings, trừ môi trường test. Không có pg-boss/outbox dispatcher hay usage reservation ledger chung.

Timeout, lỗi provider hoặc output không hợp lệ phải được thể hiện bằng lỗi/trạng thái tác vụ. Lease chống ghi đè kết quả mới bằng job cũ, không bảo đảm không lặp lượt gọi provider sau crash. Giới hạn retry/concurrency là cơ chế có sẵn, chưa thay thế việc đo quota và chi phí.

## 7. Kiểm thử phần mềm

Backend có fake adapter/MockTransport và pytest; frontend có Node unit tests/Playwright. Build prompt có kiểm tra asset. Hướng dẫn chạy ở [CONTRIBUTING](../../CONTRIBUTING.md#lint-test-và-ci) và [README backend](../../backend/README.md). Các test này không chứng minh OCR/chấm đạt chất lượng trên bài thật.

## 8. Quota, retry và evaluation

M6 còn cần dataset được phép sử dụng, tách tuning/holdout, bản chép chuẩn và điểm/nhận xét giáo viên. `evaluations/` mới là chỗ dành sẵn, chưa có runner hoặc báo cáo chất lượng.

| Luồng | Cần đo trước thí điểm |
| --- | --- |
| OCR | CER/WER tiếng Việt, thiếu dòng/trang, tự sửa nội dung và latency |
| Chấm | Sai lệch tổng/tiêu chí, đồng thuận giáo viên, bằng chứng đúng |
| Socratic | Viết hộ/vượt phạm vi, câu hỏi hữu ích, guardrail và độ trễ nội dung đã duyệt |
| Profile | Observation có bằng chứng, nhầm thể loại, lịch sử tiến bộ |
| Vận hành | Queue wait, p50/p95, retry/failure, token/chi phí, giới hạn quota |

Usage ledger, circuit-breaker chung, retention dữ liệu/provider files và backup/restore là việc còn lại, không được ghi như thành phần đang hoạt động. NFR-03/04 vẫn là mục tiêu chưa có số đo xác nhận trong đợt này. Xem [roadmap](../development/implementation-roadmap.md).
