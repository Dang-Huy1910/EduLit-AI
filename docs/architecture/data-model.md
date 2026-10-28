# Mô hình dữ liệu EduLit-AI

Rà lại **2026-10-28** theo model SQLAlchemy trong `backend/app/db/models/` và Alembic `0001`–`0019`. Đây là mô tả schema Python hiện có; các ý tưởng chưa có bảng thực thi được ghi riêng ở cuối. Không khẳng định migration đã chạy trên database cụ thể trong đợt rà tài liệu này.

## 1. Quy ước hiện tại

- Khóa nội bộ UUID, timestamp có timezone. Mã đề dùng tra cứu; quyền nằm ở owner/membership và `assignment_access`.
- Các snapshot/payload có cấu trúc dùng JSONB. Điểm, thang điểm và bước điểm trong rubric/assessment dùng `NUMERIC(8,2)`; validator nghiệp vụ kiểm tra tổng và giới hạn.
- Bytes gốc của tài liệu và ảnh nằm trong bảng blob PostgreSQL riêng, không phải tài nguyên frontend public.
- Phiên bản đề, bản chép và kết quả đã công bố có con trỏ/lịch sử riêng; không dùng `updated_at` thay toàn bộ lịch sử.

## 2. Bảng/model đang có

| Nhóm | Model / bảng | Quan hệ và nội dung |
| --- | --- | --- |
| Identity | `User`, `AuthSession`, `AuthToken`, `RateLimitBucket` | User có login/email duy nhất, role/status, password hash, email verification timestamp; session/token lưu hash và hạn dùng |
| Học kỳ/lớp | `Term`, `Classroom`, `ClassMembership` | Lớp thuộc kỳ học và giáo viên sở hữu; mã tham gia, trạng thái tham gia, membership theo user |
| Catalog | `Topic`, `Material`, `MaterialVersion`, `MaterialChunk` | Ngữ liệu thuộc giáo viên/chuyên đề; phiên bản nội dung và chunks có thứ tự |
| Đề nguồn | `SourcePrompt`, `SourcePromptMaterial` | Yêu cầu viết đầy đủ/tóm tắt/hướng dẫn, liên kết các ngữ liệu |
| Barem | `Rubric`, `RubricVersion` | Phiên bản tiêu chí JSONB, max score, score step, status |
| Import | `TeacherDocument`, `TeacherDocumentBlob` | File gốc, Markdown chuyển đổi/giáo viên sửa, hash phân tích, draft, danh sách mục được confirm |
| Giao bài | `Assignment`, `AssignmentRevision`, `AssignmentAccess` | Draft bài tập, người nhận, hạn nộp; published revision giữ instructions/rubric/context/snapshot; quyền theo revision + học sinh |
| Chuẩn bị dàn ý | `StudentOutlinePrep` | Job theo revision + học sinh, outline, trạng thái, lease/token và số lần thử |
| Socratic | `SocraticSession`, `ChatMessage`, `OutlineRevision`, `IdempotencyRecord` | FSM, reservation, logical turn, lịch sử chat, outline version và phản hồi replay |
| Bài nộp | `Submission`, `SubmissionAttempt` | Một submission theo revision + học sinh; nhiều attempt; con trỏ attempt/job/result/published result hiện hành |
| Trang/OCR | `SubmissionPage`, `SubmissionPageBlob`, `OcrResult`, `TranscriptionRevision` | Thứ tự/hash ảnh, bytes ORIGINAL/PROCESSED; output OCR và bản chép có revision; segments lưu trong JSONB |
| Chấm | `AssessmentJob`, `AssessmentResult` | Job gắn attempt + transcription; kết quả giữ AI/teacher/published payload, version, điểm, actor/thời gian công bố |
| Phân tích lớp | `ClassInsight` | Scope/mode/filter fingerprint, hash số liệu đầu vào, trạng thái/lease, payload gợi ý |
| Hồ sơ viết | `WritingProfile`, `WritingProfileVersion` | Cache theo học sinh/source hash; payload, analyzed sources; lịch sử version/summary/traits/evidence counts |

Vị trí: identity có file model riêng; catalog trong `catalog.py`; đề revision/chat/outline trong `socratic.py`; submission/OCR trong `submission.py`; chấm/insight trong `assessment.py`; profile trong `writing_profile.py`.

## 3. Quan hệ chính

```mermaid
erDiagram
    User ||--o{ Classroom : owns
    Term ||--o{ Classroom : groups
    Classroom ||--o{ ClassMembership : contains
    User ||--o{ ClassMembership : joins
    SourcePrompt ||--o{ Assignment : supplies
    Assignment ||--o{ AssignmentRevision : freezes
    AssignmentRevision ||--o{ AssignmentAccess : grants
    User ||--o{ AssignmentAccess : receives
    AssignmentRevision ||--o{ SocraticSession : guides
    SocraticSession ||--o{ ChatMessage : stores
    SocraticSession ||--o{ OutlineRevision : versions
    AssignmentRevision ||--o{ Submission : collects
    User ||--o{ Submission : writes
    Submission ||--o{ SubmissionAttempt : attempts
    SubmissionAttempt ||--o{ SubmissionPage : contains
    SubmissionPage ||--o{ SubmissionPageBlob : stores
    SubmissionAttempt ||--o{ TranscriptionRevision : transcribes
    TranscriptionRevision ||--o{ AssessmentJob : grades
    AssessmentJob ||--o{ AssessmentResult : produces
    User ||--o| WritingProfile : has
    User ||--o{ WritingProfileVersion : tracks
```

