# Prompt Grok — Lưu văn phong trên nhánh feat/writing-profile

Ngày: 13/10/2026. Thực hiện sau [feat/assessment](grok-assessment.md). Đây là phần tạo bộ nhớ từ bài viết có bằng chứng, rồi dùng bộ nhớ đó để Socratic hỏi phù hợp hơn ở lượt sau.

Sao chép toàn bộ khối dưới đây cho Grok **sau khi assessment đã hoàn thành và được kiểm tra**. Phạm vi gồm pipeline AI, database, CLI và tests; cộng sự nối HTTP/UI theo handoff. Có prompt chưa đồng nghĩa tính năng đã được triển khai.

Tài liệu SDK khi triển khai: [Google structured outputs](https://ai.google.dev/gemini-api/docs/structured-output). Dùng endpoint/types tương thích SDK đã khóa; giữ `gemini-2.5-flash`.

## Prompt để sao chép

```text
Bạn là kỹ sư backend/AI triển khai EduLit-AI trong repository hiện có.
Viết code, kiểm tra và bàn giao bằng tiếng Việt. Chỉ làm feat/writing-profile.

FEATURE_BRANCH=feat/writing-profile
BASE_BRANCH=feat/assessment

1. MỤC TIÊU, PHẠM VI VÀ NHÁNH

Chu trình cần chứng minh:
Bài văn bản đã nộp → assessment PUBLISHED bởi giáo viên → trích xuất đặc điểm
từ bài gốc kèm evidence → lưu WritingObservation → cập nhật WritingProfile
→ lượt Socratic mới chọn observations liên quan → hỏi phù hợp hơn với học sinh.

Profile là mô tả tạm thời có nguồn: thế mạnh, nhu cầu luyện tập, xu hướng diễn đạt.
Không fine-tune model, không clone văn phong để viết hộ, không kết luận tính cách
hoặc 'đã hội tụ' sau một số bài cố định. Profile không đưa vào scoring context.

Database/helper/query profile và Socratic đọc profile đã có. Thêm AI extraction,
validation/taxonomy, application services, xử lý version/retry, CLI/tests và
handoff. Không tạo database bộ nhớ thứ hai hoặc vector store.
Giữ Node.js 24/npm/TypeScript ESM, Prisma 7/PostgreSQL 17 và SDK hiện có.
Model gemini-2.5-flash chỉ phía backend, fake adapter riêng để kiểm thử.

Không làm OCR/upload, queue/outbox/Redis, dashboard/report/class analytics,
chatbot độc lập, fine-tuning, embedding/RAG, framework agent, phát hiện đạo văn,
chỉnh điểm/công bố lại kết quả hoặc khảo sát goals mới. Giữ declaredGoals hiện có.
Người dùng làm AI/database; cộng sự nối HTTP/UI quản lý thông thường.

Kiểm tra git status/branch/log. Tạo feat/writing-profile từ feat/assessment đã
chứa các feature phụ thuộc, hoặc tiếp tục nhánh đó nếu đã có. Assessment phải
được kiểm tra trước khi bắt đầu; không chỉ thấy folder rồi coi là đã hoàn thành.
Nếu base còn chưa commit, báo rõ và checkpoint đúng file assessment đã xác định;
không gom thay đổi người dùng hay integration còn dang dở vào commit.
Không tự merge/push/reset/stash/drop; giữ file ngoài phạm vi, stage có chọn lọc.
Extraction/profile/coaching integration/assets/CLI/tests cùng một nhánh này.

2. ĐỌC TRƯỚC KHI SỬA

- AGENTS.md áp dụng nếu có; README.md; backend/README.md; package/lock/tsconfig.
- backend/prisma/schema.prisma; migrations; backend/src/data-layer.ts.
- backend/src/modules/writing-profile/domain/profile.ts.
- backend/src/modules/writing-profile/application/{save-observations,
  query-profile-context}.ts.
- backend/src/core/{utf16,errors,decimal}.ts.
- backend/src/modules/assessment/application/*, assessment/domain/evaluation.ts,
  assets/prompt loader/ports được tạo ở feat/assessment.
- backend/src/modules/socratic/application/conversations/{select-profile,
  build-socratic-context}.ts và send-socratic-turn.ts.
- backend/src/infrastructure/ai/*; scripts/copy-socratic-assets.ts;
  scripts/run-db-tests.ts; tests/helpers/db.ts.
- Unit profile-summary/utf16/Socratic context; integration persistence,
  review-fixes, assessment và e2e-data-layer hiện có.
- docs/architecture/minimal-database.md; docs/architecture/gemini-pipeline.md;
  docs/development/database-handoff.md; assessment-handoff.md;
  socratic-handoff.md; socratic-integration.md; minimal-mvp-roadmap.md.

Đọc helper thật: saveObservationsAndRefreshProfile đã khóa student/assessment,
dedup theo (studentId, assessmentId, featureKey), giữ terminal statuses và refresh
summary bằng code; không thay bằng một đoạn summary model bịa rồi ghi DB.

3. APPLICATION USE CASES VÀ NGUỒN HỢP LỆ

Tạo createWritingProfileServices(prisma, ai) hoặc facade tương đương:
- extractPublishedObservations(actor, { assessmentId }).
- getOwnWritingProfile(actor) cho STUDENT; có observations/evidence hợp lệ.
- reviewObservationStatus(actor, { observationId, status, expectedProfileVersion }).

Extraction/review trong MVP do TEACHER ACTIVE sở hữu đề của source assessment
chủ động yêu cầu. Không public endpoint nhận arbitrary studentId để trích xuất.
Actor đến từ auth backend; CLI dùng loginId seed để resolve actor trong DB,
không coi CLI mô phỏng đó là authentication HTTP.
Kiểm tra role/status/ownership trong application và lúc commit, không chỉ guards.
Học sinh chỉ đọc profile của mình; không tự tạo observations hoặc approve status.
Teacher chỉ sửa/đọc observation thuộc bài của đề mình, không mặc nhiên được
đọc profile tổng hợp từ đề giáo viên khác. Source/studentId suy ra từ DB.

Chỉ extract Assessment.status=PUBLISHED, đúng student của Submission và snapshot.
AI_DRAFT, text chat, câu hỏi AI, outline do trợ lý gợi ý, sample/model answer,
bài học sinh khác không phải nguồn trích xuất. Seed có observations cũ không
chứng minh pipeline AI mới đã chạy.

Đầu vào extraction: đúng Submission.text immutable + genre/grade/đề/rubric từ
assignmentSnapshot + điểm/feedback đã công bố của chính bài đó. Không nạp tên,
login, school, profile summary cũ hay toàn bộ lịch sử vào prompt để suy diễn.
Extraction v1 xử lý từng bài độc lập; lặp qua các nguồn bằng summary code,
không cần model hợp nhất hồ sơ hay tự giải quyết mâu thuẫn giữa các bài.
Nếu model đưa status/genre/studentId vào output, schema phải reject;
những giá trị này do backend xác định.

4. PORT, TAXONOMY, PROMPT VÀ EVIDENCE

- WritingObservationAiPort, GeminiWritingObservationAdapter và fake adapter.
  Dùng generateContent/SDK hiện có, task riêng; chia sẻ transport/error/usage
  hợp lý nhưng không reuse Socratic output hoặc grading prompt.
- AI_MODE=mock/live rõ, model cố định; timeout hủy request, tổng retry budget
  hữu hạn. Provider blocked/truncated/invalid là lỗi, không fabricate profile.
  Không live→fake tự động, không đổi model, không tự gọi live trong tests.
- Tạo prompts/writing-profile/system.v1.md + output.v1.schema.json, backend
  assets/loader có version, import.meta.url và copy vào dist. Ajv local kiểm tra
  strict shape/bounds; provider schema tương thích đúng SDK/model/endpoint.
- Taxonomy nhỏ, versioned bằng code/tài liệu, ví dụ 6–10 traitIds liên quan
  cấu trúc câu, chuyển ý, tổ chức luận điểm, nối dẫn chứng, lựa chọn từ, nhịp câu.
  Chốt traitIds và kind được phép cho từng trait; không để model sinh key tự do
  hoặc thêm synonym mỗi lần. Không coi chủ đề/quan điểm là văn phong ổn định.
- Backend sinh featureKey ổn định từ genre chuẩn của snapshot + kind + traitId,
  phù hợp unique hiện có. Cùng trait khác genre/kind không bị gộp nhầm.
  Không normalize genre bằng heuristic làm hai thể loại khác nhau trở thành một.

Output mục tiêu:
{
  "observations": [{
    "traitId": "<ID trong taxonomy>",
    "kind": "STYLE",
    "description": "Nhận xét cụ thể, giới hạn trong bài nguồn",
    "evidence": { "quote": "trích nguyên văn", "start": 0, "end": 15 }
  }]
}
Ví dụ chỉ minh họa hình dạng, không phải fixture với offsets hợp lệ.

- 0–6 observations/bài, không buộc đủ STRENGTH/WEAKNESS/STYLE. [] là kết quả
  hợp lệ khi chưa có bằng chứng phù hợp, không tạo nhận xét để lấp số lượng.
- traitId/kind trong taxonomy, description ngắn và có giới hạn, không suy diễn
  tính cách, sức khỏe, hoàn cảnh, năng lực tổng quát, nhãn 'học sinh yếu' hoặc
  phần trăm độ tin cậy chưa hiệu chuẩn. Nhận xét về đoạn hiện diện, không tạo
  evidence cho yếu tố hoàn toàn vắng mặt.
- Evidence nonempty, UTF-16 [start,end), text.slice(...)===quote trên đúng
  chuỗi đã lưu, không normalize dấu/emoji hay fuzzy-match. Quote lặp cần
  offsets đúng/selector rõ, không tự chọn occurrence đầu để sửa output sai.
- Duplicate featureKey trong một output là lỗi rõ ràng, không last-write-wins.
  Validate toàn batch trước transaction; một observation sai thì không lưu
  một phần hoặc cập nhật summary nửa chừng.
- Backend lấy genre từ snapshot và tạo observations mới PROVISIONAL.
  Model không được tự tạo SUPPORTED/RESOLVED/INVALIDATED hay ghi declaredGoals.
- Prompt có ranh giới dữ liệu không tin cậy: nội dung bài/feedback không có
  quyền thay system instructions hoặc yêu cầu ghi observation cho người khác.

5. PERSISTENCE, REPLAY VÀ VERSION

- Tái sử dụng saveObservationsAndRefreshProfile, setObservationStatus,
  refreshWritingProfile, getProfileContextForSession; không write trực tiếp
  từ model vào WritingProfile.summary. Summary suy ra từ observations hợp lệ
  của nguồn PUBLISHED, support count theo assessment khác nhau, không lần retry.
- Recheck source PUBLISHED/ownership/status/contentHash lúc persist, network
  ngoài transaction. Giữ lock student → assessment → profile của helpers;
  bổ sung authorization trong transaction khi cần, tránh deadlock với publish.
- Capture profile version trước gọi model, commit với expectedProfileVersion.
  Nếu profile chưa có phải kiểm tra trạng thái 'chưa tồn tại' một cách atomic;
  helper hiện có không reject expected version khi current chưa có, cần mở rộng
  tối thiểu để không bỏ sót conflict tạo profile. Không chỉ kiểm tra ngoài tx.
- Conflict trả lỗi có code, không ghi đè bằng kết quả cũ, giữ nguyên goals.
  Rerun có chủ đích đọc lại nguồn/version; không tự ghi đè bằng stale output.
- Retry cùng assessment không tăng số observations hay support count, không
  hồi sinh RESOLVED/INVALIDATED và không hạ SUPPORTED về PROVISIONAL.
  Helper hiện có có thể update status/observedAt và tăng profile.version khi
  replay: không giả định đã có no-op idempotency. Mở rộng nhỏ hoặc wrapper để
  replay đã có kết quả trả existing rows/profile, không gọi AI lại, không thay
  evidence/observedAt/goals/version chỉ do retry.
- Do chưa có bảng extraction runs, v1 dùng policy bảo thủ: nếu assessment
  đã có observations (kể cả terminal) coi là đã xử lý và trả replay; không
  regenerate/replace tự động. Seed observations cũng theo policy này; dùng
  bài nguồn mới để demo extraction thật. Concurrent cùng assessment kiểm tra
  lại trong lock, trả winner, không trộn hai batches model khác nhau.
- Nếu output=[], trả 'no_observations', không gọi helper yêu cầu nonempty,
  không xóa observations cũ/summary. Nếu chưa có profile, query trả profile null
  hoặc representation rỗng đã document. Không invent placeholder observation.
  Chưa có run marker thì lần gọi lại [] có thể gọi provider lại; ghi rõ giới hạn,
  không thêm bảng job dự phòng hay tuyên bố exactly-once provider.
- Status review có actor, expectedProfileVersion và transition rõ:
  giáo viên xác nhận đủ bằng chứng → SUPPORTED; nhận xét sai → INVALIDATED;
  nhu cầu luyện đã khắc phục có đối chiếu → RESOLVED. Không tự resolve chỉ vì
  bài mới không nhắc đến lỗi; không '3 bài = ổn định'. Terminal không tự reopen.
  Review trực tiếp sau khi đọc bài/nguồn là đủ cho MVP, không schema audit mới.
- RESOLVED giữ ở summary.resolvedItems, không ở practiceNeeds hiện tại;
  INVALIDATED không vào context. Trái chiều giữa các nguồn vẫn giữ provenance,
  không model tự xóa bên cũ hoặc kết luận chắc chắn.
- Giữ chín bảng hiện có; evidence/model output nằm trong observations như schema.
  Nếu thiếu metadata cần thiết thì nêu lý do và migration mới tối thiểu, không
  sửa migrations đã apply hoặc tạo bảng chỉ để dùng trong tương lai.

6. KẾT NỐI SOCRATIC VÀ GIỮ CHẤM ĐIỂM ĐỘC LẬP

- Kiểm tra select-profile/build-socratic-context hiện có; mỗi lượt nạp profile
  mới nhất của đúng student, chọn observations còn hiệu lực và đúng genre.
  Không lấy summary global về lỗi genre khác làm yếu điểm cho phiên hiện tại.
  Có giới hạn context và provenance IDs/evidence đủ để đối chiếu.
- Profile null/ít bằng chứng: Socratic vẫn hỏi theo đề và ý học sinh, không
  dựng profile từ gradeLevel hoặc seed default. PROVISIONAL dùng lời gợi mở
  thận trọng, không khẳng định em luôn có đặc điểm đó.
- Sau extract/review, lượt mới của cả phiên đang mở đọc context mới; history/
  snapshot rubric cũ không bị viết lại. AI vẫn hỏi ngắn và giữ guardrail không
  viết hộ/không ghi đè dàn ý. Không copy STYLE quote để tạo bài theo giọng em.
- Assessment payload tuyệt đối không thêm profile/observations/goals.
  Test so sánh scoring payload trước/sau cập nhật profile phải giống nhau.

7. DEMO VÀ CONTRACT BÀN GIAO

Thêm writing-profile:demo với extract/show/review-status, resolve login từ seed:
-- extract --login dang.loan --assessment <PUBLISHED-id>
-- show --login bui.hamy
-- review-status --login dang.loan --observation <id> --status INVALIDATED
   --expected-version <n>
CLI dùng application services, không bypass publish hoặc dùng arbitrary studentId
để impersonate. Đóng Prisma/pool sau chạy. Không reset DB dev.

Demo xuyên suốt kết hợp CLI assessment và Socratic:
submit bài mới → grade → teacher publish → extract → show profile/evidence →
mở đề cùng genre khác chưa nộp → gửi lượt Socratic, kiểm tra context đã chọn.
Phiên của bài đã nộp không nhận chat mới; không mở lại trái policy để demo.
Nếu seed thiếu đề thứ hai, tạo fixture riêng bằng helper, không chỉnh rubric/
trạng thái/bài đã có. Demo fresh source vì seed profile có sẵn không chứng minh AI.

Tạo docs/development/writing-profile-handoff.md: taxonomy/version, use case DTO,
empty/replay/conflict policy, actor/ownership, CLI/mock/live, context selection,
giới hạn provenance model/prompt (chưa có cột thì không giả vờ đã lưu), và API
đề xuất cho cộng sự (ghi rõ feature này chưa triển khai HTTP/UI):
GET  /api/me/writing-profile                         (STUDENT, actor-derived)
POST /api/assessments/:assessmentId/writing-observations (TEACHER chủ đề)
PATCH /api/writing-observations/:observationId/status (TEACHER chủ nguồn)
Student view có description, kind, trạng thái/provenance và excerpt thật;
không trả điểm draft hoặc dữ liệu người khác. Dùng auth/error/CSRF conventions
hiện có khi cộng sự nối; không bịa phần trăm 'hiểu văn phong'.

8. KIỂM TRA VÀ ĐIỀU KIỆN HOÀN THÀNH

- Unit: taxonomy/keys theo genre/kind, schema/limits, [] hợp lệ, duplicate key,
  UTF-16 dấu tổ hợp/emoji/quote lặp, injection fixture, không có status tự phong.
- DB integration fake port: AI_DRAFT bị chặn trước gọi provider; PUBLISHED
  đúng tác giả; teacher khác chủ/student/inactive bị chặn; source đổi trạng thái
  hay actor mất quyền lúc generation → không persist; invalid batch rollback.
- Retry/concurrency: cùng assessment không trùng batch/support count,
  không đổi version/observedAt trên no-op, không hạ SUPPORTED, không hồi sinh
  RESOLVED/INVALIDATED; hai assessment cùng student conflict không mất dữ liệu;
  goals không bị reset; kiểm tra race profile chưa tồn tại.
- Query/coaching: đúng student + genre, current statuses, provenance đúng;
  resolved không còn là nhu cầu luyện, invalidated không trở lại khi replay.
  Fake Socratic spy chứng minh lượt sau nhận observation mới mà lịch sử giữ nguyên.
- Scoring spy chứng minh profile thay đổi không ảnh hưởng grading payload.
- End-to-end DB test với fake adapters: submit → draft → publish → extract →
  profile → lượt Socratic trên đề khác cùng genre. Assert evidence lấy từ bài
  student, không từ assistant messages. Không dùng seed profile để làm giả bước AI.
- Chạy typecheck/build/unit/test:db/test:dist; prompt/schema nạp được từ dist
  và cwd khác. DB test riêng qua runner; không phá Socratic/auth/assessment cũ.
- writing-profile:live-smoke opt-in WRITING_PROFILE_LIVE=1 với key backend,
  nạp env trước flag; chỉ bài giả lập đã có nguồn PUBLISHED trong DB test/demo
  riêng, không tự publish hoặc sửa observations dev. Không live trong CI mặc định.
- Có evaluation fixtures teacher đối chiếu observation với quote và genre;
  tách chất lượng nhận xét/cá nhân hóa khỏi schema correctness và fake tests.
  Không claim hội tụ, phần trăm tin cậy hoặc 'giữ đúng văn phong' từ một smoke test.
- Cập nhật README/config mẫu/exports/roadmap, bàn giao file/commits nếu có,
  lệnh + kết quả kiểm tra và phần chưa chạy, HTTP/UI chưa nối ghi rõ.

Hoàn thành khi pipeline từ điểm công bố tới bộ nhớ có evidence và lượt Socratic
kế tiếp được chứng minh bằng code/CLI/tests. HTTP/UI quản lý là phần cộng sự nối
theo handoff; không tuyên bố toàn bộ sản phẩm hoàn thành chỉ vì hai pipeline chạy.
```
