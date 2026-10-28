# Prompt Grok — Hoàn thiện đăng ký, đăng nhập cho người dùng thật

> **Prompt lịch sử — rà lại 2026-10-28:** Nội dung giao việc bên dưới phản ánh thời điểm tạo, không phải hiện trạng hay lệnh vận hành hiện tại. Dữ liệu lớp/ảnh demo đã dời sang `backend/demo/`; các file store/mock prototype đã bỏ. Backend hiện dùng Python theo [ADR-0004](../docs/architecture/decisions/0004-python-monolith.md); không áp dụng nguyên trạng yêu cầu scaffold, tạo nhánh hoặc khôi phục mock trong prompt này.

Ngày: 18/10/2026.

Sao chép toàn bộ khối bên dưới vào Grok có quyền sửa repository. Công việc bắt đầu trên nhánh mới tạo từ `main`, chỉ tập trung xác thực và tài khoản. Các nhánh Python cũ dùng để tham khảo, không làm base hoặc mang cả backend sang.

Chính sách đã chốt: học sinh tự đăng ký; giáo viên dùng tài khoản prototype được tạo sẵn trong database, không có đăng ký giáo viên hoặc mã mời. Để hoàn thiện cho người dùng thật, prompt bao gồm xác minh email, khôi phục/đổi mật khẩu và quản lý phiên.

Tại thời điểm cập nhật prompt, nhánh local `feat/python-auth` đã được tạo trực tiếp từ local `main` tại commit `5e24268`. Chưa triển khai mã xác thực trong lần viết prompt này. Grok cần kiểm tra lại trạng thái thực tế trước khi làm.

