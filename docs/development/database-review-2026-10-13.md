# Review database Grok — 13/10/2026

Commit được review: `effded9`, nhánh `feat/database`. Kết luận: nền tảng database MVP chạy được; cần sửa các lỗi dưới đây trước khi tích hợp pipeline AI và bàn giao API ghi dữ liệu. Review không sửa implementation hoặc migrations.

## Kết quả kiểm tra thực tế

- PostgreSQL đang chạy healthy; Node.js 24.16.0.
- `prisma:validate`, `prisma:generate`, `typecheck`, `build`: đạt. Module `dist/data-layer.js` import được bằng Node.
- `npm test`: **8/8** unit tests đạt.
- `npm run test:db`: **11/11** integration tests đạt, migration khởi tạo apply được trên database mới.
- Chạy lệnh `prisma:seed` thực tế hai lần trên database review đã làm trống: đạt; vẫn ba tài khoản, cả ba hash đúng Argon2id và xác minh được với mật khẩu seed từ biến môi trường. `db:check`: đạt.
- Các ca bổ sung bên dưới dùng dữ liệu tổng hợp trên database review riêng. Không chạy truncate/test vào database dev đang có.
- Các test hiện tại kiểm tra được FK/unique/CHECK cơ bản, evidence tiếng Việt/emoji, rollback, version cũ, seed chạy lại và chu trình từ đề đến profile. Chưa kiểm tra đầy đủ trạng thái và cập nhật đồng thời.

## 1. P1 — Hai lần tạo profile đầu tiên đồng thời làm một transaction thất bại

Vị trí: [save-observations.ts](../../backend/src/modules/writing-profile/application/save-observations.ts), đoạn đọc khóa profile và nhánh `if (!current)`.

Tái hiện: tạo hai assessment PUBLISHED cho cùng học sinh chưa có profile; chạy hai lần `saveObservationsAndRefreshProfile` đồng thời, mỗi lần cho một assessment. Trong probe, đồng bộ hai transaction ngay sau câu SELECT profile để cả hai thấy chưa có hàng, rồi cho chúng tiếp tục.

Kết quả: một lần thành công, một lần lỗi `P2002`; chỉ một observation được lưu. Khóa theo assessment không bảo vệ hai assessment khác nhau. `FOR UPDATE` trên profile chưa tồn tại không khóa được một hàng profile để tuần tự hóa lần tạo đầu.

Sửa: dùng một khóa chung theo student trước khi thay đổi observations/profile, ví dụ khóa hàng student tồn tại trong cùng transaction; hoặc cơ chế tạo profile và retry an toàn. Thống nhất thứ tự lấy khóa giữa save/refresh. Thêm test hai assessment chạy đồng thời: cả hai kết quả hợp lệ được lưu và summary chứa đủ nguồn.

## 2. P1 — Retry có thể khôi phục observation đã INVALIDATED

Vị trí: [save-observations.ts](../../backend/src/modules/writing-profile/application/save-observations.ts), `upsert.update.status`.

Tái hiện: lưu observation SUPPORTED → chuyển sang INVALIDATED → refresh profile → gửi lại input cũ.

Kết quả: observation trở thành SUPPORTED và được đưa lại vào hồ sơ. Retry của kết quả trích xuất cũ có thể ghi đè quyết định loại bỏ nhận xét.

Sửa: retry cùng dữ liệu không được tự chuyển trạng thái vòng đời. Tách thao tác đổi trạng thái rõ ràng; bảo vệ INVALIDATED/RESOLVED trước input trích xuất cũ. Test retry sau invalidation và sau resolution.

## 3. P2 — Điểm yếu RESOLVED vẫn là nội dung cần luyện

Vị trí: [profile.ts](../../backend/src/modules/writing-profile/domain/profile.ts), `buildProfileSummary`; [query-profile-context.ts](../../backend/src/modules/writing-profile/application/query-profile-context.ts).

Tái hiện: đổi observation WEAKNESS sang RESOLVED rồi refresh profile.

Kết quả: description vẫn nằm trong `summary.practiceNeeds`; query cũng trả observation RESOLVED. Summary chỉ loại INVALIDATED, chưa phân biệt lỗi đã khắc phục. AI dùng summary có thể tiếp tục nhắc học sinh luyện lỗi đã giải quyết.

Sửa: quy định RESOLVED là lịch sử/tiến bộ, loại khỏi nhu cầu luyện hiện tại. Nếu vẫn trả lịch sử cho AI, tách rõ vai trò và trạng thái. Thêm test resolution làm thay đổi summary đúng nghĩa.

## 4. P2 — Database thiếu CHECK giới hạn điểm trên

Vị trí: [migration.sql](../../backend/prisma/migrations/20261012180353_init_mvp/migration.sql), constraints của assessments.

Tái hiện: cập nhật trực tiếp assessment qua Prisma với `totalScore = 99.00`, `maxScore = 10.00`.

