# Bàn giao Socratic cho cộng sự backend

Nhánh: `feat/socratic`. Base: `feat/database` (`0f481f0`). Application layer TypeScript ESM, chưa có NestJS HTTP server. Model cố định `gemini-2.5-flash`.

## 1. Import và factory

```ts
import {
  createPrismaHandle,
  createSocraticServices,
  FakeSocraticAi,
  createSocraticAiFromEnv,
  DomainError,
} from "./data-layer.js";

const handle = createPrismaHandle();
const ai = process.env.AI_MODE === "mock" ? new FakeSocraticAi() : createSocraticAiFromEnv();
const socratic = createSocraticServices(handle.prisma, ai);
```

Hoặc gọi từng hàm: `openOrResumeSocraticSession`, `getSocraticSession`, `saveStudentOutline`, `sendSocraticTurn`.

## 2. Actor

Mọi use case nhận `actor: { userId, role: "STUDENT" }` đã được backend xác thực. Không lấy `studentId` từ body làm actor. Helper kiểm tra user tồn tại, `ACTIVE`, `STUDENT` trước khi đọc profile hoặc gọi Gemini. `persistSocraticTurn` khóa user rồi assignment rồi session và kiểm tra lại role/status trước khi commit; tài khoản bị vô hiệu hóa lúc đang gọi model không lưu lượt mới.

| Mã lỗi | Khi nào |
| --- | --- |
| `ACTOR_INVALID` | thiếu userId/role hoặc user không tồn tại |
| `ACTOR_FORBIDDEN` | không phải STUDENT |
| `ACTOR_INACTIVE` | `INACTIVE` |
| `SESSION_OWNERSHIP` | phiên của học sinh khác |
| `SESSION_ASSIGNMENT` | đề không tồn tại hoặc chưa `PUBLISHED` (khi mở phiên) |
| `SESSION_COMPLETED` / `SESSION_CLOSED` / `SESSION_SUBMITTED` | không nhận lượt/outline mới; lịch sử vẫn đọc được |
| `TURN_CONFLICT` | `expectedLastSequence` lệch, hoặc outline đổi lúc đang gọi model |
| `REQUEST_ID_CONFLICT` | cùng `requestId` khác nội dung |
| `OUTLINE_INVALID` / `OUTLINE_VERSION` | dàn ý sai hoặc revision lệch |
| `CONTEXT_TOO_LARGE` | đề/ngữ liệu/rubric vượt ngân sách ký tự |
| `AI_NOT_CONFIGURED` / `MODEL_UNAVAILABLE` / `RATE_LIMITED` / `AI_TIMEOUT` | lỗi provider/key/quota/timeout — không persist |

`dueAt` chỉ là thông tin, không chặn coaching.

## 3. DTO

```ts
type StudentActor = { userId: string; role: "STUDENT" };

openOrResumeSocraticSession({ actor, assignmentId })
getSocraticSession({ actor, sessionId })
saveStudentOutline({ actor, sessionId, outline, expectedOutlineRevision })
sendSocraticTurn(prisma, ai, {
  actor, sessionId, requestId, expectedLastSequence, message
})
```

`outline`: `{ sections: [{ id, title, points: string[] }] }` — ý ngắn học sinh tự nhập. AI không được ghi đè.

Kết quả `sendSocraticTurn` có `userMessage`, `assistantMessage`, `responseMode` (`model` | `fallback` | `replay`), `lastSequence`, `outlineRevision`, `promptVersion`, `model`. `usage`/`latencyMs` chỉ khi provider trả.

`responseMode=fallback` là câu hỏi viết sẵn khi output sai schema/guardrail/bị cắt, hoặc khi học sinh yêu cầu viết hộ rõ ràng (bỏ qua provider). Không phải chất lượng Gemini đạt. Yêu cầu viết hộ được nhận diện trước khi gọi model; output mẫu không nhãn (đoạn nghị luận + mời chép) cũng bị thay bằng fallback. Lời từ chối có cụm “bài mẫu” trong phủ định vẫn hợp lệ.

## 4. Phiên bản context và replay

- Token phiên bản = `lastSequence` + `outlineRevision`.
- Client gửi `expectedLastSequence` khi gọi lượt mới. Sửa outline lúc đang chờ model → `TURN_CONFLICT`, không commit response cũ.
- `requestId` scoped theo session. Replay cùng key + cùng nội dung trả cặp đã commit, không gọi Gemini. Cùng key khác nội dung → `REQUEST_ID_CONFLICT`.
- Persistence báo `created` hoặc `replayed`. Use case trả `responseMode=replay` khi commit đã có cặp; không gắn usage/latency của generation khác.
- ID USER/ASSISTANT ổn định theo `(sessionId, requestId, role)` (UUID v5). Cột `chat_messages.request_id` nullable để tương thích seed.
- Hai lượt khác `requestId` cùng `expectedLastSequence`: một commit, một `TURN_CONFLICT`. Hai request trùng key không tạo hai cặp. Provider vẫn có thể bị gọi hai lần; không exactly-once về chi phí.

Gọi Gemini ngoài transaction. Transaction persist khóa user rồi assignment rồi session. Rubric trong payload gồm descriptor, requiredElements và cấu hình điểm của snapshot phiên.

## 5. Endpoint đề xuất (chưa triển khai)

Các route dưới đây là gợi ý cho NestJS; **chưa có HTTP API**.

- `POST /assignments/:assignmentId/socratic-sessions` → `openOrResumeSocraticSession`
- `GET /socratic-sessions/:sessionId` → `getSocraticSession`
- `PUT /socratic-sessions/:sessionId/outline` → `saveStudentOutline`
- `POST /socratic-sessions/:sessionId/turns` body `{ requestId, expectedLastSequence, message }` → `sendSocraticTurn`

Map `DomainError.code` sang HTTP: 401/403 actor, 404 session, 409 conflict/version, 413 context, 429/503 AI.

## 6. Demo

```bash
cd backend
# AI_MODE=mock trong .env
npm run socratic:demo -- open --login bui.hamy --code VAN12-NLXH-SOC
npm run socratic:demo -- turn --login bui.hamy --session <id> --message "Em chưa biết mở bài."
npm run socratic:demo -- show --login bui.hamy --session <id>
npm run socratic:demo -- outline --login bui.hamy --session <id> --expected-revision 1 --json '{"sections":[{"id":"open","title":"Mở bài","points":["Đặt vấn đề"]}]}'
```

`VAN12-NLXH-SOC` là đề seed chưa COMPLETED/nộp bài. Không dùng phiên `VAN12-NLXH-01` của Bùi Hà My (đã nộp). Resume: chạy lại `open` trên process khác.

Live smoke opt-in; script nạp `backend/.env` (cwd) trước khi đọc `SOCRATIC_LIVE` và `GEMINI_API_KEY`. Payload dùng context builder và rubric có descriptor/requiredElements.

```bash
cd backend
SOCRATIC_LIVE=1 npm run socratic:live-smoke
```

Thiếu key/quyền: báo chưa chạy/không đạt, giữ `gemini-2.5-flash`. Không kết luận chất lượng model chỉ từ test phần mềm.

## 7. Việc để sau

HTTP/auth học sinh và giao diện Socratic: [socratic-integration.md](socratic-integration.md). Chưa có teacher CRUD, chấm điểm, trích xuất observation, OCR, queue, embeddings, FSM bốn bước, streaming token ra client.
