# Bàn giao Assessment cho cộng sự backend

Nhánh: `feat/assessment`. Base: `feat/socratic-integration`. Application layer TypeScript ESM + CLI. **Chưa triển khai HTTP/UI nộp bài, chấm, công bố.** Model cố định `gemini-2.5-flash`. Profile/chat/identity không nằm trong scoring context.

## 1. Import và factory

```ts
import {
  createPrismaHandle,
  createAssessmentServices,
  FakeAssessmentAi,
  createAssessmentAiFromEnv,
  DomainError,
} from "./data-layer.js";

const handle = createPrismaHandle();
const ai = process.env.AI_MODE === "mock" ? new FakeAssessmentAi() : createAssessmentAiFromEnv();
const assessment = createAssessmentServices(handle.prisma, ai);
```

Hoặc gọi từng hàm: `submitStudentText`, `assessSubmission`, `getSubmission`, `getAssessment`, `publishReviewedAssessment`. Helper persistence cũ (`submitAssignment`, `saveAssessment`, `publishAssessment`) vẫn dùng cho seed/tests; HTTP không expose chúng với `studentId`/`status` từ client.

## 2. Actor

Mọi use case nhận `actor: { userId, role: "STUDENT" | "TEACHER" }` đã được backend xác thực. CLI tra `loginId` seed trong DB rồi truyền actor; không coi `loginId` trên HTTP là auth.

| Mã lỗi | Khi nào |
| --- | --- |
| `ACTOR_INVALID` | thiếu userId/role hoặc user không tồn tại |
| `ACTOR_FORBIDDEN` | sai role (học sinh chấm, giáo viên nộp) |
| `ACTOR_INACTIVE` | `INACTIVE` lúc gọi hoặc lúc persist |
| `SUBMISSION_TEXT` | rỗng / chỉ khoảng trắng |
| `SUBMISSION_TOO_LARGE` | vượt 20_000 UTF-16 code units |
| `SUBMISSION_ASSIGNMENT` | đề không tồn tại hoặc không `PUBLISHED` (nộp mới) |
| `SUBMISSION_SESSION` | session không khớp student/assignment |
| `SUBMISSION_CONFLICT` | đã có bài khác text hoặc khác liên kết session |
| `SUBMISSION_NOT_FOUND` | không thấy hoặc không thuộc quyền (không lộ bài khác chủ) |
| `ASSESSMENT_OWNERSHIP` | giáo viên không sở hữu đề |
| `ASSESSMENT_MISSING` | không thấy hoặc không thuộc quyền |
| `ASSESSMENT_UNIQUE` | helper thô khi đã có assessment; use case trả bản đã lưu |
| `EVALUATION_*` / `EVIDENCE_*` / `SNAPSHOT_MISMATCH` | điểm, tiêu chí, quote không hợp lệ |
| `AI_NOT_CONFIGURED` / `MODEL_UNAVAILABLE` / `RATE_LIMITED` / `AI_TIMEOUT` / `AI_INVALID_OUTPUT` | provider/key/quota/output — không persist assessment |

`dueAt` chỉ thông tin, không chặn nộp. Đề `CLOSED` không nhận nộp mới; giáo viên vẫn chấm bài đã nộp trước đó.

## 3. DTO

```ts
type AssessmentActor = { userId: string; role: "STUDENT" | "TEACHER" };

submitStudentText(actor, { assignmentId, socraticSessionId?, text })
assessSubmission(actor, { submissionId })
getSubmission(actor, { submissionId })
getAssessment(actor, { assessmentId })
publishReviewedAssessment(actor, { assessmentId })
```

- Nộp: lưu đúng chuỗi học sinh gửi (không trim/normalize). Cùng text + cùng session → replay. Khác text/session → `SUBMISSION_CONFLICT`.
- Chấm: luôn lưu `AI_DRAFT`. Không nhận status từ client/model. Đã có draft/published → trả bản đã lưu, không gọi Gemini.
- Học sinh: trước công bố DTO assessment `{ status: "PENDING" }` — không trả điểm/comment draft. Sau `PUBLISHED` mới có điểm.
- Giáo viên chủ đề: thấy draft. Giáo viên khác: `ASSESSMENT_OWNERSHIP` / not found.
- Publish: hành động xác nhận của giáo viên chủ đề. Retry không đổi `publishedAt`.

