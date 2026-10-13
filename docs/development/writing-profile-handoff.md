# Bàn giao Writing profile cho cộng sự backend

Nhánh: `feat/writing-profile`. Base: `feat/assessment` (assessment còn working tree chưa commit). Application layer TypeScript ESM + CLI. **Chưa triển khai HTTP/UI hồ sơ văn phong.** Model cố định `gemini-2.5-flash`. Profile không đưa vào scoring context.

## 1. Import và factory

```ts
import {
  createPrismaHandle,
  createWritingProfileServices,
  FakeWritingObservationAi,
  createWritingObservationAiFromEnv,
  DomainError,
} from "./data-layer.js";

const handle = createPrismaHandle();
const ai = process.env.AI_MODE === "mock" ? new FakeWritingObservationAi() : createWritingObservationAiFromEnv();
const writingProfile = createWritingProfileServices(handle.prisma, ai);
```

Hoặc gọi từng hàm: `extractPublishedObservations`, `getOwnWritingProfile`, `reviewObservationStatus`. Helper persistence (`saveObservationsAndRefreshProfile`, `setObservationStatus`, `getProfileContextForSession`) vẫn dùng nội bộ; HTTP không nhận `studentId` tùy ý từ client.

## 2. Actor và ownership

Mọi use case nhận `actor: { userId, role: "STUDENT" | "TEACHER" }` đã được backend xác thực. CLI tra `loginId` seed trong DB rồi truyền actor; không coi `loginId` trên HTTP là auth.

| Mã lỗi | Khi nào |
| --- | --- |
| `ACTOR_INVALID` | thiếu userId/role hoặc user không tồn tại |
| `ACTOR_FORBIDDEN` | sai role (học sinh extract/review, giáo viên đọc profile tổng hợp) |
| `ACTOR_INACTIVE` | `INACTIVE` lúc gọi hoặc lúc persist |
| `ASSESSMENT_MISSING` | không thấy assessment |
| `ASSESSMENT_OWNERSHIP` | giáo viên không sở hữu đề nguồn |
| `OBSERVATION_STATUS` | nguồn không `PUBLISHED`, hoặc chuyển status không hợp lệ |
| `OBSERVATION_MISSING` | không thấy observation thuộc đề của giáo viên |
| `OBSERVATION_DUPLICATE` | trùng `featureKey` trong một batch model |
| `OBSERVATION_TRAIT` / `OBSERVATION_KIND` / `OBSERVATION_GENRE` | ngoài taxonomy |
| `EVIDENCE_OFFSET` / `EVIDENCE_QUOTE_MISMATCH` | quote không khớp UTF-16 `[start,end)` trên `Submission.text` |
| `VERSION_CONFLICT` | `expectedProfileVersion` không khớp; profile đã xuất hiện khi expected là 0 |
| `AI_NOT_CONFIGURED` / `MODEL_UNAVAILABLE` / `RATE_LIMITED` / `AI_TIMEOUT` / `AI_INVALID_OUTPUT` | provider/key/quota/output — không persist observation |

Extraction/review: chỉ `TEACHER` `ACTIVE` sở hữu đề của assessment nguồn. Học sinh chỉ `getOwnWritingProfile`. `studentId`/genre suy ra từ DB, không nhận từ client.

## 3. Taxonomy và DTO

Phiên bản: `writing-traits.v1`. Prompt: `writing-profile-system.v1`. Schema: `writing-profile-output.v1`.

TraitId: `SENTENCE_STRUCTURE`, `TRANSITIONS`, `ARGUMENT_ORGANIZATION`, `EVIDENCE_LINKING`, `WORD_CHOICE`, `SENTENCE_RHYTHM`, `PARAGRAPH_UNITY`, `COHESION`. Kind theo trait (STYLE không dùng cho TRANSITIONS, ARGUMENT_ORGANIZATION, EVIDENCE_LINKING, PARAGRAPH_UNITY).

`featureKey` = `${genre}|${kind}|${traitId}` với `genre` nguyên bản từ assignment snapshot. Không normalize thể loại.

```ts
extractPublishedObservations(actor, { assessmentId })
getOwnWritingProfile(actor)
reviewObservationStatus(actor, { observationId, status, expectedProfileVersion })
```

`extractPublishedObservations` trả `{ outcome: "extracted" | "replayed" | "no_observations", assessmentId, studentId, observations, profileVersion }`.

- Chỉ nguồn `Assessment.status=PUBLISHED`. `AI_DRAFT`, chat, dàn ý, bài học sinh khác không phải nguồn.
- 0–6 observations/bài. `[]` hợp lệ → `outcome: "no_observations"`, không gọi helper nonempty, không xóa observation cũ, không tạo placeholder.
- Observation mới luôn `PROVISIONAL`. Model không được trả status/genre/studentId/featureKey.
- Evidence nonempty, UTF-16 `[start,end)`, `text.slice(start,end)===quote` trên đúng chuỗi đã lưu.
- Student view: description, kind, status, provenance, excerpt thật. Không trả điểm draft hay dữ liệu người khác.
- Giáo viên không mặc nhiên đọc profile tổng hợp từ đề giáo viên khác.