Kết quả: DB chấp nhận. `saveAssessment` có validator chặn điểm sai, nhưng DB chỉ kiểm tra điểm không âm và maxScore dương. CRUD hoặc script ghi trực tiếp có thể bỏ qua validator.

Sửa: thêm migration mới với `CHECK (total_score <= max_score)`; kiểm tra dữ liệu cũ trước khi apply. Không sửa migration khởi tạo đã apply. Giữ validation tổng điểm theo từng criterion trong helper vì đó là kiểm tra JSON phức tạp. Thêm test ghi trực tiếp điểm vượt trần phải bị DB từ chối.

## 5. P2 — Làm tròn Decimal tạo rubric tự mâu thuẫn

Vị trí: [decimal.ts](../../backend/src/core/decimal.ts), `decimalString`; [rubric.ts](../../backend/src/modules/assignments/domain/rubric.ts), validate trước khi format.

Tái hiện: hai criterion có weight `0.005`, maxScore `0.01`, scoreStep `0.005`.

Kết quả: createAssignment chấp nhận, nhưng mỗi weight lưu thành `0.01` và scoreStep thành `0.01`. Tổng weight sau lưu là `0.02` trong khi maxScore là `0.01`. Tạo session cho chính đề đó lỗi `RUBRIC_WEIGHT_SUM`.

Sửa: với schema `numeric(8,2)`, từ chối input có phần thập phân không biểu diễn chính xác trong hai chữ số; không âm thầm làm tròn để lưu. Áp dụng cho maxScore, scoreStep, weight và awardedScore; kiểm tra cả giới hạn số chữ số. Thêm test dữ liệu được chấp nhận vẫn hợp lệ sau khi đọc lại từ DB.

## 6. P2 — Chưa thống nhất snapshot xuyên suốt hướng dẫn và nộp bài

Vị trí: [submit-assignment.ts](../../backend/src/modules/assessment/application/submit-assignment.ts), lấy assignment hiện tại thay vì context của session. Test hiện tại giữ riêng từng snapshot nhưng chưa kiểm tra sự thống nhất giữa chúng.

Tái hiện: mở session với criterion `C1` → giáo viên sửa đề thành criterion `NEW` → nộp bài liên kết session cũ.

Kết quả: session hướng dẫn theo `C1`, submission đóng băng `NEW`; bước chấm sau đó dùng `NEW`. Lịch sử mỗi snapshot vẫn nguyên, nhưng học sinh có thể được hướng dẫn và chấm bằng hai rubric khác nhau.

Sửa MVP: chốt một policy nhất quán, ví dụ không sửa nội dung/rubric khi đề đã được sử dụng và tạo đề mới; hoặc nộp qua session dùng context đã đóng băng của session. Đọc context/check trạng thái và ghi submission trong transaction với cách bảo vệ trước sửa đề đồng thời. Thêm test đổi rubric giữa phiên và nộp bài.

## 7. P2 — Đề CLOSED vẫn nhận bài

Vị trí: [submit-assignment.ts](../../backend/src/modules/assessment/application/submit-assignment.ts), chỉ chặn DRAFT.

Tái hiện: chuyển đề sang CLOSED rồi gọi submitAssignment.

Kết quả: nộp bài thành công, kể cả fixture có dueAt trong quá khứ. Chưa có kiểm tra CLOSED/hạn nộp trong helper.

Sửa: chỉ nhận bài khi đề PUBLISHED. Chốt policy deadline riêng: nếu hạn nộp là ràng buộc, kiểm tra dueAt; nếu chỉ là thông tin, ghi rõ. Để backend API dùng cùng helper thay vì kiểm tra rời rạc. Thêm test nộp đề đã đóng bị từ chối.

## Điểm phù hợp với MVP

Đủ chín bảng nghiệp vụ; không mở rộng nhiều trường/lớp, OCR hoặc queue. Quan hệ kép bảo vệ student của submission/assessment/observation. Evidence so khớp đúng chuỗi đã lưu với offset UTF-16. Assessment mặc định AI_DRAFT; profile chỉ lấy nguồn PUBLISHED. Profile có version, summary dẫn xuất và support count theo bài nguồn. Có migration, seed, tài liệu setup và bàn giao; chưa gọi Gemini.

## Bước tiếp theo

Sửa và bổ sung regression tests trên `feat/database`, dùng migration mới nếu thay đổi constraints. Sau khi các ca trên đạt, tích hợp database rồi mở nhánh chức năng tiếp theo. Cộng sự có thể chuẩn bị khung NestJS/auth; phần ghi dữ liệu và pipeline AI nên dựa trên helpers đã sửa.

Chưa kiểm chứng API, phân quyền HTTP, chất lượng chấm Gemini hay khả năng nhận diện văn phong vì các phần đó chưa triển khai.