Điểm là Decimal string (`"7.50"`). Ngày ISO-8601. Evidence `{ quote, start, end }` UTF-16 `[start, end)` trên đúng `Submission.text`.

`assessSubmission` trả thêm `scoringInput` (để test cách ly profile), `usage`/`latencyMs` khi provider có và không phải replay. Không có cột DB cho usage.

## 4. Replay, khóa và Gemini

- Gọi Gemini ngoài transaction. Persist khóa student → assignment → teacher, kiểm tra lại ACTIVE/ownership/`contentHash`.
- Concurrent grade: một dòng assessment; request kia đọc winner, không trả raw `P2002`.
- Output sai schema/điểm/quote/safety/cắt: không có Assessment; Submission giữ để thử lại. Không fallback điểm 0.
- `AI_MODE=mock` dùng `FakeAssessmentAi`. `live` luôn `gemini-2.5-flash`. Không tự chuyển live→fake, không đổi model.
- Scoring payload chỉ `Submission.text` + snapshot (rubric, maxScore, scoreStep, instructions, genre, gradeLevel, learningMaterialText). Không profile, chat, dàn ý, tên/login, điểm cũ.

Exactly-once hàng DB không đảm bảo chỉ một lần gọi provider.

## 5. Endpoint đề xuất (chưa triển khai)

Feature này **không** tạo NestJS controller. Cộng sự nối theo convention cookie/CSRF/`SessionAuthGuard` hiện có; không nhận `role` trong body.

- `POST /api/assignments/:assignmentId/submissions` (STUDENT) → `submitStudentText`
- `GET /api/submissions/:submissionId` (chủ bài hoặc giáo viên chủ đề) → `getSubmission`
- `POST /api/submissions/:submissionId/assessment` (TEACHER chủ đề) → `assessSubmission`
- `GET /api/assessments/:assessmentId` (giáo viên chủ đề; học sinh nếu `PUBLISHED`) → `getAssessment`
- `POST /api/assessments/:assessmentId/publish` (TEACHER chủ đề) → `publishReviewedAssessment`

Map lỗi gợi ý: input 400, auth 401/403, ownership 404, duplicate/conflict 409, quá lớn 413, quota 429, provider 503/504. Bổ sung `mapDomainError` khi nối HTTP.

## 6. Demo

```bash
cd backend
# AI_MODE=mock trong .env
npm run assessment:demo -- submit --login bui.hamy --code VAN12-NLXH-SOC --file scripts/fixtures/assessment-demo-essay.txt
npm run assessment:demo -- grade --login dang.loan --submission <id>
npm run assessment:demo -- show --login dang.loan --submission <id>
npm run assessment:demo -- show --login bui.hamy --submission <id>
npm run assessment:demo -- publish --login dang.loan --assessment <id>
```

`VAN12-NLXH-SOC` là đề seed chưa nộp. Không dùng bài seed `VAN12-NLXH-01` / `VAN12-NLVH-02`. Không reset DB. Publish không chạy tự động sau grade. Kết quả mock ghi `mock: true` trên CLI.

```bash
cd backend
ASSESSMENT_LIVE=1 npm run assessment:live-smoke
```

Script nạp `.env` cwd trước khi đọc `ASSESSMENT_LIVE` và `GEMINI_API_KEY`. Bài giả lập, không publish. Thiếu key/quyền: báo chưa kiểm chứng, giữ `gemini-2.5-flash`. Fake tests và một live smoke không phải nghiệm thu chất lượng chấm; đối chiếu giáo viên dùng `evaluations/grading/`.

## 7. Việc để sau

HTTP/UI nộp–chấm–công bố do cộng sự nối. Trích xuất văn phong: [writing-profile-handoff.md](writing-profile-handoff.md), chỉ lấy nguồn `PUBLISHED`.
