# Codex — sửa nền AI và Socratic

Chạy prompt này trước [prompt hoàn thiện pipeline](codex-complete-pipeline.md). Đây là yêu cầu **triển khai và kiểm chứng code**, không chỉ lập kế hoạch. Các vấn đề dưới đây được ghi nhận từ working tree ngày 13/10/2026; Codex phải kiểm tra lại vì Grok có thể tiếp tục thay đổi code.

Sao chép toàn bộ khối sau vào Codex khi mở repository EduLit-AI:

```text
Bạn đang làm việc trực tiếp trong repository EduLit-AI. Hãy tiếp quản, rà soát và sửa phần AI/Socratic mà Grok đã triển khai. Hoàn thành code, migrations cần thiết, kiểm thử và tài liệu bàn giao trong một feature: feat/ai-foundation.

MỤC TIÊU

1. Giữ các application services/database đã hoạt động, sửa lỗi thực tế thay vì viết lại toàn bộ.
2. Socratic persist/resume an toàn, không ghi đè dàn ý học sinh khi AI trả về chậm, không viết hộ bài văn.
3. Có adapter Gemini và OpenAI cho Socratic, chấm rubric và trích xuất văn phong. Khi các adapter đã có, đổi provider/model bằng cấu hình, không sửa business logic, HTTP hoặc frontend.
4. Lưu đúng nguồn sinh kết quả; mock/fallback/replay không bị báo là một lần gọi Gemini/OpenAI thành công.
5. Chuẩn bị nền cho pipeline ảnh/OCR ở feature sau; feature này chưa xây teacher CRUD hoặc OCR.

A. ĐỌC REPOSITORY VÀ GIỮ CÔNG VIỆC HIỆN CÓ

- Đọc AGENTS.md nếu có, README.md, backend/README.md, package.json/lockfile, schema/migrations, tài liệu architecture/development và các prompt/handoff liên quan.
- Đọc docs/development/socratic-review-2026-10-13.md và database-review-2026-10-13.md nếu tồn tại; xem chúng là giả thuyết cần đối chiếu với code mới nhất.
- Chụp git status/diff/log trước khi sửa. Working tree có cả thay đổi và file chưa track của Grok. Giữ nguyên chúng; không reset, clean, stash tự động hoặc checkout cưỡng bức.
- Tạo nhánh feat/ai-foundation từ trạng thái hiện tại chứa đủ các feature phụ thuộc. Nếu đã tồn tại thì kiểm tra base rồi dùng nhánh phù hợp, không ghi đè nhánh.
- Nếu có sửa đổi đồng thời từ công cụ khác, phát hiện trước khi ghi file và bảo toàn nội dung mới; tiếp tục những phần độc lập.
- Không in nội dung .env, API key, mật khẩu hoặc cookie. Chỉ sửa .env.example và tài liệu; không ghi đè cấu hình thật của tôi.
- Dùng stack hiện có: Node/TypeScript ESM, NestJS, Prisma/PostgreSQL, Next.js. Không nâng hàng loạt dependency hoặc thêm framework agent/vector DB/queue.

B. CẤU HÌNH PROVIDER VÀ MODEL

Hiện code có MODEL_NAME cố định gemini-3.8-flash ở domain, resolver từ chối model khác, factory chỉ Gemini/mock, trong khi thiết kế ban đầu chọn gemini-2.5-flash. Hãy kiểm chứng và sửa tận gốc:

- AI_MODE=mock|live, AI_PROVIDER=gemini|openai, AI_MODEL=<model-id>.
- Cho phép SOCRATIC_MODEL, ASSESSMENT_MODEL, WRITING_PROFILE_MODEL override AI_MODEL theo task. Chưa cần provider khác nhau giữa các task.
- Gemini dùng GEMINI_API_KEY; OpenAI dùng OPENAI_API_KEY. Legacy GEMINI_MODEL còn hoạt động nếu chưa có cấu hình mới và provider là Gemini.
- Thứ tự model: override task -> AI_MODEL -> GEMINI_MODEL legacy cho Gemini -> default Gemini gemini-2.5-flash khi hoàn toàn chưa cấu hình. OpenAI phải có model được cấu hình rõ; không tự chọn “latest”.
- Giữ nguyên model tôi đã chủ động cấu hình, kể cả khi khác default. Không tự đổi .env từ 2.5 sang 3.8 hoặc ngược lại. Nếu cấu hình mới và legacy khác nhau, ưu tiên cấu hình mới và tài liệu hóa quy tắc.
- Từ chối giá trị provider/mode không hợp lệ; không silently chuyển live sang mock, đổi provider hoặc thay model khi gặp lỗi.
- Default chế độ live hiện có có thể giữ để tương thích, nhưng test/browser harness phải chủ động đặt mock. Validate key/capability ở nơi khởi tạo adapter hoặc chạy task; không làm hỏng đường mock vì thiếu key thật.
- Truyền cùng một resolved config từ factory vào adapter. Không nhận env giả ở factory rồi constructor lại đọc process.env khiến test/cấu hình sai.
- Loại tên model khỏi domain rules. Model id là cấu hình/provenance, không phải một invariant của rubric, outline hay writing profile.

C. ADAPTER GEMINI VÀ OPENAI

- Giữ các port hiện có: SocraticAiPort gồm generateTurn/generateOutline; AssessmentAiPort; WritingObservationAiPort. Đối chiếu tên/type thực tế trước khi sửa.
- Thêm OpenAI implementation cho cả ba port và nối vào factory. Không chỉ thêm AI_PROVIDER vào .env mà chưa có adapter thực thi.
- Dùng SDK chính thức, phiên bản phù hợp Node/TypeScript hiện tại. Kiểm tra tài liệu chính thức khi triển khai OpenAI Responses/Structured Outputs, Gemini structured JSON và giới hạn model được cấu hình.
- Tài liệu tham chiếu: https://developers.openai.com/api/docs/guides/structured-outputs và tài liệu SDK @google/genai chính thức. Không sao chép tham số từ SDK khác hoặc từ phiên bản mới không tương thích.
- Giữ contract output nội bộ; provider adapter chuyển schema/response/error riêng. Chỉ giảm cú pháp schema không được provider hỗ trợ khi vẫn giữ đầy đủ local validation; không nới nghiệp vụ cho vừa model.
- Structured output vẫn phải được backend kiểm tra schema, safety, điểm, evidence và guardrail. Từ chối refusal, output thiếu/cắt, empty hoặc JSON sai; không biến thành điểm 0/observations giả.
- Timeout, retry có giới hạn và tổng budget rõ cho từng task. Chỉ retry lỗi phù hợp; không retry vô hạn, lỗi key hoặc schema bằng cách gọi không giới hạn.
- Budget reasoning/output và tham số sampling theo khả năng của model/provider. Không mang thinkingConfig của Google sang OpenAI hoặc gửi các tham số không được model hỗ trợ.
- Map lỗi về các DomainError/API error hiện có: cấu hình, model không dùng được, quota, timeout, output sai. Không trả raw SDK error chứa dữ liệu nhạy cảm.
- Mock SDK/transport được inject để kiểm tra request thật của adapter mà không gọi dịch vụ trả phí. Fake domain adapter phải trả provenance mock rõ ràng.
- Giảm trùng lặp phần transport/config hợp lý; không xây một framework đa provider lớn cho MVP.

D. PROVENANCE VÀ MIGRATIONS

- Kiểm tra modelName default trong schema.prisma và migrations: thay default trong schema mà không có migration là thiếu sót. Tạo forward migration để bỏ default gắn tên model; kết quả mới phải truyền model thực tế rõ ràng.
- Không sửa migration đã apply; không reset DB; không đổi hàng loạt modelName của dữ liệu lịch sử. Nếu metadata lịch sử không biết được thì đánh dấu legacy/unknown, không suy đoán từ config hiện tại.
- Ghi provider/model/promptVersion và responseMode đủ để replay lượt Socratic trả provenance của kết quả đã lưu, thay vì tên model đang được cấu hình hôm nay.
- Kết quả mock dùng model/mock marker phù hợp, không ghi gemini-3.8-flash hoặc một model OpenAI thật như thể đã gọi nó.
- Assessment dùng actual model từ adapter. Profile extraction cũng phải truy nguồn model/prompt khi có kết quả; chỉ thêm cột/metadata tối thiểu, chưa cần bảng quản lý mọi AI run.
- Usage/latency không biết thì nullable/omitted; không dựng số token hoặc gán latency của replay thành latency model.
- Nếu thay đổi nội dung/hành vi prompt, cập nhật version thực tế và asset loader/copy-dist/canonical prompt tương ứng. Giữ dữ liệu lịch sử có version cũ.

E. SỬA SCAFFOLD, CONCURRENCY VÀ GUARDRAIL

Đọc kỹ open-or-resume-session.ts, generate-scaffold.ts, persist-scaffold.ts, send-socratic-turn.ts và UI ApiSocraticView. Kiểm chứng các rủi ro sau bằng test hành vi:

1. persistScaffoldInit đang có đường ghi outline mà không tăng outlineRevision; có thể ghi sau khi học sinh vừa sửa hoặc chủ động xóa outline. Capture expectedOutlineRevision và trạng thái chat trước khi gọi AI; commit bằng CAS trong transaction. Blank outline không có nghĩa là chưa từng được học sinh sửa.
2. Kiểm tra điều kiện trước mọi write. Không ghi outline trước rồi mới phát hiện welcome/message đã tồn tại. Welcome chỉ tạo một lần, sequence đúng dù trước đó phiên có một assistant welcome thay vì cặp student/assistant.
3. openOrResume tạo phiên sau network call phải revalidate student ACTIVE, assignment PUBLISHED, chưa có submission và snapshot/version vẫn hợp lệ tại commit. Đọc trước network chưa đủ. Lock theo thứ tự thống nhất với code hiện có, network ở ngoài transaction.
4. Hai lần open/turn/save đồng thời không tạo phiên/welcome/lượt trùng; không trả raw P2002. Nếu state thay đổi trong lúc generate, giữ dữ liệu đã thắng và trả conflict/reload phù hợp.
5. generateScaffold không được catch mọi lỗi rồi trả success fallback. Lỗi key/quota/network phải có trạng thái lỗi và retry rõ. Fallback chỉ dùng cho trường hợp đã định nghĩa, ví dụ output không đạt guardrail; phải hiển thị responseMode thật.
6. Fallback bám loại đề và ngữ liệu. Không áp “sự trung thực”, “phản đề” hoặc “người trẻ” cho mọi đề NLVH/NLXH. Không xưng giáo viên đã viết dàn ý nếu thực tế chỉ là gợi ý hệ thống.
7. Scaffold chỉ cấu trúc và gợi ý ngắn; kiểm tra độ dài và nội dung viết hộ, không chỉ “mỗi bullet một câu”. Không làm template bài hoàn chỉnh chia thành nhiều bullet để lách guardrail.
8. Áp budget context cho scaffold giống các task khác: dữ liệu bắt buộc được kiểm tra giới hạn, không silently cắt rubric/ngữ liệu làm sai đề. Dữ liệu người dùng/ngữ liệu là untrusted, không được ghi đè system instruction.
9. UI refresh/resume không ghi đè draft đang sửa; save/turn dùng đúng revision và rollback/reload có thông báo khi conflict. Logout/đổi tài khoản xóa state cũ.
10. Preserve validation riêng của assessment/profile: Decimal score, quote UTF-16 khớp nguyên văn, published-only profile, không đưa profile/chat/dàn ý/tên vào scoring payload.

Nếu phát hiện lỗi trực tiếp liên quan trong nền hiện có, sửa trong feature này và thêm regression test. Không lấy cơ hội review để mở rộng sang CRUD/OCR.

F. KIỂM THỬ VÀ ĐIỂM DỪNG

- Chạy baseline phù hợp trước sửa; phân biệt lỗi đã có với regression. Không coi review/test cũ là kết quả của working tree mới.
- Unit: precedence config/legacy/invalid modes; Gemini/OpenAI adapter request mapping, refusal/truncated/schema/error/budget; mock provenance; scaffold guardrail và fallback theo genre.
- DB integration: CAS outline, empty outline do học sinh xóa, concurrent welcome/open/turn, actor bị vô hiệu hóa/đề bị đóng trong lúc network, retry/replay không trùng, provenance không đổi sau khi đổi model.
- Migration: apply trên DB test mới và nâng cấp DB test với schema cũ; bảo toàn historical rows/default/constraints. Tuyệt đối không reset DB đang dùng của tôi.
- Browser: API mode dùng HTTP/DB thật + fake AI có khai báo; login/chat/save/refresh/resume, welcome mới, conflict và đổi tài khoản. Fake AI không được mô tả là Gemini/OpenAI live.
- Dùng scripts backend typecheck, test, test:db, test:dist và frontend typecheck/build/test:e2e phù hợp. Tách DB/storage/port/build directory của test khỏi phiên dev đang chạy; không kill server của tôi hoặc để next build phá .next đang dùng.
- Demo login không được trở thành bypass auth trong production; nếu chạm phần này, giữ password login và kiểm tra môi trường đúng.
- Live smoke opt-in, không gọi dịch vụ trả phí chỉ vì tìm thấy key. Có script cho từng provider/task; báo “chưa kiểm chứng live” khi chưa chạy. Không đổi model để làm smoke xanh.
- Không thêm test chỉ sao chép implementation; ưu tiên các hành vi và race trên.

G. BÀN GIAO

- Cập nhật README, .env.example, backend/README, các handoff/config docs đang mô tả model cố định. Không thay tên model trong dữ liệu lịch sử hoặc toàn bộ tài liệu cũ bằng search-replace mù.
- Có ví dụ cấu hình Gemini và OpenAI, bảng precedence, lệnh chạy mock/test/live opt-in, giới hạn đã biết. Dùng placeholder cho key/model OpenAI chưa được tôi chọn.
- Ghi tài liệu docs/development/ai-foundation-handoff.md: vấn đề đã xác nhận, thay đổi, migrations, tests thực chạy, phần chưa kiểm chứng live và prerequisite cho full pipeline.
- Tạo commit có phạm vi rõ trên feat/ai-foundation sau checks, stage từng file liên quan. Không commit .env/key/build artifacts hoặc thay đổi không thuộc nhiệm vụ. Không push/merge/deploy tự động.
- Hoàn thành công việc đã được giao; không dừng ở đề xuất kiến trúc hoặc câu “có thể bổ sung adapter sau”. Nếu bị thiếu cấu hình live, vẫn hoàn tất code/mock tests và báo giới hạn chính xác.

NGHIỆM THU

Trong mock/test, toàn bộ hành vi hiện có qua checks phù hợp. Cả Gemini và OpenAI đều có adapter thực thi đủ ba port, với tests transport riêng. Đổi cấu hình provider/model không cần sửa domain/service/UI. Socratic scaffold không ghi đè sửa đổi học sinh; replay trả đúng provenance đã lưu; model/prompt/schema giữa runtime, DB và tài liệu không còn mâu thuẫn cho dữ liệu mới.
```
