# Prompt Grok — Database MVP trên nhánh feat/database

Ngày: 13/10/2026. Prompt này yêu cầu triển khai database; không yêu cầu triển khai AI, frontend hoặc toàn bộ backend.

Phạm vi mới nhất do người dùng thống nhất: người dùng sở hữu database và pipeline AI; cộng sự xây backend quản lý. MVP nhập học liệu/bài viết bằng văn bản, tập trung Socratic, chấm rubric và hồ sơ văn phong. OCR, nhập PDF/DOCX, dashboard nâng cao, queue/outbox và hệ nhiều trường được để sau.

## Cách sử dụng

Sao chép toàn bộ khối bên dưới vào Grok có quyền đọc/sửa repository. Toàn bộ schema, migrations, seed, kiểm tra và tài liệu database nằm trong một nhánh `feat/database`. Khi chuyển sang chức năng khác như Socratic, chấm bài hoặc cập nhật văn phong bằng AI mới tạo nhánh feature riêng. Grok không có quyền chạy công cụ phải cung cấp patch và lệnh để người dùng chạy, không tuyên bố đã kiểm tra.

Prompt này không yêu cầu tạo nhánh hoặc sửa database trong phiên viết prompt hiện tại.

## Prompt để sao chép

```text
Bạn là kỹ sư backend/database triển khai EduLit-AI trong repository có sẵn.
Hãy thực hiện công việc, tạo file và chạy kiểm tra phù hợp nếu môi trường cho phép;
không chỉ đưa ra thiết kế. Báo cáo bằng tiếng Việt.

THAM SỐ LƯỢT HIỆN TẠI
FEATURE_BRANCH=feat/database
BASE_BRANCH=docs/architecture

Triển khai toàn bộ database MVP trong FEATURE_BRANCH. Các bước ở mục 8 cùng
thuộc nhánh này, không tách thành nhánh nhỏ. Không tự bắt đầu phần AI hoặc CRUD.

1. BỐI CẢNH VÀ PHẠM VI

EduLit-AI hỗ trợ dạy/học Ngữ văn THPT. Frontend prototype đã có Next.js 15,
React 19, TypeScript và Zustand. Backend hiện có thể mới là khung thư mục;
phải kiểm tra trạng thái thật trước khi scaffold.

Người dùng phụ trách database và AI. Cộng sự sẽ code đăng nhập/phân quyền,
quản lý đề, nhận bài nộp và API đọc kết quả dựa trên database bạn tạo.

MVP cần chu trình:
Giáo viên nhập đề + học liệu + rubric → học sinh chat Socratic/lập dàn ý →
nộp văn bản → chấm theo rubric → lưu nhận xét có bằng chứng → cập nhật
hồ sơ viết → lấy hồ sơ cho phiên hướng dẫn bài tiếp theo.

Đây là phạm vi ưu tiên mới nhất, nhỏ hơn kiến trúc toàn bộ nền tảng trong docs.
Không tự dựng OCR, bảng ảnh/file, PDF/DOCX ingestion, quản lý nhiều trường,
dashboard/heatmap, embeddings/vector DB, Redis, pg-boss, outbox, microservices
hoặc fine-tuning. Không gọi Gemini ở giai đoạn database. Model tương lai giữ
nguyên gemini-2.5-flash; không đưa API key thật vào fixture hay repository.

Chưa triển khai HTTP CRUD, đăng nhập, chatbot hay chấm AI. Chỉ tạo data layer,
validation dữ liệu cần thiết, persistence helpers và kiểm tra database.

2. ĐỌC REPOSITORY TRƯỚC KHI SỬA

Đọc AGENTS.md áp dụng nếu có, README.md, CONTRIBUTING.md, backend/README.md,
backend/.env.example, frontend/src/lib/types.ts và:
- docs/architecture/data-model.md
- docs/architecture/system-design.md
- docs/architecture/decisions/0001-mvp-stack.md
- docs/development/implementation-roadmap.md

Không sao chép nguyên mô hình dữ liệu đầy đủ. Ghi lựa chọn MVP tối giản trong
một ADR mới, ví dụ docs/architecture/decisions/0002-minimal-mvp-database.md,
và liên kết từ tài liệu database; giữ lịch sử thiết kế cũ.

Kiểm tra git status, nhánh hiện tại, manifests, lockfiles, schema và migrations.
Nếu code database đã có, mở rộng theo trạng thái thật; không tạo implementation
thứ hai hoặc ghi đè công việc đang tồn tại. Không đọc/in secret để chẩn đoán.

3. QUY TẮC NHÁNH GIT

- Dùng duy nhất FEATURE_BRANCH=feat/database cho toàn bộ phần database.
  Schema học tập, schema văn phong, seed và kiểm tra đều thuộc nhánh này.
  Chỉ tạo nhánh mới khi chuyển sang chức năng khác được người dùng yêu cầu.
- Không code trực tiếp trên main/master hoặc nhánh BASE_BRANCH.
- Với BASE_BRANCH=auto: xác định nhánh tích hợp từ cấu hình repository hoặc
  nhánh tài liệu hiện tại nếu sạch và chưa có nhánh tích hợp khác. Ghi tên và
  commit làm base trong báo cáo. Nếu có nhiều base hợp lý mà chưa xác định
  được, hỏi một câu cụ thể, không đoán để merge/push.
- Nếu FEATURE_BRANCH đã tồn tại, kiểm tra và tiếp tục trên nhánh đó; không
  ghi đè/reset. Nếu có thay đổi chưa commit, giữ nguyên; dùng worktree tách
  biệt khi phù hợp. Nếu dữ liệu đầu vào nằm trong thay đổi chưa commit, báo
  cách giữ lại chúng, không stash/drop hoặc mang chúng sang nhánh âm thầm.
- Chỉ stage file thuộc feature hiện tại, không git add . khi có thay đổi khác.
- Commit theo Conventional Commits, ví dụ feat(database): add learning schema.
  Có thể chia thành nhiều commit dễ review trong cùng nhánh feat/database.
  Nếu có quyền commit và checks đạt, tạo commit; nếu không, cung cấp lệnh.
- Không tự push, merge, force-push, xóa nhánh hoặc sửa lịch sử commit.
- Cuối lượt báo branch, base, commit nếu có, diff, checks và PR description
  dự thảo. Không cần PR trên dịch vụ bên ngoài để hoàn thành lượt.

4. CÔNG NGHỆ VÀ TỔ CHỨC

- PostgreSQL 17; Node.js 24 LTS; TypeScript; npm.
- Với backend chưa có Prisma: chọn Prisma ORM 7.x cho workflow schema.prisma
  và SQL migrations; khóa cùng patch cho prisma/@prisma/client và các adapter
  tương thích. Ghi phiên bản thực tế, không cài latest không kiểm soát.
- Đọc tài liệu chính thức đúng major trước khi tạo config/client/migration.
  Không trộn prisma.config.ts, generator, driver adapter và CLI của các major.
  Nếu repository đã có Prisma major khác chạy được, giữ major đó, dùng đúng
  workflow tương ứng và ghi lựa chọn thay vì tự hạ/nâng version.
- Backend package/lockfile riêng; giữ nguyên frontend/package-lock.json.
- NestJS là backend đích. Tạo database provider/client có thể tích hợp NestJS;
  chỉ scaffold cấu hình/dependency tối thiểu cần cho data layer, không scaffold
  cả server/controller/auth/worker.
- Schema/migrations thuộc backend/prisma/ với Prisma 7; persistence dùng vị trí
  module trong backend/src/modules/... và shared DB provider nằm trong
  backend/src/infrastructure/database/.
- Dev Compose nằm infra/docker/compose.database.yml, chỉ PostgreSQL, có
  healthcheck và named volume riêng dự án. Không dùng container_name cố định
  gây xung đột; cổng host cấu hình được, không chiếm cổng đã có dịch vụ.
- .env.example chứa placeholder; connection string/seed password thật đọc
  từ biến môi trường. Không in nguyên DATABASE_URL/password/token ra log.
- Viết scripts npm rõ để validate/generate, tạo migration dev, apply migration,
  seed, typecheck/build và test database; ghi cwd/lệnh thực tế trong README.
  Chỉ cung cấp script phù hợp với implementation thực tế.

Nguồn chính thức cho Prisma 7:
https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production
https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/seeding

5. MÔ HÌNH DỮ LIỆU ĐÍCH: 9 BẢNG NGHIỆP VỤ

Triển khai đủ chín bảng trong cùng nhánh feat/database.
Dùng model PascalCase và map tên bảng snake_case; API/domain field camelCase.
UUID nội bộ; timestamp UTC; index theo foreign key và truy vấn sử dụng thực tế.

1) User → users
- id, loginId duy nhất, displayName, passwordHash, role TEACHER/STUDENT,
  status ACTIVE/INACTIVE, createdAt, updatedAt.
- Chỉ tài khoản cấp sẵn. Không thêm self-registration hoặc role admin nhiều tầng.
- Thí điểm một nhóm học sinh cố định; ghi rõ policy truy cập và chủ sở hữu đề.

2) AuthSession → auth_sessions
- id, userId FK, tokenHash duy nhất, expiresAt, revokedAt?, createdAt.
- Chỉ lưu hash session token; không implement endpoint auth trong feature DB.

3) Assignment → assignments
- id, teacherId FK, code duy nhất, title, instructions, genre, gradeLevel,
  learningMaterialText, rubric JSONB, maxScore Decimal, scoreStep Decimal,
  status DRAFT/PUBLISHED/CLOSED, publishedAt?, dueAt?, createdAt, updatedAt.
- Rubric nằm trong assignment, chưa cần bảng rubric/material riêng.
- Nêu rõ rubric format: criteria có criterionId, name, weight (điểm tối đa),
  descriptor/requiredElements tùy chọn; không coi weight là hệ số nhân.
- Grade level 10–12; maxScore/scoreStep dương; tổng weight bằng maxScore.
- Không tự áp dụng một rubric mẫu cho mọi bài hoặc ép mọi đề phải có phản đề.
- Đề đã có phiên/bài nộp giữ nguyên nội dung dùng xử lý; thay đổi tạo đề mới
  hoặc dùng policy snapshot ở mục 6, không thay lịch sử âm thầm.

4) SocraticSession → socratic_sessions
- id, studentId FK, assignmentId FK, contextSnapshot JSONB, outline JSONB,
  status ACTIVE/COMPLETED, createdAt, updatedAt.
- Một session hiện hành cho student/assignment trong MVP; không FSM bốn bước.
- Snapshot giữ instructions, học liệu và rubric lúc khởi tạo, không chứa profile
  cố định khiến bộ nhớ mới không được dùng ở lượt sau.

5) ChatMessage → chat_messages
- id, sessionId FK, sequence, role USER/ASSISTANT, content, createdAt.
- Unique (sessionId, sequence), order ổn định khi timestamp bằng nhau.
- Tách history theo session/student/assignment, không history toàn app.

6) Submission → submissions
- id, studentId FK, assignmentId FK, socraticSessionId? FK,
  text, contentHash, assignmentSnapshot JSONB, submittedAt, createdAt.
- text là bản nguyên văn bất biến sau submit; chưa có OCR/ảnh/nộp lại.
- Unique (studentId, assignmentId) trong phạm vi MVP.
- Nếu có socraticSessionId, session phải cùng student và assignment.
- Không lấy văn bản chatbot sinh ra làm bài tự viết của học sinh.

7) Assessment → assessments
- id, submissionId FK duy nhất, rubricSnapshot JSONB, detailedEvaluations JSONB,
  totalScore Decimal, maxScore Decimal, status AI_DRAFT/PUBLISHED,
  modelName, promptVersion, assessedAt, publishedAt?, createdAt.
- Đây là một kết quả hiện hành/bài, chưa nhiều revision/nhiều lần chấm.
- Lưu modelName mặc định gemini-2.5-flash; không có lượt gọi thật trong feature DB.
- Điểm nằm trong giới hạn; tổng tiêu chí, scoreStep và snapshot phải hợp lệ.
- Draft và published phân biệt rõ; điểm AI chưa là điểm chính thức mặc định.
- Publish ở MVP chỉ là chuyển trạng thái đơn giản, không quy trình nhiều bước.

8) WritingObservation → writing_observations
- id, studentId FK, assessmentId FK, kind STRENGTH/WEAKNESS/STYLE,
  featureKey, description, genre, evidenceQuote, evidenceStart, evidenceEnd,
  status PROVISIONAL/SUPPORTED/RESOLVED/INVALIDATED, observedAt, createdAt.
- Evidence tham chiếu nguyên văn submission qua assessment, không text mẫu.
- Dùng offset UTF-16 theo String.slice của JS/TS, khoảng [start,end); ghi rõ
  quy ước để không lệch dấu tiếng Việt/emoji. Nếu normalization, phải diễn ra
  trước lưu text; mọi offsets dùng chính text đã lưu bất biến.
- Một observation/student/assessment/featureKey trong MVP; nhiều evidence
  có thể mở rộng sau, không tạo hàng lặp khi retry.
- Student phải chính là tác giả submission của assessment. Không tin studentId
  bất kỳ được caller truyền; derive/check qua relation. Ưu tiên constraint khả
  thi, phần kiểm tra chéo còn lại nằm trong transaction/persistence helper.

9) WritingProfile → writing_profiles
- id, studentId FK duy nhất, declaredGoals JSONB, summary JSONB,
  observationIds JSONB (hoặc relation rõ nếu cần), version, updatedAt.
- Summary gồm điểm mạnh, điểm cần luyện, khuynh hướng diễn đạt và bài nguồn;
  không gắn confidence cao chỉ vì đủ 3–4 bài.
- declaredGoals là tự khai báo, tách observations do bài viết chứng minh.
- Summary là dữ liệu dẫn xuất; observations/evidence là nguồn sự thật.
- Không dùng summary làm đầu vào quyết định điểm bài mới.
- Version/transaction ngăn update cũ ghi đè profile mới. Mọi reference trong
  profile phải thuộc student và observation còn hiệu lực.

Tổng bảng nghiệp vụ không bao gồm bảng migration nội bộ của Prisma. Chỉ thêm
bảng thứ 10 trở lên nếu có nhu cầu cụ thể không thể đáp ứng an toàn bằng mô
hình trên; giải thích trước khi mở rộng, không thêm bảng dự phòng hàng loạt.

6. QUY TẮC PERSISTENCE

- FK, unique, CHECK đơn giản (điểm, thời gian, offset, version) thực thi ở DB
  nơi khả thi. Kiểm tra JSONB/role/quote/scope phức tạp dùng validator và
  persistence use case trước ghi; không tuyên bố FK tự kiểm tra mọi quyền.
- Dùng Decimal cho điểm, không cộng số thực rồi bỏ qua sai lệch. Kiểm tra
  totalScore bằng tổng awardedScore, mỗi criterionId đúng/duy nhất và giới hạn.
- Validate rubric/snapshot ở boundary; JSON đúng hình dạng chưa bảo đảm điểm
  hoặc evidence đúng. Có fixture sai để kiểm tra reject.
- Assessment rubricSnapshot khớp rubric trong submission assignmentSnapshot;
  không lấy rubric mới nhất của assignment để thay thế khi lưu kết quả cũ.
- Submission snapshot lấy từ assignment phía server trong cùng thao tác nộp;
  không nhận snapshot do client tự khai rồi tin là nguồn sự thật.
- Hồ sơ chỉ dùng assessment PUBLISHED trong MVP. Các thao tác lưu observation
  và refresh snapshot cần transaction; helper được thử bằng dữ liệu giả lập,
  không viết prompt/trích xuất AI ở giai đoạn DB.
- Observation lặp cho cùng input không làm profile tăng support count giả.
  Support count nếu có tính theo bài nguồn khác nhau; không theo số retry.
- Không cấu hình cascade xóa toàn bộ bài/hồ sơ theo user/assignment vô ý.
  Ưu tiên restrict/inactivate; token session có lifecycle riêng.
- Database ownership không đồng nghĩa database user app là superuser trên
  môi trường thật; ghi rõ khác biệt local bootstrap và quyền deployment.

7. MIGRATIONS VÀ KIỂM TRA

- Không dùng db push làm cách triển khai chính, không sửa migration đã apply.
- Với Prisma 7: migrate dev cho dev, migrate deploy cho test/deploy; generate
  và seed chạy rõ ràng. Major khác dùng đúng CLI đã kiểm tra trong docs.
- Có shadow database riêng khi workflow yêu cầu, không trỏ shadow vào DB dữ liệu.
- Không migrate reset, DROP DATABASE, xóa volume hoặc destructive cleanup trên
  database hiện có. Nếu tool yêu cầu reset vì drift, dừng thao tác đó và báo
  nguyên nhân/cách sửa bảo toàn dữ liệu. Dùng database dev mới, tên riêng dự án.
- Test dùng DATABASE_URL_TEST độc lập; validate DB đích trước mutation.
  Không mặc định fallback sang DATABASE_URL nếu thiếu test config.
- Sau thay đổi schema: validate, generate, typecheck/build, migration
  trên DB test mới hoặc sandbox DB riêng, kiểm tra constraint của phần mới.
- Không test bằng mock Prisma để tuyên bố FK/unique/transaction thật hoạt động.
- Thiếu Docker/DB/network hoặc quyền thì báo checks chưa chạy; cung cấp lệnh
  khắc phục, không ghi tất cả test passed hoặc tự hạ chuẩn kiểm tra.
- Seed chỉ dữ liệu tổng hợp: giáo viên và hai học sinh giả lập, đề/rubric/bài
  viết giả lập. Password lấy DEV_SEED_PASSWORD, hash Argon2id; không seed token
  đăng nhập hoạt động, không log mật khẩu. Không cần Gemini key để seed.
- Seed idempotent bằng khóa xác định; không truncate/xóa trước seed, không
  ghi đè dữ liệu do người dùng sửa hoặc thay password ở lần chạy sau.
- Không log toàn bộ text bài, secret hoặc URI kết nối trong test report.

8. CÁC BƯỚC TRONG CÙNG NHÁNH feat/database

Thực hiện lần lượt A → B → C → D, tiếp tục đến khi hoàn thành toàn bộ phần
database. Đây là các bước triển khai, không phải các nhánh Git riêng.

A. Nền tảng database
Mục tiêu: nền tảng PostgreSQL/Prisma dùng được cho cả hai người.
- Tạo ADR-0002 về scope tối giản và phiên bản công nghệ đã chọn.
- Cấu hình Node/TypeScript/npm tối thiểu ở backend; lockfile riêng.
- Compose PostgreSQL 17 với volume, healthcheck, cổng và env cấu hình được.
- Prisma config/client/provider và scripts cho workflow database.
- .env.example và hướng dẫn setup từ clone sạch; script kiểm tra kết nối an toàn.

B. Schema và persistence cho toàn bộ MVP
- Tạo đủ chín bảng ở mục 5, gồm tài khoản, luồng học tập và hồ sơ văn phong.
- Nếu DB chưa có schema, tạo migration khởi tạo chứa toàn bộ schema MVP.
  Nếu đã có migrations, thêm migration mới phù hợp; không sửa lịch sử đã apply.
- Tạo enum, indexes, constraints, snapshot và Decimal.
- Validation rubric/result; helpers tối thiểu cho freeze submission context
  và lưu assessment hợp lệ. Không viết AI/auth/HTTP endpoints.
- Persistence helper lưu observations có evidence và refresh profile atomically.
- Query lấy profile cùng evidence cho student, giới hạn recent observations;
  không trả observations của học sinh khác, không trả observation invalidated.

C. Seed dữ liệu giả lập
- Seed giả lập có một teacher, hai students, tối thiểu hai đề và nhiều bài
  trước/sau cho một student; assessments published và observations có evidence.
- Không giả danh đây là kết quả AI thật hoặc tuyên bố profile đã hội tụ.
- Kiểm tra seed chạy hai lần không nhân đôi/ghi đè nội dung người dùng sửa.

D. Kiểm tra và bàn giao
- Từ một DB test mới apply toàn bộ migrations, seed và chạy toàn bộ DB checks.
- Test thật FK/unique session tokenHash/loginId và constraint đơn giản.
- Test ownership/relation mismatch, duplicate submissions/message sequence,
  rubric sai/tổng điểm sai và snapshot không khớp bị reject.
- Chứng minh thay draft assignment không làm đổi snapshot đã lưu.
- Test quote/offset sai, lệch student/assessment, assessment chưa published,
  retry input gây duplicate, rollback một phần và optimistic version conflict.
- Test dấu tiếng Việt/emoji để xác nhận offset UTF-16 và text slice đúng.
- Test end-to-end data layer: assignment → chat → submission → assessment
  → observation → profile → query context cho phiên mới, không gọi Gemini.
- Cập nhật docs/architecture/minimal-database.md (ERD, keys, invariants),
  backend/README.md (lệnh thực chạy) và tài liệu bàn giao cho cộng sự:
  docs/development/database-handoff.md.
- Bàn giao role/status enum, Prisma imports, create/query examples, transactions,
  phạm vi ownership, scripts và các chức năng cố ý để sau.
Hoàn thành khi đủ chín bảng và persistence helpers, hồ sơ hai học sinh độc
lập, nhận xét có bằng chứng hợp lệ, snapshot lịch sử được bảo toàn và cập
nhật không ghi đè version mới. Một thành viên khác làm theo README có thể
dựng DB, apply migrations và seed, với báo cáo tests thực tế.

9. CÁCH LÀM VÀ BÁO CÁO

Đầu lượt: báo ngắn trạng thái repository, base branch, feature và các file
sẽ sửa; rồi triển khai toàn bộ phần database trên FEATURE_BRANCH.
Không chỉ viết kế hoạch và dừng sau bước A.
Không sửa giao diện, không chuyển package manager, không làm code cộng sự
đã nhận ngoài scope database. Sửa tài liệu liên quan để trạng thái rõ ràng.

Cuối lượt trả:
1) Feature/branch/base/commit và chức năng đã hoàn thành.
2) File/schema/migration mới, constraints và cách bảo toàn dữ liệu cũ.
3) Lệnh kiểm tra đã chạy + kết quả; checks chưa chạy và lý do nếu có.
4) Hướng dẫn setup/run đúng cwd; không chứa secret.
5) PR title/body dự thảo cho riêng feature này.
6) Các phần còn để sau như AI/CRUD; khi được yêu cầu triển khai phần mới,
   tạo nhánh feat/... theo chức năng từ base chứa database đã được tích hợp.
   Không tự merge hoặc bắt đầu chức năng tiếp theo trong lượt database.

Bắt đầu ngay bằng FEATURE_BRANCH=feat/database và thực hiện đủ các bước A–D.
```
