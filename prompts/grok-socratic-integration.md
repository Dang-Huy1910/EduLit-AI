# Prompt Grok — Kết nối Socratic trên nhánh feat/socratic-integration

Ngày: 13/10/2026. Backend Socratic đã có application layer, persistence, adapter Gemini và CLI. Feature này bổ sung HTTP/auth tối thiểu và nối giao diện học sinh để kiểm thử xuyên suốt.

Sao chép toàn bộ khối dưới đây vào Grok có quyền đọc/sửa repository. Đây là tài liệu triển khai; HTTP API và giao diện dùng dữ liệu thật **chưa được triển khai bởi việc viết prompt này**.

## Prompt để sao chép

```text
Bạn là kỹ sư full-stack triển khai EduLit-AI trong repository hiện có.
Hãy viết code, chạy kiểm tra và bàn giao bằng tiếng Việt, không chỉ lập kế hoạch.
Chỉ thực hiện feature socratic-integration trong lượt này.

FEATURE_BRANCH=feat/socratic-integration
BASE_BRANCH=feat/socratic
REQUIRED_BASE_COMMIT=2ae044d

1. MỤC TIÊU VÀ PHẠM VI

Hoàn thành chu trình trên trình duyệt:
Đăng nhập học sinh thật → xem đề đã công bố → mở/khôi phục phiên Socratic →
gửi ý tưởng → nhận câu hỏi gợi mở → sửa/lưu dàn ý của học sinh → tải lại trang
vẫn thấy lịch sử/dàn ý từ PostgreSQL → đăng xuất và đổi học sinh không lẫn dữ liệu.

Backend hiện là TypeScript ESM, Node.js 24/npm, Prisma 7/PostgreSQL 17.
Frontend hiện là Next.js/React, Zustand và dữ liệu prototype.
AI cố định gemini-2.5-flash; use cases và guardrail đã có trên feat/socratic.
Không dựng pipeline AI hoặc data layer thứ hai.

Trong feature này chỉ làm:
- NestJS HTTP server tối thiểu, session auth và kiểm tra quyền học sinh.
- API đọc đề, mở/đọc phiên, gửi lượt chat và lưu dàn ý.
- API client và kết nối những màn học sinh cần cho chu trình trên.
- Kiểm tra HTTP/database và luồng thật trên trình duyệt; tài liệu chạy/bàn giao.

Không làm teacher CRUD, tạo/giao đề trên UI, nộp bài/chấm điểm, công bố điểm,
trích xuất văn phong, OCR/upload, dashboard, nhiều trường/lớp, membership,
queue/Redis, RAG, framework agent, streaming, đăng ký hay quên mật khẩu.
Dùng đề/tài khoản seed hiện có để thử; không tạo nút reset/xóa DB trên UI.
Người dùng phụ trách pipeline AI/database; cộng sự có thể dùng auth/API nền này
để làm CRUD sau. Controller chỉ chuyển DTO và gọi use case, không chứa prompt.

2. ĐỌC TRƯỚC KHI SỬA

- AGENTS.md áp dụng nếu có; README.md; backend/README.md.
- backend/package.json, tsconfig*.json, .env.example (không in secret từ .env).
- backend/prisma/schema.prisma, migrations, seed và scripts/run-db-tests.ts.
- backend/src/data-layer.ts và infrastructure/database/*.
- backend/src/modules/socratic/application/create-socratic-services.ts.
- Các use cases open-or-resume-session, get-socratic-session,
  save-student-outline, send-socratic-turn, session-access, persist-turn.
- backend/src/modules/socratic/domain/{actor,outline,output}.ts.
- backend/src/infrastructure/ai/* và các tests Socratic hiện có.
- docs/development/socratic-handoff.md; socratic-integration.md;
  minimal-mvp-roadmap.md; docs/architecture/minimal-database.md.
- frontend/package.json; frontend/src/lib/{store,types}.ts.
- frontend/src/app/login/page.tsx; app/assignments/page.tsx;
  app/assignments/[id]/socratic/page.tsx.
- frontend/src/features/assignments/StudentAssignmentsView.tsx;
  frontend/src/components/StudentShell.tsx và phần auth/route guard liên quan.

Ưu tiên code và quyết định MVP mới nhất hơn tài liệu kiến trúc đầy đủ cũ.
Review cũ không đồng nghĩa lỗi còn tồn tại: đọc fixes của commit 2ae044d.

3. NHÁNH

- Kiểm tra status/branch/log. Nếu chưa có nhánh feature, tạo từ feat/socratic
  chứa 2ae044d hoặc commit mới hơn đã chứa fixes đó. Nếu nhánh đã có, tiếp tục.
- Không code integration trên feat/socratic, feat/database hoặc main.
- Không tự merge/push/reset/stash/drop. Giữ thay đổi ngoài phạm vi và các tài liệu
  chưa commit; chỉ stage file feature, tránh git add . khi có file khác.
- Tất cả auth/API/frontend/tests trong một nhánh feat/socratic-integration.
  Có thể chia commit feat(auth), feat(socratic-integration), test(integration).

4. HTTP SERVER VÀ AUTH TỐI THIỂU

- Thêm NestJS vào backend hiện có, giữ npm/ESM, Prisma major, SDK và CLI/tests.
  Không chạy scaffold ghi đè package/src. Đọc docs đúng phiên bản cài thực tế,
  khóa dependency trong lockfile. Kiểm tra decorators/DI trên runtime thật.
- Thêm dev/start/start:prod scripts rõ ràng; build chạy được từ dist và vẫn
  copy prompt/schema assets đúng. Có graceful shutdown Prisma và pg pool.
  PRISMA_SHUTDOWN hiện chỉ là provider trả hàm; phải gọi từ lifecycle hook,
  không giả định Nest tự gọi hàm đó. Dùng một Prisma handle cho app.
- Global prefix /api, JSON DTO validation/whitelist, giới hạn body/input hợp lý.
  Tái sử dụng validators/use cases; chặn body thừa actor/studentId/role.
  Schema/limits phải tương thích UUID, requestId và outline hiện có.
- User/AuthSession đã có. Login dùng loginId/password, verify argon2 hash.
  Tạo token ngẫu nhiên mật mã tối thiểu 32 byte, lưu SHA-256 tokenHash trong DB;
  raw token chỉ trong cookie HttpOnly. Không JWT/refresh token/localStorage token.
- Cookie host-only, Path=/, SameSite=Lax, Secure ở HTTPS production;
  dev HTTP localhost được cấu hình rõ. TTL có cấu hình. Logout revoke phiên
  ở DB và clear cookie cùng thuộc tính. Mỗi request kiểm tra hết hạn/revoked,
  User ACTIVE và role từ DB. Sai login trả thông báo chung, có giới hạn thử login
  tối thiểu trong process cho pilot; không thêm Redis.
- /auth/me trả user tối thiểu { id, loginId, displayName, role }.
  Không trả passwordHash, tokenHash hoặc raw token trong JSON/log.
- Actor use case luôn được tạo từ phiên backend đã xác thực, không từ body,
  query, header tự khai báo user hoặc Zustand. Giáo viên không gọi API học sinh.
- CORS cho đúng APP_ORIGIN, credentials=true, không wildcard.
  Frontend fetch credentials:'include'. Local dùng cùng hostname localhost,
  không trộn localhost với 127.0.0.1 cho hai dịch vụ.
- Bảo vệ CSRF cho login/logout và mọi mutation: kiểm tra Origin chính xác theo
  APP_ORIGIN và chỉ nhận application/json. Reject Origin thiếu/null/sai với
  mutation trình duyệt nếu không có cơ chế CSRF token thay thế được kiểm chứng.
  SameSite hỗ trợ nhưng CORS đơn lẻ không đủ; OPTIONS preflight vẫn hoạt động.

5. ROUTES VÀ CONTRACT

Triển khai các routes trong docs/development/socratic-integration.md:
POST /api/auth/login                          { loginId, password }
GET  /api/auth/me
POST /api/auth/logout                        {} (JSON)
GET  /api/assignments
GET  /api/assignments/:assignmentId
POST /api/assignments/:assignmentId/socratic-sessions  {} (JSON)
GET  /api/socratic-sessions/:sessionId
PUT  /api/socratic-sessions/:sessionId/outline
     { outline, expectedOutlineRevision }
POST /api/socratic-sessions/:sessionId/turns
     { requestId, expectedLastSequence, message }

- Pilot hiện chưa có membership: active STUDENT được đọc đề PUBLISHED.
  Không tự suy diễn quyền theo lớp hoặc school mock. Query assignment dùng
  explicit select; không trả mật khẩu giáo viên, bài/phiên của người khác.
- List/detail đề trả dữ liệu tối thiểu phục vụ màn học sinh, trạng thái bài nộp
  và sessionId hiện có chỉ của actor. Không thêm API đánh giá để làm đẹp dashboard.
- Đề CLOSED không mở phiên qua POST. GET phiên đã sở hữu vẫn được đọc lịch sử;
  UI có thể dùng sessionId từ lần trước/URL để mở trực tiếp lịch sử.
- Dùng createSocraticServices(prisma, ai) hiện có, không copy business logic.
  open/get trả SocraticSessionView, open thêm resumed. Đọc signature thật;
  factory nhận positional args, không gọi theo pseudo-code DTO của handoff.
- Outline: { sections: [{ id, title, points: string[] }] }.
  expectedOutlineRevision phải là revision server; send turn dùng lastSequence
  server. Không đổi validators/revisions để phù hợp dữ liệu prototype.
- Dates ISO, Decimal serialize thành string; giữ snapshot/criteria thật.
  Màn rubric/học liệu của phiên đọc snapshot, không lấy đề mới đè context cũ.
- Request/replay, atomic pair và lock order giữ đúng implementation hiện có.
  Không giữ transaction trong lúc gọi Gemini; không tạo messages ở controller.
- Chuẩn hóa lỗi { error: { code, message } } với message tiếng Việt phù hợp.
  400 input, 401 session auth không hợp lệ, 403 role/inactive, 404 tài nguyên
  không có/không sở hữu (không tiết lộ khác chủ), 409 revision/turn/key conflict,
  413 context quá lớn, 429 rate limit, 503 provider unavailable, 504 timeout.
  Lỗi unexpected trả 500 chung; không trả stack, prompt hoặc secret.
  SESSION_ASSIGNMENT phân biệt không tồn tại (404) và trạng thái chặn (409)
  theo dữ liệu đã được phép đọc, không chỉ parse message của DomainError.

6. FRONTEND: CHUYỂN ĐÚNG LUỒNG CẦN THỬ

- Giữ giao diện/thiết kế hiện có; không rewrite app hoặc thêm UI framework.
- Thêm frontend .env.example: NEXT_PUBLIC_DATA_MODE=api|mock và
  NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api. API là chế độ kiểm thử
  integration; mock chỉ được chọn rõ, không tự fallback nếu server lỗi.
- Backend AI_MODE=mock|live độc lập với frontend DATA_MODE.
  api + AI_MODE=mock vẫn dùng login/HTTP/DB thật, chỉ giả lập provider AI.
  api + AI_MODE=live mới gọi gemini-2.5-flash bằng key chỉ ở backend.
- API client typed và mapper rõ: User.role uppercase → UI role lowercase.
  User không có school/email/class, rubric không có levels mock; không thêm
  cột DB hoặc bịa thông tin/điểm/thống kê để đáp ứng types prototype.
- Login dùng loginId thật, password để trống cho người thử nhập. Không suy ra
  role từ chuỗi tên, không hardcode password seed. Quick login và role switch
  chỉ còn trong mock mode. API route guard chờ /me trước khi hiển thị dữ liệu;
  persisted MOCK_TEACHER không được xem là đã xác thực.
- StudentAssignmentsView dùng API và UUID thật trong URL; mở mã bằng dữ liệu
  API đã tải, không mock ID. Hiển thị đúng displayName, đề/rubric/học liệu.
  Ẩn các số liệu chưa có API và nút mô phỏng lỗi trong API mode.
- Trang Socratic mở/resume qua POST rồi đọc lịch sử/revisions từ server.
  Khi có sessionId URL được xác thực, có thể GET trực tiếp để xem phiên đóng.
  Bỏ fake reply bank/setTimeout, công tắc giả lập kết nối/hoàn thành trong API mode.
  Bảo vệ chống response request cũ ghi vào phiên mới khi đổi route/user.
- Chat state/draft/outline scoped theo userId + sessionId. Zustand chỉ giữ
  UI/draft phù hợp; lịch sử authoritative là DB, không một mảng chat global.
  Không persist dữ liệu nhạy cảm của người trước làm mặc định cho API mode.
- Mỗi thao tác gửi tạo requestId một lần (đúng format backend cho phép).
  Retry khi mất response dùng lại cùng requestId/message/expectedLastSequence;
  không tự sinh key mới. Reconcile GET; merge messages theo id/sequence server.
  Pending bubble không tăng lastSequence và không tạo cặp trùng trên UI.
  Phân biệt request timeout chưa biết kết quả với lỗi chắc chắn chưa lưu.
- Request chat timeout phải lớn hơn tổng budget backend/provider hiện có.
  Không tự gọi live lại vô hạn. 409 reload phiên, giữ draft, cho học sinh xem
  trước khi gửi lại; không tự resubmit stale turn với một key mới.
- Dàn ý do học sinh nhập/sửa, lưu rõ ràng bằng PUT với revision. Dirty draft
  không bị refetch ghi đè; 409 giữ bản đang sửa và thông báo cần đối chiếu.
  AI không tự viết/ghi đè dàn ý. Ánh xạ points:string[] đúng contract.
  Disable gửi chat khi có dàn ý chưa lưu hoặc đang lưu để context dễ hiểu.
- Phiên COMPLETED/đề CLOSED/đã nộp: đọc được, chat và sửa dàn ý bị khóa.
  Loading/error/retry tiếng Việt theo kết quả request thật, không timer cố định.
- Logout gọi server, clear auth và tất cả cache/draft theo học sinh, về login.
  401 cũng xóa trạng thái xác thực; không để response đang bay khôi phục cache.
- /chatbot, FloatingChatWidget, teacher pages, nút nộp bài/chấm và báo cáo
  chưa có API: trong API mode ẩn/khóa hoặc ghi rõ chưa triển khai, có thể đưa
  chatbot về màn Socratic của đề. Không tiếp tục trả mock thành kết quả thật.
  Giữ prototype đầy đủ chạy được khi chọn mock mode.

7. KIỂM TRA CẦN CHẠY

- Giữ các kiểm tra backend hiện có: typecheck, build, unit, DB integration,
  test:dist. Dùng DB test riêng qua runner; không reset DB dev để chạy tests.
- Thêm HTTP integration dùng DB test và fake SocraticAiPort injection:
  login đúng/sai, cookie attributes, expired/revoked/inactive user, logout;
  unauth/teacher/spoof actor/khác chủ bị chặn; CORS và mutation Origin sai/thiếu;
  list chỉ PUBLISHED và dữ liệu của actor; input sai không persist;
  open/resume, lưu/đọc outline, atomic turn, retry cùng key, key khác nội dung,
  revision/sequence conflict, phiên đóng/đã nộp; lỗi provider đúng HTTP.
  Kiểm tra build dist chạy HTTP thật và shutdown giải phóng pool.
- Frontend typecheck/build theo scripts thực tế. Nếu lint script cũ không chạy
  được ở phiên bản Next hiện tại, báo rõ và sửa tối thiểu nếu cần, không bỏ qua.
- Thêm kiểm tra trình duyệt (Playwright nếu chưa có công cụ phù hợp) với HTTP
  server + PostgreSQL test thật + AI_MODE=mock, không mock fetch thành công:
  login → chọn VAN12-NLXH-SOC → chat → lưu dàn ý → refresh/đăng nhập lại vẫn còn;
  mở hai tab gây conflict không mất draft; mất response rồi retry không trùng;
  logout → học sinh khác không thấy chat/dàn ý của người trước.
  Browser fixture dùng secret test từ môi trường, không hardcode password thật.
- Viết hướng dẫn test tay trên UI với seed bui.hamy, đề VAN12-NLXH-SOC,
  password lấy từ DEV_SEED_PASSWORD người dùng tự cấu hình.
  VAN12-NLXH-01 của Bùi Hà My đã nộp, không dùng để thử lượt chat mới.
- Live Gemini chỉ opt-in khi người thử cấu hình AI_MODE=live và key backend;
  không tự chạy live trong unit/HTTP/browser tests. Ghi riêng mock vs live,
  thiếu key/quota nói chưa kiểm chứng, không đổi model hoặc báo model đạt giả.

8. BÀN GIAO

- Cập nhật backend/README.md, frontend/README.md (tạo nếu thiếu), .env.example,
  docs/development/socratic-integration.md và trạng thái minimal-mvp-roadmap.md.
- Ghi rõ routes/DTO/error codes thực tế, auth/cookie/CORS và policy pilot.
  Cách chạy DB/API/frontend, chọn hai trục mock/live, tài khoản seed và test UI.
- Báo các file chính, nhánh/commits nếu tạo, lệnh và kết quả kiểm tra đã chạy,
  phần chưa chạy/lỗi môi trường và phạm vi chưa có API.
- Chỉ coi hoàn thành khi luồng trình duyệt dùng HTTP + DB thật chạy được;
  build xanh hoặc CLI chạy được chưa đủ. Không tuyên bố chất lượng Gemini
  hoặc cá nhân hóa văn phong đã đạt dựa vào fake adapter.
```