## 4. Replay, version, empty

- Nếu assessment đã có observations (kể cả terminal) → `replayed`, không gọi AI, không đổi evidence/`observedAt`/goals/version.
- Capture `expectedProfileVersion` trước gọi model (`0` nghĩa là profile chưa được phép tồn tại). Conflict không ghi đè.
- Retry cùng assessment không tăng số observation hay support count, không hạ `SUPPORTED` về `PROVISIONAL`, không hồi sinh `RESOLVED`/`INVALIDATED`.
- Concurrent cùng assessment: một batch; request kia nhận winner trong lock.
- Chưa có bảng extraction run: lần gọi lại khi output `[]` có thể gọi provider lại. Không exactly-once phía model.
- Review: `PROVISIONAL` → `SUPPORTED` | `INVALIDATED` | `RESOLVED`; `SUPPORTED` → `INVALIDATED` | `RESOLVED`. Terminal không tự reopen. Không resolve chỉ vì bài mới không nhắc lỗi.
- `RESOLVED` vào `summary.resolvedItems`, không còn `practiceNeeds`. `INVALIDATED` không vào Socratic context.
- Summary do code suy ra từ observations hợp lệ của nguồn PUBLISHED; không ghi thẳng output model vào `WritingProfile.summary`.
- Provenance nằm trên observation (quote, offsets, assessmentId). Không có cột run/model usage; không giả vờ đã lưu.

## 5. Socratic và chấm điểm

Mỗi lượt Socratic nạp profile mới nhất của đúng student, chọn observation `PROVISIONAL`/`SUPPORTED` **đúng genre snapshot**. `PROVISIONAL` đánh dấu thận trọng. Profile null: hỏi theo đề, không dựng yếu điểm từ gradeLevel.

Payload chấm (`assessSubmission`) không chứa profile, observations, goals. Thay đổi hồ sơ không đổi scoring payload.

## 6. Endpoint đề xuất (chưa triển khai)

Feature này **không** tạo NestJS controller. Cộng sự nối theo convention cookie/CSRF/`SessionAuthGuard` hiện có; không nhận `role` hay arbitrary `studentId` trong body.

- `GET  /api/me/writing-profile` (STUDENT, actor-derived) → `getOwnWritingProfile`
- `POST /api/assessments/:assessmentId/writing-observations` (TEACHER chủ đề) → `extractPublishedObservations`
- `PATCH /api/writing-observations/:observationId/status` (TEACHER chủ nguồn) → `reviewObservationStatus`

Map lỗi gợi ý: input 400, auth 401/403, ownership 404, conflict 409, quota 429, provider 503/504. Bổ sung `mapDomainError` khi nối HTTP. Không trả phần trăm 'hiểu văn phong'.

## 7. Demo

```bash
cd backend
# AI_MODE=mock trong .env
npm run assessment:demo -- submit --login bui.hamy --code VAN12-NLXH-SOC --file scripts/fixtures/assessment-demo-essay.txt
npm run assessment:demo -- grade --login dang.loan --submission <id>
npm run assessment:demo -- publish --login dang.loan --assessment <id>
npm run writing-profile:demo -- extract --login dang.loan --assessment <id>
npm run writing-profile:demo -- show --login bui.hamy
npm run writing-profile:demo -- review-status --login dang.loan --observation <id> --status INVALIDATED --expected-version <n>
npm run writing-profile:demo -- prepare-open-assignment --login dang.loan --code VAN12-NLXH-WP-DEMO
npm run socratic:demo -- open --login bui.hamy --code VAN12-NLXH-WP-DEMO
npm run socratic:demo -- turn --login bui.hamy --session <id> --message "Em chưa biết mở bài." --request-id <uuid>
```

`VAN12-NLXH-SOC` là đề seed chưa nộp — dùng làm nguồn extract sau submit/grade/publish. Không dùng bài seed `VAN12-NLXH-01` (đã có observation). Phiên bài đã nộp không nhận chat mới; đề mở `VAN12-NLXH-WP-DEMO` cùng genre dùng cho lượt Socratic sau extract. Không reset DB.

```bash
cd backend
WRITING_PROFILE_LIVE=1 npm run writing-profile:live-smoke
```

Script nạp `.env` cwd trước khi đọc `WRITING_PROFILE_LIVE` và `GEMINI_API_KEY`. Bài giả lập, không ghi DB, không publish. Thiếu key/quyền: báo chưa kiểm chứng, giữ `gemini-2.5-flash`. Fake tests và một live smoke không phải nghiệm thu chất lượng nhận xét; đối chiếu giáo viên dùng `evaluations/writing-profile/`.

## 8. Việc để sau

HTTP/UI quản lý hồ sơ do cộng sự nối. Không tuyên bố toàn bộ sản phẩm hoàn thành chỉ vì pipeline CLI/tests chạy.