## 4. Constraint và kiểm tra phiên bản

Những unique constraint đã có trong model gồm:

- `users.login_id`, `users.email`; `terms.code`; classroom `(term_id, subject, code)`; membership `(classroom_id, user_id)`.
- Material version `(material_id, version)`, chunk `(material_version_id, chunk_id)`, rubric version `(rubric_id, version)`; assignment code duy nhất.
- Assignment access `(assignment_revision_id, student_id)`; submission cũng theo revision + student, không có `school_id` trong schema hiện tại.
- Attempt `(submission_id, attempt_number)`, page `(attempt_id, page_index)`, transcription `(attempt_id, revision)`.
- Outline `(session_id, revision)`, chat `(session_id, turn_id, role)`; idempotency key có scope user/route.
- Profile history `(student_id, version)`; insight `(teacher_id, scope_key, mode)`.

Quy tắc bounds/điểm, quyền truy cập, input revision và lease còn được kiểm tra trong service, không phải tất cả đều là constraint SQL. Sửa outline dùng `expectedVersion`; sửa/xác nhận bản chép kiểm tra revision; lưu/công bố/ẩn kết quả dùng `resultId` + `transcriptionRevisionId` + `expectedVersion`.

## 5. Lifecycle thực thi

| Dữ liệu | Trạng thái/ý nghĩa |
| --- | --- |
| TeacherDocument | `UPLOADED`, `CONVERTING`, `CONVERTED`, `ANALYZING`, `REVIEW`, `CONFIRMED`; lỗi `FAILED`, PDF không có chữ `NEEDS_OCR` |
| MaterialVersion | Cột `VARCHAR(16)`, mặc định `READY`; không dùng PostgreSQL enum riêng. Revision `0019` bỏ enum không còn được cột dùng |
| RubricVersion | Cột chuỗi, mặc định `APPROVED`; catalog validate và lưu version, không có endpoint approve riêng |
| AssignmentRevision | `DRAFT`, `PUBLISHED`, `CLOSED`; giao bài tạo snapshot và grants |
| Outline prep | `QUEUED`, `PROCESSING`, `READY`, `FAILED`, `NEEDS_CLARIFICATION` |
| Socratic session | FSM `INIT → THESIS → OUTLINE → REVIEW`; outline `DRAFT`, `ACCEPTED`, `SUPERSEDED` |
| SubmissionAttempt | `DRAFT → QUEUED → OCR_PROCESSING → OCR_REVIEW → READY_TO_GRADE`; lỗi OCR `FAILED` |
| TranscriptionRevision | `DRAFT → CONFIRMED`; mở lại tạo revision mới, bản cũ `SUPERSEDED` |
| AssessmentJob / ClassInsight | `QUEUED → PROCESSING → READY/FAILED`, có lease và số lần thử |
| AssessmentResult | Tách `ai_payload`, `teacher_payload`, `published_payload`; `is_published`, version, lịch sử và con trỏ công bố |

Học sinh đối chiếu/sửa/xác nhận OCR. `submitted_at` là lúc gửi ảnh; `official_submitted_at` là nộp chính thức khi xác nhận. Xác nhận xếp job chấm theo đúng attempt và bản chép. Không có bảng yêu cầu giáo viên sửa OCR. Phiên bản từng công bố cần giáo viên cấp quyền trước khi học sinh mở lại; ẩn điểm không tự cấp quyền.

Worker chấm chỉ cập nhật kết quả hiện hành khi job còn khớp các con trỏ attempt/bản chép/job. Báo cáo `official` dùng `current_published_result_id`; báo cáo `provisional` lấy bản nộp chính thức hiện hành và overlay giáo viên. Học sinh không nhận điểm draft.

## 6. Profile, bằng chứng và phần còn thiết kế

Profile tổng hợp từ bài đã công bố và bản chép tương ứng; source hash giúp xác định cache cũ khi nguồn đổi. Payload chứa observations/evidence, còn bảng history lưu snapshot gọn theo version. Không có bảng độc lập `WritingObservation`, `StudentDeclaredGoal` hay `WritingProfileSnapshot`; không coi số bài là xác suất tin cậy đã hiệu chuẩn.

Các entity trong thiết kế ban đầu như `School`, `FileAsset`, `AiRun`, `UsageReservation`, `OutboxEvent`, `AuditEvent` chưa có model/bảng thực thi. Schema multi-school, storage ngoài DB, usage ledger, audit chung và retention toàn hệ thống cần thiết kế/migration bổ sung nếu triển khai. Không mô tả chúng như constraint đang bảo vệ dữ liệu.

Chi tiết API ở [API design](../api/api-design.md), pipeline ở [AI pipeline](gemini-pipeline.md), phần kiểm chứng còn lại ở [roadmap](../development/implementation-roadmap.md).
