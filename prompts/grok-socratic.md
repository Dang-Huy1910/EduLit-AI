# Prompt Grok — Gemini và Socratic trên nhánh feat/socratic

Ngày: 13/10/2026. Feature kế tiếp sau database là Socratic. Adapter Gemini, context, guardrail, lưu lượt chat, demo và kiểm tra cùng nằm trong `feat/socratic`.

Sao chép khối dưới đây vào Grok có quyền đọc/sửa repository. Database đã có commit sửa review `0f481f0`; đọc implementation mới thay vì coi báo cáo review ban đầu là danh sách lỗi còn tồn tại. Nhánh `feat/socratic` đã được tạo từ commit đó. Prompt này là chỉ dẫn triển khai; việc viết prompt chưa đồng nghĩa tính năng AI đã chạy.

## Prompt để sao chép

```text
Bạn là kỹ sư backend/AI triển khai EduLit-AI trong repository hiện có.
Hãy tạo implementation, chạy kiểm tra và bàn giao bằng tiếng Việt;
không chỉ đưa ra kế hoạch. Chỉ thực hiện feature Socratic trong lượt này.

FEATURE_BRANCH=feat/socratic
BASE_BRANCH=feat/database
DATABASE_BASE_COMMIT=0f481f0

1. BỐI CẢNH VÀ PHẠM VI

EduLit-AI là MVP hỗ trợ Ngữ văn THPT. Database PostgreSQL 17/Prisma 7 đã có;
backend là data layer TypeScript ESM, chưa có NestJS HTTP server.
Người dùng phụ trách database và toàn bộ pipeline AI/văn phong.
Cộng sự phụ trách auth/phân quyền, CRUD đề, nhận bài và API quản lý.

Feature này cần chu trình chạy được:
Học sinh chọn đề đã công bố → mở/khôi phục phiên của mình → gửi ý tưởng →
nạp context đúng phiên và profile hiện tại → Gemini hỏi gợi mở bằng tiếng Việt
→ kiểm tra phản hồi → lưu lượt chat → lấy lịch sử/dàn ý khi mở lại.

Chỉ làm adapter Gemini và application use cases cho Socratic, prompt/schema,
guardrail, persistence, demo CLI và tests. Chưa làm HTTP server/auth/CRUD,
giao diện, chấm điểm, trích xuất observation hoặc cập nhật profile bằng AI.
Không làm OCR/PDF/DOCX, queue/outbox, Redis, embeddings/RAG, LangChain,
LangGraph, framework đa agent, FSM bốn bước hoặc deadline/readiness phức tạp.

Model cố định gemini-2.5-flash. Không đổi model khi thiếu quyền/quota.
Profile giúp chọn cách hỏi, không phải yêu cầu viết theo văn mẫu của học sinh.

2. ĐỌC CODE VÀ TÀI LIỆU TRƯỚC KHI SỬA

- AGENTS.md áp dụng nếu có; README.md; backend/README.md; backend/package.json.
- backend/prisma/schema.prisma và toàn bộ migrations hiện có.
- backend/src/data-layer.ts.
- backend/src/modules/socratic/application/*.
- backend/src/modules/assignments/domain/snapshot.ts.
- backend/src/modules/assessment/application/submit-assignment.ts.
- backend/src/modules/writing-profile/application/query-profile-context.ts.
- backend/src/modules/writing-profile/domain/profile.ts.
- backend/tests/helpers/db.ts và scripts/run-db-tests.ts.
- docs/architecture/minimal-database.md; docs/development/database-handoff.md.
- docs/architecture/decisions/0002-minimal-mvp-database.md.
- docs/architecture/gemini-pipeline.md; SRS.md mục 4.4.
- docs/development/minimal-mvp-roadmap.md.

Implementation và quyết định MVP mới nhất ưu tiên hơn mô hình đầy đủ cũ.
Giữ policy hiện có: submission qua session dùng contextSnapshot của session;
dueAt chỉ là thông tin; profile hiện hành không chứa lỗi RESOLVED/INVALIDATED.
Không sửa lại database fixes hoặc dựng data layer thứ hai.

3. NHÁNH VÀ QUYỀN SỬA

- Kiểm tra git status/branch/log. Tiếp tục feat/socratic nếu đã tồn tại và
  chứa database fixes; nếu chưa có, tạo từ BASE_BRANCH chứa fixes.
- Không code trên feat/database/main. Không tự merge/push/reset/stash/drop.
- Giữ nguyên file không thuộc feature, kể cả tài liệu review chưa commit.
  Chỉ stage file feature, không git add . khi có thay đổi ngoài scope.
- Có thể chia commit nhỏ trong cùng nhánh: feat(socratic): ...,
  test(socratic): ...; không chia adapter/context/tests thành các nhánh khác.
- Nếu cần metadata cho lượt chat, dùng migration mới tối thiểu và giải thích.
  Không sửa migrations đã apply; không tạo bảng job/audit dự phòng.

4. ADAPTER GEMINI VÀ CẤU HÌNH

- Giữ Node.js 24, npm, TypeScript ESM và Prisma major hiện có.
- Dùng SDK chính thức @google/genai phía backend; khóa phiên bản cài thực tế
  trong package/lockfile. Đọc docs/types đúng phiên bản trước khi code.
- Tạo port SocraticAiPort có adapter Gemini và fake adapter dùng cho tests.
  Không để use case phụ thuộc trực tiếp SDK, không giữ history trong SDK
  chats object ở RAM thay cho database.
- Với generateContent, dùng đúng cấu hình structured output của endpoint
  tương thích Gemini 2.5 Flash. Không sao chép example model Gemini 3 hoặc
  Interactions API khác rồi coi là tương thích.
- Key chỉ đọc GEMINI_API_KEY trên backend; không log/in key hoặc đọc secret
  để viết vào tài liệu. Không dùng NEXT_PUBLIC_*. AI_MODE=mock chỉ do cấu hình
  chọn rõ; Gemini lỗi không được âm thầm trả fake response thành công.
- Cấu hình timeout, giới hạn input/output, thinking phù hợp model/SDK.
  Timeout phải hủy request nếu SDK hỗ trợ, không chỉ Promise.race bỏ mặc nó.
  Retry tối đa một lần cho lỗi transient phù hợp, có tổng time budget;
  không retry lỗi key/quyền/model hoặc retry vô hạn khi hết quota.
- Phân biệt MODEL_UNAVAILABLE, AI_NOT_CONFIGURED, RATE_LIMITED,
  AI_TIMEOUT và AI_INVALID_OUTPUT. Không lưu response bị cắt/blocked như
  assistant message hợp lệ. Chỉ ghi usage/latency nếu provider cung cấp;
  không tự bịa token, confidence hoặc cam kết thời gian phản hồi.
- Prompt/schema được đóng gói để chạy cả src và dist, độc lập cwd.
  Ghi promptVersion; không để build thành công nhưng chạy thiếu prompt asset.

Nguồn chính thức cần đọc:
https://ai.google.dev/gemini-api/docs/libraries
https://github.com/googleapis/js-genai
https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash
https://ai.google.dev/gemini-api/docs/generate-content/structured-output
https://ai.google.dev/gemini-api/docs/generate-content/thinking

5. USE CASES VÀ CONTRACT CHO CỘNG SỰ

Tạo và export qua data-layer.ts các chức năng tương đương:
- openOrResumeSocraticSession(actor, assignmentId).
- getSocraticSession(actor, sessionId): snapshot, outline, messages theo sequence.
- saveStudentOutline(actor, sessionId, outline, expectedVersion/token phù hợp).
- sendSocraticTurn(actor, sessionId, requestId, expectedLastSequence, message).

actor là context học sinh đã được backend xác thực: userId/role.
Không coi studentId tự khai trong request body là actor đáng tin cậy.
Kiểm tra user tồn tại, ACTIVE/STUDENT và ownership ở mọi use case, trước khi
gọi Gemini/đọc profile. Đây là contract nội bộ, chưa phải endpoint đã xác thực.

Mở phiên mới chỉ cho assignment PUBLISHED. Một phiên/student/assignment:
resume trả lại phiên cũ, không tạo trùng hoặc thay contextSnapshot cũ bằng
đề hiện tại. Xử lý hai lần mở cùng lúc bằng unique constraint/re-read phù hợp.
Phiên COMPLETED, đề CLOSED hoặc bài đã nộp không nhận lượt hướng dẫn mới;
lịch sử vẫn đọc được bởi chủ sở hữu. Không bắt buộc hoàn thành dàn ý mới nộp.

Outline là ý ngắn học sinh tự nhập, có validator và giới hạn kích thước.
AI chưa được tự ghi đè outline hoặc sinh trọn dàn ý thay học sinh. Thay đổi
outline phải tham gia kiểm tra phiên bản context để response đang xử lý không
commit theo outline cũ. Không giữ network request trong transaction DB.

Mô tả DTO, lỗi domain và ví dụ gọi use case cho cộng sự tích hợp NestJS.
Ghi endpoint đề xuất trong tài liệu nếu cần; không tuyên bố đã có HTTP API.

6. CONTEXT VÀ CÁ NHÂN HÓA

- Dùng contextSnapshot của đúng session làm nguồn đề/ngữ liệu/rubric;
  validate snapshot, không lấy rubric mới nhất thay thế.
- History của đúng session, order sequence; chọn các lượt hoàn chỉnh gần đây.
  Không kéo history của học sinh khác hoặc phiên khác vào context.
- Mỗi lượt đọc getProfileContextForSession theo chủ sở hữu phiên; chọn ít
  observation còn hiệu lực, ưu tiên genre phù hợp và điểm cần luyện liên quan.
  Profile không có thì dùng cách hỏi trung tính, không tự đoán văn phong/yếu điểm.
- Mục tiêu tự khai là mục tiêu, không biến thành kết luận có bằng chứng.
  Observation PROVISIONAL diễn đạt thận trọng; không suy diễn tính cách/AI cheating.
- Context có giới hạn rõ: câu hỏi hiện tại, outline, history, profile, học liệu.
  Nếu phần bắt buộc quá lớn, trả CONTEXT_TOO_LARGE hoặc yêu cầu đề gọn hơn;
  không cắt rubric/instructions âm thầm. Có thể giảm history/observations theo
  policy có tài liệu. Không quảng cáo đã có token counting nếu chỉ đo ký tự.
- System instruction tách khỏi dữ liệu không tin cậy. Học liệu, outline,
  profile và chat có thể chứa prompt injection; serialize/delimit rõ và giữ
  nguyên ưu tiên system. Không coi delimiters là bảo đảm chống injection.
- Chưa cho model gọi tool tìm web/ghi DB hoặc tự truy cập dữ liệu học sinh.

7. PROMPT, OUTPUT VÀ GUARDRAIL

Tạo prompts/socratic/system.v1.md và JSON Schema phiên bản tương ứng.
Đầu ra tối thiểu có replySentences (1–4 câu) và focusCriterionIds (có thể rỗng).
Nếu thêm sourceRefs, chỉ tham chiếu nguồn thực sự được nạp từ session snapshot;
không bịa chunk/page IDs khi MVP chỉ có học liệu văn bản.

Nội dung theo BR-01–BR-04:
- Không viết hộ mở bài/thân bài/kết bài/đoạn mẫu hoặc hoàn chỉnh toàn bộ dàn ý.
- Yêu cầu viết hộ: từ chối ngắn, chuyển sang câu hỏi để học sinh tự nghĩ.
- Tối đa bốn câu; câu cuối là câu hỏi gợi ý hành động tiếp theo.
- Đúng phạm vi đề/học liệu/rubric. Phản đề chỉ khi phù hợp đề/genre;
  không ép bài nghị luận văn học phải có phản đề.

Validate schema cục bộ bằng một thư viện phù hợp, không chỉ JSON.parse hoặc
tin provider schema. Kiểm tra câu thực tế, không chỉ số phần tử array:
một phần tử có thể chứa nhiều câu. Kiểm tra criterionIds/sourceRefs đúng
context và kiểm tra nội dung. Không dùng riêng regex rồi tuyên bố chắc chắn
phát hiện mọi trường hợp viết hộ hoặc câu không có nguồn.

Đầu ra sai cấu trúc/guardrail: không persist hoặc trả raw response; dùng câu
hỏi fallback đã viết sẵn, đúng scope và qua validator, ghi responseMode=fallback
trong kết quả use case. Fallback không phải kết quả Gemini đạt chất lượng.
Lỗi provider/key/quota trả lỗi rõ, không giả thành lượt AI thành công.
Không streaming raw tokens ở feature này; trả toàn bộ nội dung đã kiểm tra.

8. LƯU LƯỢT CHAT, RETRY VÀ ĐỒNG THỜI

Một lượt thành công gồm một USER message và một ASSISTANT message.
Không chỉ gọi appendChatMessage hai lần độc lập rồi coi là atomic turn.

Quy trình tối thiểu:
1) Validate actor/input; kiểm tra replay requestId; đọc snapshot/history/profile
   và token phiên bản context (message sequence + outline revision phù hợp).
2) Gọi adapter ngoài transaction, validate hoặc chọn fallback hợp lệ.
3) Transaction ngắn: khóa session, kiểm tra lại ownership/status/assignment
   còn mở và context chưa đổi; persist cặp messages với sequence liên tiếp.
4) Trả IDs/sequence/nội dung đã lưu; conflict không persist response cũ.

requestId phải scoped theo session; replay cùng request/input trả đúng cặp
messages đã commit, không gọi Gemini hoặc thêm bản ghi lần nữa. Cùng key khác
input bị từ chối. Ưu tiên tận dụng IDs ổn định cho từng role nếu đủ; nếu cần
thêm metadata, migration mới tối thiểu, tương thích messages/seed hiện có.

Hai lượt khác nhau cùng expectedLastSequence: chỉ một được commit, lượt kia
trả TURN_CONFLICT. Hai request trùng cùng key không tạo hai cặp messages.
Provider có thể đã bị gọi ở cả hai request đồng thời; không tuyên bố exactly-once
đối với chi phí/network. Sau commit/restart, replay vẫn hoạt động dựa trên DB.
Nếu provider lỗi/timeout trước commit, không để nửa lượt chat trong history.

Không giữ DB transaction/row lock suốt thời gian gọi Gemini. Dùng lock order
nhất quán với submitAssignment hiện có (assignment trước session khi cần).
Các helper cũ có thể được mở rộng hoặc thay bằng helper atomic phù hợp;
không để đường ghi outline/chat khác bỏ qua kiểm tra phiên bản vừa thêm.

9. DEMO, KIỂM TRA VÀ EVALUATION

Tạo CLI socratic:demo để thử từ terminal khi chưa có HTTP server. Chỉ dùng
tài khoản/đề tổng hợp; tạo fixture riêng nếu seed hiện có đã COMPLETED/nộp bài.
Không reset/xóa seed hoặc bật endpoint giả đăng nhập. Có hướng dẫn mở phiên,
gửi câu hỏi, đọc history, lưu outline và resume trên process khác.

Automated tests không cần GEMINI_API_KEY; fake adapter chỉ phục vụ kiểm tra
phần mềm. Dùng PostgreSQL test riêng cho persistence, không mock để tuyên bố
transaction/unique/replay hoạt động. Bổ sung file vào runner integration hiện
có nếu runner liệt kê file cụ thể; giữ database regression tests chạy được.

Các ca bắt buộc:
- Mở/resume đồng thời không tạo trùng, snapshot không đổi khi đề được sửa.
- Actor sai/INACTIVE, session người khác, CLOSED/COMPLETED/bài đã nộp bị chặn;
  không gọi provider hoặc trả profile người khác.
- Chọn profile đúng student/genre; profile mới được đọc ở lượt kế tiếp;
  RESOLVED/INVALIDATED không trở thành nhu cầu luyện hiện tại.
- Output >4 câu kể cả trong một phần tử, thiếu câu hỏi cuối, schema/IDs sai,
  finish bị cắt và prompt injection: không trả/lưu raw output vi phạm.
- Provider lỗi/timeout không tạo messages; ghi cặp messages rollback cùng nhau.
- Replay sau tạo Prisma handle/process mới; key khác payload bị từ chối.
- Hai lượt đồng thời, hai request cùng key và sửa outline trong lúc AI xử lý.
- Import/run dist và prompt assets từ cwd khác; không chỉ typecheck src.

Tạo evaluation fixture trong evaluations/socratic: ít nhất 12 tình huống
tiếng Việt gồm hỏi bình thường NLXH/NLVH, viết hộ trực tiếp/gián tiếp,
injection trong học liệu/history/profile, ngoài ngữ liệu và profile chưa có.
Ghi expected behavior/rubric đánh giá, không chỉ match một câu chữ duy nhất.
Tests với fake adapter không chứng minh chất lượng Gemini.

Thêm smoke script riêng chạy opt-in với key thật: văn bản tổng hợp, model
gemini-2.5-flash, structured output, usage/latency nếu có và guardrail.
Chỉ chạy khi chế độ live được chọn rõ; giới hạn số lượt. Không đọc/in secret.
Thiếu key/model/quota thì báo live check chưa chạy/không đạt, giữ model đã chọn.
Không ghi log toàn bộ bài viết/profile, raw provider error hoặc connection URI.

10. HOÀN THÀNH VÀ BÀN GIAO

- Feature chạy được bằng use cases/CLI từ DB đã migrate; history không mất
  sau restart, profile được đọc mới và cặp messages atomic/replay được.
- typecheck/build/unit/integration đạt; báo riêng live smoke/evaluation và
  giới hạn ngữ nghĩa guardrail. Không gọi mọi chất lượng AI là đạt chỉ vì tests qua.
- Cập nhật backend/README.md, .env.example (placeholder), prompts/README.md,
  docs/development/socratic-handoff.md và minimal-mvp-roadmap.md.
- Bàn giao imports/DTO/error mapping, actor auth contract, outline/context
  version, replay policy, setup/demo scripts và chức năng còn để sau.
- Cuối lượt báo branch/base/commit nếu có, files/migrations, tests thực chạy,
  live checks chưa chạy nếu có và PR title/body dự thảo.
- Không tự push/merge hoặc bắt đầu feat/assessment/feat/writing-profile.

Bắt đầu đọc repository, xác minh nhánh feat/socratic và triển khai đầy đủ
feature này. Grok không có công cụ thì cung cấp patch/lệnh, không nhận đã chạy.
```