```text
Bạn là kỹ sư full-stack triển khai EduLit-AI. Hãy thực hiện đầy đủ phần tài khoản
và xác thực cho người dùng thật, từ Next.js đến Python API và PostgreSQL.
Đọc repository, sửa file, chạy kiểm tra và báo cáo bằng tiếng Việt. Không dừng ở
thiết kế, scaffold, giao diện giả hoặc danh sách TODO.

THAM SỐ
BASE_BRANCH=main
FEATURE_BRANCH=feat/python-auth
SCOPE=authentication-and-accounts

1. NHÁNH VÀ PHẠM VI BẮT BUỘC

- Chỉ làm feature auth trên một nhánh mới checkout trực tiếp từ main.
  Không lấy feat/python-backend, feat/python-backend-mock, develop hoặc nhánh
  prototype làm base. Không merge/cherry-pick toàn bộ các nhánh đó vào feature.
- Đọc AGENTS.md áp dụng, chạy git status và kiểm tra refs trước khi thao tác.
  Nếu FEATURE_BRANCH chưa tồn tại, tạo bằng git switch -c feat/python-auth main
  khi working tree phù hợp. Giữ mọi thay đổi chưa commit; dùng worktree nếu cần.
- FEATURE_BRANCH có thể đã được tạo sẵn từ main để chuẩn bị prompt. Nếu nó đang
  được checkout, xác minh base và tiếp tục; không cố tạo lại, reset hoặc xóa nhánh.
  Nếu đã có công việc khác trên một nhánh cùng tên không đúng base, bảo toàn nó,
  tạo nhánh tên khác từ main và báo tên thực tế, không ghi đè lịch sử.
- Ghi base SHA thực tế. Local main và origin/main có thể khác nhau: không tự
  thay base bằng origin/main, pull/merge hoặc rebase main trong lượt triển khai.
- Không tự push, merge, force-push, reset --hard, xóa nhánh, deploy hoặc sửa DB thật.

Hoàn thiện trong cùng feature:
- Học sinh đăng ký, xác minh email và gửi lại email xác minh.
- Giáo viên/học sinh đăng nhập, ghi nhớ đăng nhập, khôi phục phiên sau refresh.
- Quên mật khẩu, đặt lại mật khẩu qua email, đổi mật khẩu khi đang đăng nhập.
- Đăng xuất hiện tại, xem/thu hồi phiên của mình và đăng xuất mọi thiết bị.
- Phân quyền TEACHER/STUDENT phía backend; giao diện đúng danh tính thật.
- Database/migrations, bootstrap giáo viên, gửi email, cấu hình local/production,
  kiểm thử API/E2E và hướng dẫn vận hành đủ để tiếp nhận tài khoản thật.

Không mở rộng sang quản lý lớp, CRUD bài tập, OCR, AI, LangGraph, chấm bài,
analytics, thanh toán, OAuth hoặc MFA. Không gọi API AI. Chỉ sửa shell/trang
nghiệp vụ đến mức cần cho danh tính, bảo vệ truy cập và empty state người dùng mới.
Không thêm public đăng ký giáo viên, admin hoặc hệ mã mời.

2. HIỂU ĐÚNG TRẠNG THÁI CỦA MAIN

Kiểm tra lại trước khi sửa; các thông tin dưới đây là mốc tham khảo:
- main có frontend Next.js/React/TypeScript/Tailwind/Zustand và đăng nhập giả lập.
- backend trên main mới có tài liệu/khung thư mục NestJS, chưa có Python API,
  SQLAlchemy model, Alembic hoặc frontend API auth hoàn chỉnh.
- Vì vậy cần scaffold backend Python tối thiểu cho auth ngay trên nhánh từ main.
  Không giả định các file app/main.py hoặc api-auth-store.ts đã có.
- feat/python-backend có auth Python để đọc bằng git show. Tái sử dụng có chọn
  lọc ý tưởng/hàm phù hợp; không copy toàn bộ models, migrations, dependencies,
  main.py, test fixtures hoặc routers liên quan đến nghiệp vụ ngoài auth.
- Không tạo schema bài tập/chấm bài chỉ để import được auth. Server phải chạy
  độc lập mà không cần module học tập, SDK AI, API key AI hoặc dữ liệu mẫu học sinh.

Đọc main: README.md, CONTRIBUTING.md, SRS.md, prototype/stitch_edulit_ai_platform_mvp/edulit_serene_paper/DESIGN.md, frontend/package.json,
frontend/src/app/layout.tsx, app/login/page.tsx, lib/store.ts, lib/types.ts,
backend/demo/roster_11a14.json (nguồn demo hiện tại; module mock cũ đã bỏ), TeacherShell.tsx, StudentShell.tsx,
backend/README.md, backend/.env.example và docs/architecture/decisions/.
Đọc AGENTS.md trong các thư mục định sửa nếu có.

Frontend/UI lấy từ main; không thay bằng phiên bản trên nhánh khác.
Tài liệu chọn NestJS/Prisma và tài khoản cấp sẵn là thiết kế cũ. Yêu cầu người
dùng hiện tại ưu tiên Python và học sinh tự đăng ký. Ghi ADR mới và cập nhật
tài liệu liên quan, không dùng thiết kế cũ làm lý do bỏ yêu cầu hoặc hỏi lại stack.

3. STACK VÀ CẤU TRÚC

- Python 3.12+, FastAPI, Uvicorn, Pydantic v2/pydantic-settings.
- PostgreSQL, SQLAlchemy 2 async, asyncpg, Alembic.
- argon2-cffi cho Argon2id, session opaque lưu PostgreSQL, cookie HttpOnly.
- uv và uv.lock cho backend; giữ npm/package-lock.json frontend.
- Email adapter SMTP có TLS cấu hình được; chọn thư viện async được duy trì,
  khóa version tương thích. Mailpit hoặc SMTP sink tương đương khi local/test.
- pytest, pytest-asyncio, HTTPX; Playwright E2E frontend + API + DB thật.
- Docker Compose cho PostgreSQL, API, frontend và SMTP sink local.

Tổ chức mã gọn theo module auth/identity: routers + request/response schemas,
service/use cases, domain rules, repositories/models; shared config, DB, email
và errors ở vị trí rõ ràng. Chỉ scaffold thành phần feature này cần. Router mỏng,
quy tắc xác thực nằm trong service/use case; không trộn ORM models với public DTO.

4. CHÍNH SÁCH TÀI KHOẢN

Học sinh:
- Tự đăng ký bằng họ tên, tên đăng nhập, email, mật khẩu và nhập lại mật khẩu.
- Backend luôn gán role STUDENT. Request không nhận role/status/permissions/ID.
- Email phải được xác minh trước khi tạo phiên có quyền sử dụng ứng dụng.
  Đăng ký xong đến màn hình hướng dẫn kiểm tra email, không tự đăng nhập trước
  xác minh. Sau xác minh hướng dẫn đăng nhập; không tự cấp quyền chỉ vì mở URL.
- Email phục vụ xác minh và khôi phục mật khẩu, không thu số điện thoại/PII khác.
- Không tự tham gia lớp hoặc nhận bài/điểm của học sinh mẫu khi tạo tài khoản.

Giáo viên:
- Không đăng ký. Seed/bootstrap tài khoản giáo viên sẵn có trong prototype main
  vào database và đăng nhập bằng cùng API với học sinh.
- Lấy persona từ MOCK_TEACHER/DEMO_TEACHER trên main. Tại mốc hiện tại: Cô Đặng
  Loan, email dang.loan@thptdanphuong.edu.vn, THPT Đan Phượng, lớp demo 12A1.
  Không dùng persona Đặng Hoàng Loan/11A14 trên feat/update-prototype để ghi đè main.
- Tên/email mẫu là dữ liệu bootstrap. Với môi trường thật, cho cấu hình email
  nhận thư và mật khẩu do người vận hành kiểm soát, vẫn giữ persona/role đã chốt.
  Không coi tên miền email mẫu là mailbox thật đã được xác minh.
- Tạo CLI bootstrap idempotent: không tạo trùng, đổi UUID, ghi đè mật khẩu đã đổi
  hoặc mất dữ liệu khi chạy lại. Không chạy lại seed để reset password mỗi lần start.
- Local có thể cấu hình password mẫu qua env để trải nghiệm như prototype.
  Production bắt buộc secret riêng; không bật preset password hoặc bypass auth.
  Ghi rõ luồng xác minh email/bootstrap giáo viên, không tự đánh dấu email bất kỳ
  là verified chỉ vì nó nằm trong mock. CLI cấp lại mật khẩu chỉ dành người vận hành.
- Alias username nếu cần là mapping chính xác phía server tới cùng user đã seed;
  không suy role từ username, email domain, query string hoặc lựa chọn trên UI.

5. SCHEMA VÀ MIGRATION CHỈ CHO AUTH

Thiết kế ít nhất:
- users: UUID, login_id, email, display_name, password_hash, role TEACHER/STUDENT,
  status ACTIVE/INACTIVE, email_verified_at nullable, created_at, updated_at.
  Unique theo định danh đã chuẩn hóa; có index/constraints phù hợp.
- auth_sessions: UUID, user_id FK, token_hash unique, expires_at, revoked_at,
  created_at, thông tin thiết bị tối thiểu cần cho danh sách phiên, không lưu
  fingerprint nhạy cảm hoặc trình bày vị trí thiết bị như kết luận chính xác.
- auth_tokens: user_id, purpose EMAIL_VERIFICATION/PASSWORD_RESET, token_hash,
  expires_at, used_at/revoked_at, created_at. Token chỉ dùng đúng mục đích.
- Bảng rate-limit dùng chung trên PostgreSQL nếu cần; cleanup session/token/bucket
  hết hạn bằng CLI hoặc lịch vận hành đơn giản. Không cần Redis/Celery.

Main chưa có Alembic thực thi: tạo initial migration chỉ cho auth. Không copy
initial migration toàn nền tảng từ nhánh Python cũ hoặc logic "có bảng users
thì bỏ qua toàn bộ DDL". Nếu phát hiện schema auth thật đã có, kiểm tra và viết
migration nối tiếp tương thích, không sửa migration đã áp dụng hoặc reset DB.

Validation ở server, phản chiếu trên frontend:
- loginId: strip/lowercase, 3–64 ký tự a-z, 0-9, '.', '_', '-', bắt đầu chữ/số.
  Unique database bảo đảm cả request đồng thời; bảo lưu định danh giáo viên.
- Email: validation bằng thư viện phù hợp, chuẩn hóa theo policy nhất quán và
  ghi rõ; không tự bỏ dấu chấm hoặc phần '+tag' theo quy tắc riêng của Gmail.
  Unique theo policy đó; giáo viên có thể dùng email/alias cấu hình để đăng nhập.
- displayName: strip, 2–100 ký tự, hỗ trợ tiếng Việt.
- Mật khẩu mới: 15–128 ký tự, cho phép Unicode/khoảng trắng, không tự strip,
  normalize hoặc cắt ngắn; không bắt công thức viết hoa/số/ký tự đặc biệt.
  Login không áp minimum của password mới để vô tình chặn tài khoản bootstrap.
- DTO forbid field ngoài contract; register luôn gán STUDENT phía server.
- Bắt đúng unique constraint và rollback; không biến mọi lỗi DB thành lỗi trùng.
- Đăng ký lại/gửi lại email không được thay password hoặc dữ liệu account đã có.
  Hai request cùng username/email phải có kết quả nhất quán, không tạo user dở dang.

6. API CONTRACT CẦN HOÀN THÀNH

Prefix /api/auth; JSON camelCase, response DTO rõ trong OpenAPI.
PublicUser = { id, loginId, email, displayName, role, emailVerified }.
Không trả password hash, raw session/reset/verification token hoặc dữ liệu nội bộ.

POST /register
  { loginId, email, displayName, password }
  202 { status: "verification_required", message }; không cấp session sử dụng app.
  Username trùng: 409. Email đã dùng với username mới: trả cùng HTTP 202/body
  trung tính như request mới, không sửa account cũ hoặc tiết lộ nó có tồn tại.
  Thông báo hướng dẫn kiểm tra email/đăng nhập, không khẳng định thư đã được giao.
POST /verify-email
  { token }; 200 { message }; xác nhận token atomic, đánh dấu verified.
POST /resend-verification
  { email }; 202 { message }; cùng phản hồi với email không tồn tại/đã verified.
POST /login
  { loginId, password, rememberMe?: boolean }
  Định danh nhận username hoặc email hợp lệ đã cấu hình; 200 { user: PublicUser }
  và session cookie mới. Đúng password nhưng email chưa xác minh trả lỗi riêng
  để UI có thể hướng dẫn gửi lại; sai password vẫn trả lỗi chung.
GET /me
  200 PublicUser trực tiếp; session thiếu/hết hạn/thu hồi trả 401.
POST /logout
  {}; 200 {}; thu hồi session DB, xóa cookie; idempotent.
POST /forgot-password
  { email }; 202 { message }; phản hồi trung tính, không tiết lộ account tồn tại.
POST /reset-password
  { token, newPassword }; 200 { message }; tiêu thụ token, đổi hash và thu hồi
  mọi phiên/những token reset còn lại trong transaction; không auto login.
POST /change-password
  { currentPassword, newPassword }; yêu cầu session hợp lệ và password hiện tại.
  Thành công thu hồi mọi phiên, xóa cookie và yêu cầu đăng nhập lại.
GET /sessions
  200 { sessions: [...] }; chỉ các phiên của mình, có isCurrent, không có token/hash.
DELETE /sessions/{sessionId}
  Chỉ thu hồi phiên của mình; thu hồi phiên hiện tại thì xóa cookie.
POST /logout-all
  {}; thu hồi toàn bộ phiên của user hiện tại, xóa cookie.

Lỗi thống nhất { error: { code, message, fields? } }, message tiếng Việt:
400 validation/token không hợp lệ; 401 sai credentials/session; 403 INACTIVE,
email chưa xác minh hoặc CSRF; 409 username trùng; 429 kèm Retry-After.
Đối với login, chỉ tiết lộ INACTIVE/unverified sau khi password được xác minh.
Response validation không được echo input password/token trong lỗi hoặc log.

7. EMAIL VÀ KHÔI PHỤC MẬT KHẨU PHẢI HOẠT ĐỘNG THẬT

- Tạo template tiếng Việt cho xác minh, đặt lại mật khẩu và thông báo đổi mật khẩu.
  Email không chứa mật khẩu hoặc thông tin riêng ngoài nhu cầu của tác vụ.
- Token CSPRNG tối thiểu 32 byte, chỉ lưu hash, TTL cấu hình, dùng một lần;
  xử lý race/replay bằng transaction/conditional update. Token chỉ đúng mục đích;
  hết hạn hoặc đã dùng bị từ chối. Retry không làm token dùng được hai lần.
- Link dựa trên APP_ORIGIN cấu hình; không lấy Host/returnTo do request tùy ý cung cấp.
  GET mở trang xác minh/reset không tự thay dữ liệu; frontend POST token khi xác nhận.
  Không log token/link, không lưu vào localStorage; tránh rò qua Referer, access log,
  analytics và browser history. Ưu tiên fragment + xóa token khỏi URL sau khi đọc.
- Gửi lại xác minh/reset có rate limit và cooldown; không khóa tài khoản chỉ vì
  có người yêu cầu reset. SMTP có timeout/retry giới hạn, gửi ngoài DB transaction.
  Email lỗi phải có đường gửi lại, log metadata và trạng thái vận hành rõ; không
  cấp session khi email chưa xác minh, không giả báo đã gửi thành công.
- SMTP adapter thật cấu hình qua env; local/test nhận và đọc được thư trong SMTP
  sink để kiểm thử link thật. Không lấy log raw token làm cơ chế email production.
- Không gửi thư thử tới địa chỉ thật ngoài yêu cầu người dùng. Không cần kết nối
  tài khoản email cá nhân để viết/test code; dùng SMTP sink và credential môi trường.

8. PASSWORD, SESSION, CSRF VÀ PHÂN QUYỀN

- Argon2id cho password; verify dummy hash khi username không tồn tại; rehash
  khi cần. Hash/verify chạy ngoài event loop bằng thread pool có giới hạn.
- Session token ngẫu nhiên tối thiểu 32 byte, DB chỉ lưu SHA-256 token;
  không JWT/localStorage/sessionStorage cho thông tin xác thực.
- Login cấp token mới, không tin token client tự chọn; thu hồi session cũ của
  cùng trình duyệt. Xử lý race login/đổi mật khẩu: session tạo sau khi credentials
  đã bị thay đổi không được sống sót chỉ vì request verify password cũ chạy trước.
- Cookie path=/, HttpOnly, SameSite=Lax, Secure bắt buộc production.
  rememberMe=false: session cookie + server TTL ngắn; true: Max-Age + TTL dài
  tương ứng, cấu hình được. Expires dùng datetime UTC có timezone.
- Mỗi request kiểm tra session expiry/revoked, user ACTIVE và email verified.
  Logout phải thu hồi DB; thất bại mạng không được báo logout thành công giả.
- Mutation auth: exact Origin allowlist, application/json, X-Edulit-CSRF: 1.
  Frontend gửi credentials: include. CORS chỉ APP_ORIGIN cụ thể, không wildcard
  hoặc phản chiếu origin tùy ý. Test cả register/login/logout/reset/change/revoke.
- Dependency backend quyết định TEACHER/STUDENT và ownership; client role không
  có thẩm quyền. Người dùng không được xem/thu hồi session người khác.
- Rate-limit login/register/resend/forgot/reset/verify theo IP tin cậy và
  account/định danh, atomic trên DB để dùng nhiều process; có hết hạn/Retry-After.
  Không tin X-Forwarded-For ngoài proxy cấu hình; alias không vượt được account limit.
- Không bật demo-login, danh sách demo account hoặc chuyển role bằng client
  trong luồng thật; production từ chối bypass kể cả cố bật cờ demo.
- Không log body auth, password, cookie, token/link hoặc SMTP credentials.
  Production fail rõ khi thiếu cấu hình bắt buộc, không fallback sang mock.

9. FRONTEND HOÀN CHỈNH, KHÔNG CHỈ FORM LOGIN

Triển khai /login, /register, /verify-email, /forgot-password, /reset-password,
và /account/security cho đổi password, danh sách phiên, thu hồi phiên/logout-all.
Trang chờ xác minh có gửi lại email, cooldown và hướng dẫn rõ ràng.

- Giữ thiết kế main: tokens, font, ảnh nền, component; không đổi toàn dashboard.
  Form đăng ký chỉ dành học sinh, không role selector/mã mời. Login chung hai vai trò.
- Label, autocomplete, accessible name cho show/hide password, focus, Enter submit,
  validation theo trường, aria-live, loading/error/success, chặn double submit;
  responsive mobile 375px và desktop. Nút/checkbox phải có hành vi thực.
- Tạo API client/store auth duy nhất vì main có thể chưa có; nếu đã tồn tại thì
  mở rộng. Auth thật là đường chạy mặc định được tài liệu hóa, không cần tìm cờ
  bí mật để bật. Không setTimeout giả login hoặc tự setUser(MOCK_*).
- Auth state: initializing/authenticated/unauthenticated/error; GET /me sau refresh
  là nguồn sự thật. Phân biệt lỗi mạng/5xx với 401, có retry. Không nháy nội dung
  riêng tư trong lúc kiểm tra. returnTo chỉ path nội bộ được cho phép.
- AuthGate cho phép đủ public auth pages, không đẩy /register hoặc /verify-email
  về /login. User đã login vào /login thì đến trang phù hợp.
- Shell/tên/role/logout dùng user API thật. Loại persisted identity cũ khỏi nguồn
  xác thực; mapping TEACHER/STUDENT sang UI role tại một chỗ. Chặn response cũ
  khôi phục session sau logout/đổi user; clear request/cache/draft theo user.
- Hide/bỏ demo role switch, quick login bỏ password và reset ghi đè danh tính
  trong auth thật. Nếu giữ demo, nó phải tách rõ, không bật trong production.
- /assignments sau login hiển thị đúng danh tính. User mới có welcome/empty state
  cho phần chưa có dữ liệu thật; không mang bài nộp/điểm/chat mẫu vào user mới.
  Giao diện nghiệp vụ chưa triển khai hiển thị trạng thái rõ, không gọi API chưa có.
  Không cần xây CRUD bài tập để hoàn thành auth.

10. CẤU HÌNH VÀ ĐƯỜNG CHẠY CHO NGƯỜI DÙNG THẬT

- Backend .env.example: DATABASE_URL, DATABASE_URL_TEST, APP_ORIGIN, APP_ENV,
  cookie/session TTL ngắn/dài, token TTL, rate limits, SMTP host/port/user/password,
  TLS/from, bootstrap teacher email/password; chỉ placeholder, không secret thật.
  Frontend env chỉ chứa cấu hình public cần thiết, không SMTP/DB credentials.
- Dockerfiles/Compose Python, PostgreSQL, frontend và SMTP sink local có healthcheck,
  volume bền vững, cổng cấu hình; không container_name cố định gây xung đột.
  Lock dependencies, chạy container bằng user không root; không đóng gói .env thật.
- Ưu tiên cùng origin khi deploy: reverse proxy /api tới Python để cookie hoạt động
  rõ ràng; cấu hình HTTPS/trusted proxy đúng. Không dùng config localhost/test SMTP
  như cấu hình production hoặc hứa gửi email khi chưa có provider hoạt động.
- Alembic migrate một lần trước rollout; không reset data/reseed password khi restart.
  Kiểm tra tài khoản tồn tại và đăng nhập được sau restart API/container.
- README/handoff ghi lệnh copy/paste từ clone sạch: uv sync, DB up, migration,
  bootstrap giáo viên, Uvicorn, frontend, SMTP sink, tests; ghi cwd/cổng/env.
- Ghi hướng dẫn cấu hình domain/HTTPS/SMTP thật, backup/restore auth DB và cleanup
  token/session hết hạn. Phần nào cần credential/domain ngoài repo phải nêu rõ;
  không coi việc thiếu secret thật là lý do bỏ implementation email.
- Viết ADR mới theo số tiếp theo và docs/development/python-auth-handoff.md;
  OpenAPI, error contract và frontend types phải nhất quán. Không tự bịa mã FR/BR
  sẵn có trong SRS khi yêu cầu auth mới chưa được gán mã.

11. KIỂM THỬ VÀ ĐỊNH NGHĨA HOÀN THÀNH

Dùng PostgreSQL test riêng. DATABASE_URL_TEST thực sự được fixture/engine sử dụng;
thiếu URL thì fail rõ, không fallback sang DB dev/production. Tạo data/cleanup cô lập,
không dựa vào account có sẵn hoặc sửa DB người dùng; không dùng SQLite thay PostgreSQL.

Backend integration/unit cần chứng minh:
- Register lưu đúng STUDENT, unique username/email và password hash; không lộ token.
- Unverified không login/đọc tài nguyên; verify thành công mới login được.
- Verify/reset token sai, hết hạn, khác purpose, đã dùng và request đồng thời.
- Trùng username/email, khác hoa/thường, hai request đồng thời không tạo trùng/500;
  retry/resend không đổi password/account cũ; email không tồn tại không bị tiết lộ.
- Seed giáo viên idempotent, login đúng user/role; register không tạo TEACHER/admin.
- Login sai/nonexistent/INACTIVE, password không bị trim; rememberMe/cookie flags,
  session rotation, session hết hạn/thu hồi, user bị disable sau khi login.
- Forgot -> reset -> password cũ thất bại/password mới thành công, mọi phiên cũ
  bị thu hồi; reset token dùng lại không được. Change password kiểm tra mật khẩu
  cũ, thu hồi phiên; test race giữa login và thay đổi credentials.
- Session listing/revoke/logout-all đúng ownership; phát lại cookie cũ bị từ chối.
- CSRF/CORS, input injection role/status, rate-limit qua hai app instance,
  demo bypass bị chặn production; lỗi/response/log không chứa password/token.
- SMTP sink nhận đúng thư/link; SMTP lỗi có timeout và cơ chế gửi lại; không bỏ qua
  xác minh hoặc giả thành công. Không gửi mail tới người thật trong test.
- Migration trên DB sạch và DB đã có dữ liệu auth; restart không mất tài khoản,
  không reset password; cấu hình production fail rõ khi thiếu thành phần bắt buộc.

Playwright với Next.js + Python API + PostgreSQL + SMTP sink thật, không mock auth:
1) Học sinh đăng ký -> đọc email test -> xác minh -> login -> đúng user -> refresh.
2) Logout -> trang riêng tư bị chặn -> login lại; sai password/username trùng có lỗi.
3) Forgot password -> email reset -> đặt password mới -> login; token cũ/phiên cũ
   không dùng được; trang bảo mật đổi password, thu hồi phiên và logout-all chạy thật.
4) Giáo viên bootstrap login trực tiếp -> đúng shell; không cần đăng ký giáo viên.
5) Public auth routes hoạt động; sửa localStorage role không nâng quyền; API tắt
   không login giả; user mới không thấy kết quả của học sinh mock.

Chạy kiểm tra Python/auth, migration, TypeScript, build frontend, E2E và
git diff --check. Chạy regression liên quan và chứng minh test chạy lại được.
Không ghi pass cho lệnh chưa chạy; lỗi môi trường cần ghi cụ thể và phần chưa xác minh.

Feature chỉ hoàn thành khi có thể tạo tài khoản mới trên DB sạch, xác minh email,
đăng nhập/refresh/đăng xuất, khôi phục/đổi mật khẩu và giữ account qua restart;
frontend dùng API thật và giáo viên dùng tài khoản bootstrap. Không gọi đây là
đã sẵn sàng production nếu mới kiểm thử local hoặc chưa kiểm chứng gửi SMTP thật.
Phân biệt rõ code hoàn thiện, local đã kiểm thử và cấu hình triển khai còn cần cung cấp.

12. BÀN GIAO

Báo cáo: branch + base SHA, phần đã làm, file chính, policy/contract cuối cùng,
lệnh chạy đầy đủ, kết quả từng nhóm kiểm tra thực tế, giới hạn còn lại và PR mô tả
đúng feature auth. Không tự bắt đầu tính năng học tập tiếp theo.
Nếu không có công cụ sửa repository, cung cấp patch/file đầy đủ và lệnh chạy,
nói rõ chưa áp dụng/chưa kiểm thử; không mô tả mã chưa chạy là chức năng đã hoạt động.
```

Tài liệu chính thức để đối chiếu:

- [FastAPI](https://fastapi.tiangolo.com/tutorial/dependencies/) và [SQLAlchemy asyncio](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html) cho API và truy cập dữ liệu.
- [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) và [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) cho mật khẩu và phiên.
- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) cho request trình duyệt.
- [OWASP Email Validation and Verification](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html) và [Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) cho xác minh và khôi phục tài khoản.
