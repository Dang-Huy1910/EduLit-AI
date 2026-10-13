import { DomainError } from "../src/core/errors.js";
import { sanitizeErrorMessage } from "../src/core/sanitize.js";
import { createPrismaHandle, disconnectPrismaHandle } from "../src/infrastructure/database/prisma.client.js";
import { createWritingObservationAiFromEnv } from "../src/infrastructure/ai/create-writing-observation-ai.js";
import { resolveAiRuntimeMode } from "../src/infrastructure/ai/ai-config.js";
import { createWritingProfileServices } from "../src/modules/writing-profile/application/create-writing-profile-services.js";
import { createAssignment } from "../src/modules/assignments/application/create-assignment.js";
import type { AssessmentActor } from "../src/modules/assessment/domain/actor.js";
import type { ObservationStatus } from "../src/generated/prisma/client.js";

function printHelp(): void {
  console.log(`CLI demo hồ sơ văn phong (chưa có HTTP)

  npm run writing-profile:demo -- help
  npm run writing-profile:demo -- extract --login dang.loan --assessment <PUBLISHED-id>
  npm run writing-profile:demo -- show --login bui.hamy
  npm run writing-profile:demo -- review-status --login dang.loan --observation <id> --status INVALIDATED --expected-version <n>
  npm run writing-profile:demo -- prepare-open-assignment --login dang.loan --code VAN12-NLXH-WP-DEMO

Tài khoản seed: giáo viên dang.loan, học sinh bui.hamy.
Chỉ trích xuất assessment PUBLISHED thuộc đề của giáo viên đăng nhập. Không impersonate studentId.
Không dùng bài seed đã có observation để chứng minh AI; nộp–chấm–công bố bài mới bằng assessment:demo trước.
prepare-open-assignment tạo đề NLXH mới nếu chưa có, không sửa đề/bài đã có. Dùng đề đó cho socratic:demo sau extract.
Mặc định AI_MODE=mock. Gọi Gemini: AI_MODE=live và GEMINI_API_KEY; lỗi Gemini không bị giả thành mock.
Không reset DB.
`);
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

function requireArg(name: string): string {
  const value = arg(name);
  if (!value) {
    throw new Error(`missing ${name}`);
  }
  return value;
}

async function actorFromLogin(loginId: string): Promise<AssessmentActor> {
  const handle = createPrismaHandle();
  try {
    const user = await handle.prisma.user.findUnique({ where: { loginId } });
    if (!user) {
      throw new DomainError("ACTOR_INVALID", `login ${loginId} not found`);
    }
    return { userId: user.id, role: user.role };
  } finally {
    await disconnectPrismaHandle(handle);
  }
}

async function withPrisma<T>(fn: (prisma: ReturnType<typeof createPrismaHandle>["prisma"]) => Promise<T>): Promise<T> {
  const handle = createPrismaHandle();
  try {
    return await fn(handle.prisma);
  } finally {
    await disconnectPrismaHandle(handle);
  }
}

const ALLOWED_REVIEW: ObservationStatus[] = ["SUPPORTED", "INVALIDATED", "RESOLVED"];

async function main(): Promise<void> {
  const command = process.argv[2] ?? "help";
  if (command === "help" || command === "--help") {
    printHelp();
    return;
  }
  const mode = resolveAiRuntimeMode();
  console.log(`AI_MODE=${mode}; model=gemini-2.5-flash`);
  const login = requireArg("--login");
  const actor = await actorFromLogin(login);

  if (command === "extract") {
    const assessmentId = requireArg("--assessment");
    const ai = createWritingObservationAiFromEnv();
    await withPrisma(async (prisma) => {
      const services = createWritingProfileServices(prisma, ai);
      const result = await services.extractPublishedObservations(actor, { assessmentId });
      console.log(
        JSON.stringify(
          {
            outcome: result.outcome,
            mock: mode === "mock",
            assessmentId: result.assessmentId,
            observationCount: result.observations.length,
            profileVersion: result.profileVersion,
            observations: result.observations.map((item) => ({
              id: item.id,
              featureKey: item.featureKey,
              kind: item.kind,
              status: item.status,
              evidenceQuote: item.evidenceQuote,
              evidenceStart: item.evidenceStart,
              evidenceEnd: item.evidenceEnd,
            })),
          },
          null,
          2,
        ),
      );
    });
    return;
  }

  if (command === "show") {
    await withPrisma(async (prisma) => {
      const services = createWritingProfileServices(prisma);
      const result = await services.getOwnWritingProfile(actor);
      console.log(JSON.stringify(result, null, 2));
    });
    return;
  }

  if (command === "review-status") {
    const observationId = requireArg("--observation");
    const status = requireArg("--status") as ObservationStatus;
    if (!ALLOWED_REVIEW.includes(status)) {
      throw new DomainError("OBSERVATION_STATUS", "status must be SUPPORTED, INVALIDATED or RESOLVED");
    }
    const expectedVersion = Number(requireArg("--expected-version"));
    await withPrisma(async (prisma) => {
      const services = createWritingProfileServices(prisma);
      const profile = await services.reviewObservationStatus(actor, {
        observationId,
        status,
        expectedProfileVersion: expectedVersion,
      });
      console.log(
        JSON.stringify(
          {
            observationId,
            status,
            profileId: profile.id,
            profileVersion: profile.version,
          },
          null,
          2,
        ),
      );
    });
    return;
  }

  if (command === "prepare-open-assignment") {
    const code = requireArg("--code");
    await withPrisma(async (prisma) => {
      if (actor.role !== "TEACHER") {
        throw new DomainError("ACTOR_FORBIDDEN", "only TEACHER actors may create a demo assignment");
      }
      const existing = await prisma.assignment.findUnique({ where: { code } });
      if (existing) {
        console.log(
          JSON.stringify(
            { created: false, assignmentId: existing.id, code: existing.code, genre: existing.genre },
            null,
            2,
          ),
        );
        return;
      }
      const template = await prisma.assignment.findUnique({ where: { code: "VAN12-NLXH-SOC" } });
      if (!template) {
        throw new DomainError("SUBMISSION_ASSIGNMENT", "seed assignment VAN12-NLXH-SOC is missing");
      }
      const created = await createAssignment(prisma, {
        teacherId: actor.userId,
        code,
        title: "Bản lĩnh — đề mở cùng thể loại (demo hồ sơ)",
        instructions: template.instructions,
        genre: template.genre,
        gradeLevel: template.gradeLevel,
        learningMaterialText: template.learningMaterialText,
        rubric: template.rubric,
        maxScore: template.maxScore,
        scoreStep: template.scoreStep,
        status: "PUBLISHED",
      });
      console.log(
        JSON.stringify(
          { created: true, assignmentId: created.id, code: created.code, genre: created.genre },
          null,
          2,
        ),
      );
    });
    return;
  }

  printHelp();
}

try {
  await main();
} catch (error) {
  if (error instanceof DomainError) {
    console.error(`${error.code}: ${error.message}`);
  } else {
    console.error(sanitizeErrorMessage(error));
  }
  process.exit(1);
}
