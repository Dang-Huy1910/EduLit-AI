# Bàn giao database cho cộng sự backend

Nhánh: `feat/database`. Base: `docs/architecture`. Schema Prisma 7.10.0, PostgreSQL 17. Chưa có HTTP, NestJS app, auth endpoint hay gọi Gemini.

## 1. Enum và import Prisma

Client sinh ra tại `backend/src/generated/prisma` (gitignored; `npm install` / `npm run prisma:generate`).

```ts
import {
  PrismaClient,
  Prisma,
  UserRole,
  UserStatus,
  AssignmentStatus,
  SocraticSessionStatus,
  ChatMessageRole,
  AssessmentStatus,
  ObservationKind,
  ObservationStatus,
} from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
```

Hoặc dùng barrel:

```ts
import {
  PRISMA,
  createDatabaseProviders,
  createPrismaHandle,
  createAssignment,
  startSocraticSession,
  appendChatMessage,
  submitAssignment,
  saveAssessment,
  publishAssessment,
  saveObservationsAndRefreshProfile,
  getProfileContextForSession,
} from "./data-layer.js";
```

`PRISMA` / `createDatabaseProviders()` là provider hình NestJS, chưa phải ứng dụng Nest.

## 2. Role / status

| Enum | Giá trị |
| --- | --- |
| UserRole | TEACHER, STUDENT |
| UserStatus | ACTIVE, INACTIVE |
| AssignmentStatus | DRAFT, PUBLISHED, CLOSED |
| SocraticSessionStatus | ACTIVE, COMPLETED |
| ChatMessageRole | USER, ASSISTANT |
| AssessmentStatus | AI_DRAFT, PUBLISHED |
| ObservationKind | STRENGTH, WEAKNESS, STYLE |
| ObservationStatus | PROVISIONAL, SUPPORTED, RESOLVED, INVALIDATED |

AI_DRAFT chưa phải điểm chính thức. Publish MVP = đổi status + `publishedAt`.

## 3. Ví dụ create / query

```ts
const handle = createPrismaHandle(); // đọc DATABASE_URL
const assignment = await createAssignment(handle.prisma, {
  teacherId,
  code: "VAN12-NLXH-01",
  title: "Kiên định",
  instructions: "...",
  genre: "NLXH",
  gradeLevel: 12,
  learningMaterialText: "...",
  rubric: {
    criteria: [
      { criterionId: "C1", name: "Bố cục", weight: "4.00" },
      { criterionId: "C2", name: "Luận điểm", weight: "6.00" },
    ],
  },
  maxScore: "10.00",
  scoreStep: "0.25",
  status: "PUBLISHED",
});

const submission = await submitAssignment(handle.prisma, {
  studentId,
  assignmentId: assignment.id,
  text: "Bài viết...",
});
```

`submitAssignment` tự đóng băng snapshot từ hàng assignment phía server.

## 4. Transaction

`saveObservationsAndRefreshProfile` và `appendChatMessage` chạy trong transaction. Profile dùng `SELECT … FOR UPDATE` + `version`. Truyền `expectedProfileVersion` khi cập nhật đồng thời.

Không xóa cascade user/assignment. Vô hiệu hóa user: `status = INACTIVE`; thu hồi session: `revokedAt`.

## 5. Ownership

- Đề thuộc `teacherId`.
- Session/submission/profile thuộc student.
- Nếu có `socraticSessionId`, session phải cùng student và assignment (helper + FK kép).
- Observation `studentId` phải là tác giả submission của assessment (FK kép + helper).
- Query `getProfileContextForSession(studentId)` không trả observation học sinh khác, không trả INVALIDATED.

## 6. Scripts (cwd `backend/`)

```bash
cp .env.example .env   # điền password local
npm install
npm run db:up
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
npm run db:check
npm run typecheck
npm test
npm run test:db
```

`test:db` đòi `DATABASE_URL_TEST` (tên DB chứa `_test`), không fallback sang `DATABASE_URL`.

Seed: `DEV_SEED_PASSWORD` hash Argon2id. Không seed token đăng nhập. Chạy lại không ghi đè displayName/password/tiêu đề đề đã sửa.

## 7. Việc cố ý để sau

HTTP CRUD, cookie session, NestJS controllers, Socratic AI, chấm Gemini, OCR/PDF/DOCX, queue/outbox, lớp/trường, dashboard, embeddings. Khi làm chức năng mới, tạo nhánh `feat/...` từ base đã tích hợp database. Model tương lai vẫn `gemini-2.5-flash`.
