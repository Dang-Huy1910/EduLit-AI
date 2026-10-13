# Codex — hoàn thiện pipeline giáo viên và năm bước học sinh

Chạy sau [Codex — sửa nền AI](codex-ai-foundation.md). Prompt này mở rộng MVP văn bản trước đây sang **nộp ảnh và OCR thật**. Có sẵn yêu cầu seed dữ liệu phong phú; không cần prompt seed riêng để hoàn thành pipeline.

Sao chép toàn bộ khối sau vào Codex khi mở repository EduLit-AI:

```text
Bạn đang làm việc trực tiếp trong repository EduLit-AI. Hãy triển khai đầy đủ pipeline dưới đây bằng code, database, HTTP API và giao diện hiện có; kiểm thử rồi bàn giao cách chạy. Đây là nhiệm vụ thực thi xuyên suốt, không phải viết thêm prototype hoặc chỉ lập kế hoạch.

MỤC TIÊU SẢN PHẨM

Giáo viên tạo đề + ngữ liệu + barem -> lưu nháp -> công bố và chia sẻ mã đề -> học sinh đăng nhập, mở đúng đề -> (1) đọc đề/ngữ liệu -> (2) lập dàn ý với Socratic -> (3) viết tay và nộp ảnh -> (4) kiểm tra OCR, báo lỗi, giáo viên xác nhận bản chép -> (5) AI đánh giá rubric, giáo viên duyệt/công bố, học sinh nhận kết quả -> trích xuất văn phong có evidence -> Socratic của đề sau dùng profile đúng học sinh/thể loại.

Mọi bước trong API mode phải đọc/ghi DB và file storage thật. AI_MODE=mock chỉ thay provider bằng fake có nhãn rõ, không thay auth/database/upload/OCR workflow bằng dữ liệu Zustand giả.

A. TIẾP QUẢN VÀ PHẠM VI

- Đọc AGENTS.md nếu có, README, SRS, DESIGN, schema/migrations, HTTP/auth hiện có, các handoff Socratic/assessment/writing-profile và prompts/codex-ai-foundation.md.
- Kiểm tra phần foundation đã thực sự hoàn thành. Nếu còn lỗi chặn pipeline, sửa prerequisite bằng phạm vi/commit rõ, không giả định có adapter chỉ vì có tài liệu.
- Chụp git status/diff/log; giữ toàn bộ thay đổi có sẵn. Không reset/clean/stash tự động hoặc ghi đè .env. Không in secrets.
- Tái sử dụng Node/TS ESM + NestJS + Prisma/PostgreSQL và Next.js/React/Zustand/Tailwind hiện tại. Nếu làm UI, áp dụng skill UI phù hợp khi có; giữ phong cách prototype/thiết kế hiện có.
- Nhiệm vụ này cho phép hoàn thiện cả HTTP/backend thông thường và frontend, không để lại chúng cho “cộng sự nối sau” như phạm vi handoff cũ.
- Cập nhật ADR/phạm vi: chín bảng và không OCR là quyết định của MVP cũ, không phải giới hạn của yêu cầu mới. Thêm bảng/cột vừa đủ cho upload draft, pages, OCR revisions/review và trạng thái xử lý; giải thích quan hệ trước khi migration.
- Bảo toàn Submission/Assessment/profile văn bản đã có. Migration phân biệt nguồn legacy text với nguồn ảnh mới, không dựng ảnh/OCR hoặc gán một lần teacher confirmation chưa diễn ra cho dữ liệu cũ. Kiểm tra confirmed bắt buộc cho bài mode ảnh; client không được tự chọn legacy mode để bypass.
- Không làm lớp học/phân phối riêng từng học sinh, email, thanh toán, RAG/vector DB, multi-agent, queue/Redis, dashboard phân tích nâng cao. Gửi đề trong MVP là công bố + mã đề/copy link.
- Rubric nhập qua form, ngữ liệu nhập văn bản. Đọc PDF/DOCX để tự sinh barem không phải điều kiện hoàn thành; ghi rõ chưa có nếu không làm, không trình bày upload file như rubric đã được parse.

B. CHIA NHÁNH THEO FEATURE

Thực hiện tuần tự, mỗi nhánh chứa cả DB/API/UI/tests/docs của chức năng:

1. feat/teacher-assignments: giáo viên tạo/sửa nháp/công bố/đóng đề; học sinh mở mã; trang đọc thật; progress contract.
2. feat/submission-ocr: nộp ảnh riêng tư, che thông tin, OCR, báo lỗi và giáo viên xác nhận bản chép thành Submission.
3. feat/assessment-integration: nối chấm, xem AI_DRAFT, giáo viên duyệt/sửa/công bố, học sinh xem điểm chính thức.
4. feat/writing-profile-integration: nối extraction sau publish, review observations, profile học sinh và dùng profile ở Socratic tiếp theo; hoàn tất dataset/demo/end-to-end.

Tạo feature sau từ feature trước đã có code/commit và checks cần thiết. Không cần merge vào main để chuyển feature. Không tách nhánh riêng cho mỗi helper, migration, seed hoặc test. Tiếp tục đến hết pipeline, không dừng sau mỗi feature để hỏi tôi có muốn làm tiếp. Stage/commit chọn lọc, không commit secrets hoặc thay đổi không liên quan; không tự push/merge/deploy.

C. GIÁO VIÊN TẠO ĐỀ VÀ CHIA SẺ

- Teacher auth thật, chỉ tạo/sửa/xem worklist của đề mình sở hữu. Teacher khác không đọc drafts, sửa barem hoặc duyệt bài của đề này.
- Form có title, instructions, genre NLXH/NLVH, gradeLevel, learningMaterialText, rubric criteria/descriptors, maxScore, scoreStep, dueAt tùy chọn.
- Mặc định maxScore=10, scoreStep=0.25; vẫn hỗ trợ giá trị hợp lệ khác theo helpers hiện có. Rubric weight hiện là số điểm tối đa của tiêu chí, không phải hệ số nhân. Tổng max điểm tiêu chí phải đúng maxScore; dùng Decimal, không cộng tiền/điểm bằng float.
- DRAFT cho phép lưu nội dung chưa đầy đủ, nhưng vẫn validate type/size/JSON; PUBLISH phải qua toàn bộ kiểm tra bắt buộc. Form hiển thị lỗi từng field và tổng điểm; không chỉ một ô JSON khó dùng.
- Tạo mã unique ở server; publish idempotent. Lưu/sửa có expectedVersion/CAS, tránh hai tab ghi đè nhau. Không nhận teacherId/status tùy ý từ body.
- Sau publish, khóa nội dung đề/rubric để snapshot không lệch; muốn đổi thì clone sang draft mới. Close chặn mở phiên/nộp mới, không xóa bài/kết quả đã có. Không thêm sửa lịch sử, reopen hoặc nhiều phiên bản chấm trong MVP.
- dueAt hiện mang tính thông tin; giữ chính sách này và ghi rõ, không bất ngờ chặn nộp vì timestamp.
- Học sinh ACTIVE được xem/mở các đề PUBLISHED trong pilot bằng danh sách hoặc mã. Không ngụ ý đã có quyền riêng theo lớp/người nhận.
- UI giáo viên có danh sách đề, tạo/sửa nháp, preview barem/ngữ liệu, publish/copy code/link, close và danh sách bài theo trạng thái cần xử lý.

D. BƯỚC 1–2: ĐỌC VÀ SOCRATIC

- Tạo trang /assignments/[id]/reading (hoặc route tương đương thống nhất), đọc đúng đề/ngữ liệu/barem thật. Không dẫn workflow tới /materials mock.
- Ghi nhận học sinh đã đọc bằng thao tác rõ và trạng thái server tối thiểu. Không đánh dấu đã đọc chỉ vì route được render.
- Đề chưa bắt đầu dùng dữ liệu published; khi phiên/draft đã có snapshot, hiển thị cùng snapshot đã đóng băng cho các bước sau. Student đã tham gia được xem lại ngữ liệu/kết quả từ owned context ngay cả khi đề CLOSED.
- Giữ Socratic HTTP/chat/save/resume hiện có; scaffold chỉ gợi mở. Dàn ý học sinh sửa phải persist, dùng revision thật và được khôi phục sau refresh.
- Cho phép lưu/chốt dàn ý để sang bước viết; nếu muốn cho phép tiếp tục khi dàn ý chưa đủ thì có xác nhận rõ và policy nhất quán, không tự tạo bài mẫu để vượt bước.
- Outline/scaffold do AI tạo và chat không được coi là bài học sinh để trích xuất văn phong.
- Stepper lấy progress/state từ server, không tô đủ dấu tích theo index route. Phân biệt đang làm, cần giáo viên xử lý và hoàn tất; dùng chung trên năm bước.

E. BƯỚC 3: UPLOAD ẢNH VÀ CHE THÔNG TIN

- Có UploadDraft riêng: trước khi OCR được xác nhận chưa tạo immutable Submission. Một draft hoạt động cho student/assignment là đủ, không làm nhiều lần thi/nộp lại sau chốt.
- Lưu snapshot của đúng phiên/đề vào draft khi bắt đầu. Submission sau này kế thừa snapshot này, không đọc rubric mới hoặc nhận snapshot JSON do client tự gửi.
- Nhận 1–4 trang JPEG/PNG/WebP, mặc định tối đa 10 MB/trang, 40 MB/tổng và 25 megapixel/trang; giới hạn có cấu hình. Validate MIME, magic bytes, decode, kích thước/pixel, số trang và tổng bytes ở server.
- Chọn ảnh, preview, xóa trước khi chốt, kéo/đổi thứ tự trang, retry upload và progress có lỗi thật. Backend có pageIndex ổn định, validate reorder chứa đúng tập page IDs và không trùng.
- Private storage port với local implementation ngoài frontend/public; config directory hoặc Docker volume. Opaque file ID, không nhận đường dẫn filesystem từ client. Download/stream qua cookie auth: chủ bài và teacher chủ đề; không public URL hoặc static serve originals.
- Hash/version liên kết DB/file; xử lý file tạm, upload lỗi, orphan cleanup có TTL phù hợp. Không xóa file còn được bài đang dùng tham chiếu. Giữ trạng thái qua restart, không chỉ Map trong RAM.
- Xử lý orientation, bỏ EXIF; crop/che họ tên/lớp/thông tin riêng bằng vùng tô đặc được burn vào ảnh derivative thật. CSS overlay/blur trên UI không đủ. Giữ coordinate transform đúng sau xoay/crop/resize.
- Có màn preview derivative và xác nhận. Original nếu cần giữ để xử lý thì private và có retention; provider chỉ nhận derivative đã che, không bao giờ original chưa duyệt.
- Với pipeline MVP, học sinh chuẩn bị/xác nhận ảnh; teacher chủ đề xem và duyệt ảnh trước khi cho chạy OCR. Teacher có thể trả lại yêu cầu che bổ sung. Đây là kiểm tra thủ công có trạng thái thật, không gọi tên một AI PII detector chưa triển khai.
- Mọi sửa ảnh/order/mask tăng draft revision và vô hiệu OCR cũ. Khi xử lý phải freeze đúng revision; output muộn không được áp vào bộ ảnh mới.
- Đọc backend/src/http/origin.guard.ts: hiện tất cả mutation chỉ nhận application/json. Mở multipart cho đúng upload endpoint bằng cơ chế route phù hợp, vẫn kiểm Origin/auth/CSRF; không disable guard toàn hệ thống. FormData không tự set boundary.
- Phân biệt giới hạn JSON body (hiện 64 KB) với upload multipart; validate limits rõ, lỗi 413/415 thân thiện, không mở body size vô hạn.

F. BƯỚC 4: OCR, BÁO LỖI VÀ CHỐT BẢN CHÉP

- Thêm VisionTranscriptionPort, Gemini adapter, OpenAI adapter và fake adapter deterministic. Dùng config nền AI_PROVIDER/AI_MODEL, thêm OCR_MODEL override khi model chung không phù hợp vision.
- Đối chiếu tài liệu chính thức của provider và model cấu hình trước khi gửi image/JSON; không giả định mọi model nhận ảnh. Unsupported capability báo lỗi cấu hình, không fallback ngầm provider/model khác.
- OCR chép nguyên văn tiếng Việt theo thứ tự trang, giữ lỗi viết của học sinh, không tự sửa lập luận/ngữ pháp/chính tả cho đẹp, không dùng rubric/profile để đoán đáp án.
- Provider chỉ nhận derivative đã duyệt + chỉ dẫn OCR. Không gửi tên/login/cookie, chats, hồ sơ văn phong hoặc điểm cũ.
- Trả pages/segments với IDs liên kết được, text và needsReview/reason khi không rõ. Confidence có nguồn nếu thực sự có; thiếu thì null, không dựng phần trăm chính xác.
- Check schema, đủ/đúng trang, không trùng ID, output không cắt, kích thước text và trang không đọc được. Raw OCR bất biến; corrected text/revisions lưu riêng với actor/time/reason/version.
- Học sinh xem ảnh và text cạnh nhau, báo lỗi gắn page/segment/nội dung. Báo lỗi không tự đổi bản chép cuối. Teacher xem, sửa bản chép, xử lý báo lỗi và xác nhận cuối bằng expectedRevision.
- Teacher sửa OCR để khớp chữ trên ảnh, không sửa bài văn cho hay hơn trước khi chấm. Phần không thể đọc phải có luồng yêu cầu ảnh rõ hơn hoặc quyết định review được ghi nhận, không đoán rồi làm như đó là nguyên văn học sinh.
- Chốt teacher CONFIRMED mới tạo một Submission bất biến chứa đúng finalText, contentHash, snapshot và liên kết nguồn ảnh/OCR revision. Học sinh không gọi endpoint nộp text tùy ý để bypass yêu cầu OCR của mode ảnh.
- Không trim/normalize âm thầm finalText. Chọn quy ước ghép trang rõ ràng, lưu đúng chuỗi đó rồi tính tất cả evidence UTF-16 trên nó; không tính offset trên raw OCR cũ.
- Chặn chấm khi chưa confirmed. Đề CLOSED không nhận Submission mới; draft chưa chốt vẫn xem được nhưng cần teacher biết việc đóng đề sẽ dừng nộp mới. Bài đã chốt trước close vẫn được chấm/công bố.
- Khi provider lỗi/thiếu key/output sai: giữ draft/ảnh/báo lỗi, trạng thái FAILED có retry, không tạo bài chép giả hoặc coi OCR là CONFIRMED.
- Không giữ DB transaction trong khi gọi model hoặc chờ người duyệt. Dùng trạng thái/lease/version lưu DB cho lần xử lý; timeout/crash/restart có cách recover/retry, không mắc PROCESSING vĩnh viễn.
- MVP có thể xử lý request đồng bộ với timeout hữu hạn, HTTP budget phù hợp. Không cần Redis/queue; nếu thao tác tách nhiều request, UI phải phản ánh trạng thái bền vững thật.

G. BƯỚC 5: ĐÁNH GIÁ, GIÁO VIÊN DUYỆT VÀ CÔNG BỐ

- Nối application services assessment hiện có thay vì viết grader thứ hai. HTTP actor lấy từ auth, teacher sở hữu đề mới có quyền chấm/review/publish.
- Teacher bấm chấm bài đã confirmed; model chỉ nhận finalText + assignment/rubric snapshot. Tuyệt đối không đưa profile, chat/dàn ý AI, danh tính hoặc điểm bài cũ vào scoring context.
- Output phải đúng tập criterion IDs, mỗi tiêu chí một lần; score bounds/step/total Decimal hợp lệ; evidence quote === text.slice(start,end), offsets UTF-16 [start,end).
- Lưu AI_DRAFT. Lỗi model/schema/evidence giữ Submission, không lưu điểm giả. Retry/concurrent grade không tạo Assessment trùng; không tuyên bố exactly-once billing.
- Teacher UI xem ảnh/bản chép đã confirmed, điểm/comment/evidence AI từng tiêu chí, tổng điểm và lỗi cần sửa. Có bước duyệt rõ, không tự publish khi model trả về.
- Cho phép teacher chỉnh điểm/nhận xét chính thức tối thiểu trước publish, bắt buộc lý do khi khác draft. Giữ original AI output riêng, reviewer/time/revision; không overwrite provenance AI bằng kết quả người sửa.
- Validate cả kết quả final của teacher theo cùng rubric/bounds/steps/evidence. Nếu chưa sửa, final là bản draft đã được teacher xác nhận. Nếu đã publish thì khóa kết quả; không làm regrade/version lịch sử trong MVP.
- Student trước publish chỉ nhận trạng thái pending, tuyệt đối không lộ draft score/comments qua endpoint detail/worklist/progress. Sau PUBLISHED nhận đúng official final result, không nhầm raw AI draft.
- Publish idempotent, giữ publishedAt, retry không chấm lại hoặc tăng điểm. Học sinh nhận breakdown theo rubric, excerpt/evidence thật và feedback chính thức, không chỉ một số tổng.

H. VĂN PHONG VÀ ĐỀ TIẾP THEO

- Nối writing-profile application services hiện có. Nguồn chỉ Assessment PUBLISHED, bài đã confirmed, genre snapshot và official feedback của teacher nếu có chỉnh sửa.
- Publication commit độc lập với profile extraction: profile lỗi không làm mất điểm đã công bố hoặc báo publish thất bại sau khi đã thành công.
- Sau publish, tự kích hoạt extraction theo cơ chế nhỏ có persistent status PENDING/PROCESSING/COMPLETED/FAILED, attempts/error an toàn và lease/retry. Có nút teacher retry khi thất bại và xử lý restart. Có thể là request tiếp nối sau publish + retry backend, không chỉ promise fire-and-forget trong RAM.
- Output [] là COMPLETED/no_observations được ghi nhận bền vững; retry không gọi model lại chỉ vì chưa có observation row.
- Giữ taxonomy, evidence UTF-16, genre/source/status và expectedProfileVersion/CAS đã có. Observation mới PROVISIONAL; không tự kết luận “văn phong ổn định” sau số bài cố định.
- Retry không tạo observations trùng, tăng support count từ cùng assessment hoặc hồi sinh RESOLVED/INVALIDATED. Conflict hai nguồn khác nhau có retry/recompute được kiểm soát, không ghi đè profile mới hơn.
- Student xem profile của mình, điểm mạnh/điểm cần luyện/thói quen diễn đạt với excerpt và link bài nguồn. Phân biệt nhận xét sơ bộ với được teacher xác nhận; không bịa phần trăm hiểu văn phong.
- Teacher chỉ review observation từ bài của đề mình sở hữu, dùng expectedProfileVersion; không mặc nhiên đọc profile tổng hợp có nguồn của teacher khác.
- Socratic trên một đề mới cùng genre đọc profile mới nhất đúng student, chỉ observation phù hợp; một bài ở genre khác không bị áp sang. Profile không quay vào grader.
- Profile là kết quả sau bước 5, không thêm bước thứ sáu bắt buộc cho học sinh.

I. CONTRACT API VÀ UI

- Trước khi nối màn hình, ghi route/DTO/state transition/actor/error mapping ngắn trong docs/development/full-pipeline-contract.md; đối chiếu routes đang có, tránh tạo hai API cho cùng việc.
- Tối thiểu có teacher CRUD/publish/close/worklist; student list/open/read/progress; upload/pages/masks/privacy approval; OCR generate/read/issues/correction/confirmation; grade/draft/review/publish; own profile và source observation review/retry.
- Payload chọn actor/owner/snapshot/status từ server. Validate từng ID liên quan, không chỉ ID root; chống truy cập file, page, OCR revision, assessment, observation của người/đề khác.
- Giữ cookie HttpOnly, CORS đúng APP_ORIGIN với credentials và Origin guard cho mutation. Không dùng loginId/role trong localStorage làm quyền backend, không expose AI key frontend.
- Date ISO, Decimal strings, error envelope hiện có; map input/auth/ownership/conflict/too large/unsupported media/quota/provider/timeout theo HTTP phù hợp.
- UX tiếng Việt, responsive; loading/empty/error/retry/processing/waiting teacher/published riêng, nút chống gửi trùng, validation field rõ và có lối trở lại bước trước khi được phép.
- Refresh/deep link khôi phục từ server. Logout/đổi tài khoản xóa drafts/caches/object URLs cũ; request cũ không được cập nhật màn của user mới.
- API mode không còn UnimplementedPanel hoặc fallback tới mock cho các màn trong pipeline. Mock prototype có thể giữ riêng, không trộn với API state.
- Teacher worklist phải cho thấy ai đang đợi duyệt ảnh/OCR/chấm/công bố; student biết đang đợi teacher ở bước nào.

J. DỮ LIỆU DEMO PHONG PHÚ, KHÔNG PHÁ DB HIỆN CÓ

Thực hiện như một phần của các feature, chốt ở feature cuối. Không chỉ thêm hai users và một bài đã làm xong:

- Có lệnh seed:demo opt-in, dataset namespace/manifest riêng, IDs/codes ổn định, chạy lại idempotent. Chỉ chạy development/test, từ chối production. Không reset DB hoặc tự seed toàn bộ mỗi lần server start.
- Seed additive: giữ users/đề/bài hiện có, không đổi mật khẩu hoặc overwrite dữ liệu demo đã được tôi chỉnh/làm tiếp. Khi manifest/version mới, thêm records mới thay vì hạ trạng thái records cũ.
- Password từ DEV_SEED_PASSWORD hoặc biến seed đã có, hash đúng auth hiện có; không hardcode/log plaintext. Chỉ ghi tài khoản, vai trò, code và kịch bản vào docs/development/demo-data.md.
- Bộ demo riêng tối thiểu 2 giáo viên, 12 học sinh giả định, 8 đề: 5 PUBLISHED, 2 DRAFT, 1 CLOSED. Có NLXH/NLVH, khối 10–12, ít nhất 3 cấu trúc rubric hợp lệ và trường hợp maxScore/scoreStep khác default.
- Ngữ liệu có nội dung đủ để đọc/lập luận, ưu tiên tự viết hoặc public-domain có nguồn; không gán đoạn tự sinh thành trích dẫn thật của tác phẩm. Bài văn có mức mạnh/yếu khác nhau, đoạn hoàn chỉnh và evidence thật, không “Lorem ipsum”.
- Có ít nhất 24 hồ sơ tiến độ phân bố ở các trạng thái: chưa bắt đầu, đã đọc, đang Socratic, đã lưu dàn ý, upload chờ duyệt ảnh, OCR cần sửa, OCR đã chốt, chờ chấm, AI_DRAFT, PUBLISHED, profile pending/failed/completed.
- Chỉ tạo Submission cho trường hợp đã chốt bản chép; các case đang upload/OCR là draft. Với mock seed, model/provenance phải ghi demo-fixture/mock, không giả vờ có kết quả Gemini/OpenAI live.
- Có một học sinh có nhiều bài cùng genre để xem profile, một học sinh mới chưa có profile, observations PROVISIONAL/SUPPORTED/RESOLVED/INVALIDATED và teacher khác để thử ownership. Không đếm retry cùng bài thành nguồn hỗ trợ mới.
- Để ít nhất một đề published và tài khoản học sinh chưa bắt đầu cho tôi chạy mới toàn bộ pipeline bằng UI. Tài liệu nói rõ tài khoản/code dành cho từng kịch bản.
- Có fixtures ảnh thật với 1–4 trang, checksum + expected OCR text, thứ tự trang rõ; fake OCR lấy ground truth đúng fixture/hash, không trả một bài chung cho mọi ảnh. Ảnh lạ ở mock mode phải báo chưa có fixture hoặc cho chọn case mock rõ ràng.
- Có fixture header thông tin cá nhân giả để thử masking. Ảnh tổng hợp chữ in có thể dùng cho kiểm thử kỹ thuật nhưng phải ghi rõ không đánh giá được OCR chữ viết tay. Không yêu cầu tôi cung cấp dữ liệu học sinh thật mới làm được demo.
- Có Unicode tiếng Việt, emoji/ký tự ngoài BMP, chuỗi gần giống nhau để kiểm offset; tiêu chí thiếu evidence và trường hợp không đọc rõ để thử review.
- Invalid AI output, quota, timeout, upload quá giới hạn và stale revision là test scenarios bằng fake/injected transport, không tạo kết quả sai rồi giả gắn trạng thái published vào seed.
- Script seed validate FK, ownership, rubric Decimal, snapshots, hash và tất cả quotes/offsets trước khi persist. Tạo files private theo manifest, không tham chiếu URL mock/public không tồn tại. Seed không gọi AI live.

K. KIỂM THỬ VÀ NGHIỆM THU XUYÊN SUỐT

1. Chạy checks phù hợp mỗi feature: backend Prisma validate/generate, typecheck, unit, test:db, test:dist; frontend typecheck/build và Playwright cho hành vi thay đổi. Kiểm tra scripts/lockfile thật, không chạy next lint lỗi phiên bản rồi bỏ qua như đã lint thành công.
2. Migrations áp được trên DB test mới và upgrade từ schema cũ, bảo toàn dữ liệu. Test DB/private storage/ports/build dirs tách biệt với môi trường tôi đang dùng; không reset DB dev hoặc kill server hiện có.
3. Một browser test chính phải tự tạo đề qua teacher UI, không dùng đề hoàn tất seed thay cho kiểm thử tạo đề:
   - Teacher tạo draft, nhập material/rubric, publish, copy code.
   - Student mở code, đọc/xác nhận, chat và lưu dàn ý; refresh còn dữ liệu.
   - Upload ít nhất hai ảnh fixture thật, đổi thứ tự, che header, xác nhận; teacher duyệt derivative.
   - Chạy OCR bằng fake provider đã khai báo nhưng HTTP/DB/storage thật; student báo lỗi, teacher sửa/chốt bản chép.
   - Grade thành AI_DRAFT; student chưa thấy điểm. Teacher sửa/duyệt rồi publish; student thấy đúng final score, rubric/evidence và status.
   - Extract profile, thấy source evidence đúng. Mở đề mới cùng genre, spy context AI chứng minh Socratic dùng observation mới; grader vẫn không nhận profile.
4. Có test auth hai teacher/hai student cho draft/files/pages/OCR/assessments/profile, cookie expiry/logout, inactive actor, CLOSED assignment, stale revision, mask/order đổi trong lúc OCR và request trả về sau đổi tài khoản.
5. Retry sau server đã commit nhưng response bị mất phải idempotent; test không chỉ abort request trước khi server nhận. Double click/concurrent requests không tạo Submission/Assessment/Observation trùng hoặc tăng version sai.
6. Provider request spy chứng minh chỉ dùng masked derivative đã duyệt. Kiểm tra binary ảnh sau mask, không chỉ assert UI overlay tồn tại. Sai Origin multipart phải bị chặn dù ảnh hợp lệ.
7. Grade không chạy trước OCR confirmed; student không đổi finalText/status/owner để bypass; teacher khác không review/publish. Raw OCR/AI draft giữ được sau teacher correction.
8. Publish thành công dù extraction fail; UI báo điểm published và profile pending/failed riêng. Restart/lease recovery và output [] không khiến extraction lặp vô hạn.
9. Seed chạy hai lần không tăng số hàng, không overwrite bài demo đã thay đổi và vẫn giữ dữ liệu cũ; các files/quotes/offsets hợp lệ.
10. Chạy chế độ live chỉ khi tôi bật flag opt-in rõ và cung cấp key/model. Có script smoke cho OCR + grading/profile tương ứng, không tự dùng key để gọi hàng loạt/seed. Thiếu quyền/key thì hoàn tất mock integration và báo live chưa kiểm chứng.
11. Không gọi fake tests là chứng minh chất lượng Gemini/OpenAI, OCR chữ viết tay hoặc chấm sư phạm. Ghi checklist đánh giá teacher với ảnh được phép sử dụng; báo CER/WER, agreement/latency chỉ nếu đã đo thực tế, không bịa số.

L. TÀI LIỆU VÀ ĐIỀU KIỆN HOÀN THÀNH

- README/backend README/.env.example cập nhật đủ cấu hình provider/model, storage, giới hạn upload, auth, migrate, seed:demo, API mode và lệnh chạy cả frontend/backend. Không hardcode secrets.
- docs/development/full-pipeline-contract.md: routes/DTO/policies/state transitions, snapshot/evidence, status OCR/assessment/profile, xử lý retry/errors.
- docs/development/demo-data.md: manifest tài khoản/mã đề/cases, tài liệu fixtures và cách chạy mới một pipeline.
- docs/development/full-pipeline-handoff.md: các nhánh/commits, migrations mới, checks thực chạy, kết quả và giới hạn live, các phần chủ động ngoài scope.
- Cập nhật roadmap/SRS/ADR phù hợp với phạm vi mới mà không nói các feature đã hoàn thành trước khi kiểm chứng. Không để hướng dẫn mới còn ghi “chỉ text, chưa OCR” như mô tả của pipeline này.
- Có hướng dẫn kiểm thử bằng tay ngắn từ teacher tạo đề đến student xem profile, thao tác bằng UI bình thường; không yêu cầu SQL thủ công hay CLI thay cho bước đang có màn hình.
- Không dừng ở application services/CLI/OpenAPI hoặc UI mock. Kết quả hoàn thành là một người teacher và một người student thực hiện toàn bộ luồng trên giao diện API mode, sau refresh/restart dữ liệu còn và quyền/evidence đúng.
- Nếu phần nào bị chặn bởi hạ tầng/config live, ghi chính xác phần bị chặn và phần đã kiểm chứng; tiếp tục các phần độc lập đến hết nhiệm vụ. Không tuyên bố đã chấm/OCR live khi chỉ dùng fixtures.

Bắt đầu bằng kiểm tra trạng thái hiện tại và ghi các quyết định tối thiểu, rồi triển khai feat/teacher-assignments. Thực hiện tiếp các feature theo thứ tự đến khi đáp ứng toàn bộ nghiệm thu trên.
```
