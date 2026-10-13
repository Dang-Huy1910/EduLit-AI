import fs from "node:fs";
import { DomainError } from "../src/core/errors.js";
import { sanitizeErrorMessage } from "../src/core/sanitize.js";
import { createPrismaHandle, disconnectPrismaHandle } from "../src/infrastructure/database/prisma.client.js";
import { createAssessmentAiFromEnv } from "../src/infrastructure/ai/create-assessment-ai.js";
import { resolveAiRuntimeMode } from "../src/infrastructure/ai/ai-config.js";
import { createAssessmentServices } from "../src/modules/assessment/application/create-assessment-services.js";
import type { AssessmentActor } from "../src/modules/assessment/domain/actor.js";

function printHelp(): void {
  console.log(`CLI demo chấm bài (chưa có HTTP nộp/chấm)

  npm run assessment:demo -- help
  npm run assessment:demo -- submit --login bui.hamy --code VAN12-NLXH-SOC --file scripts/fixtures/assessment-demo-essay.txt
  npm run assessment:demo -- grade --login dang.loan --submission <id>
  npm run assessment:demo -- show --login dang.loan --submission <id>
  npm run assessment:demo -- show --login bui.hamy --submission <id>
  npm run assessment:demo -- publish --login dang.loan --assessment <id>

Tài khoản seed: học sinh bui.hamy, giáo viên dang.loan. Đề VAN12-NLXH-SOC chưa có bài nộp trong seed.
Không nộp lại VAN12-NLXH-01 / VAN12-NLVH-02 (đã có bài). Không tự publish sau grade. Không reset DB.
Mặc định AI_MODE=mock. Gọi Gemini: AI_MODE=live và GEMINI_API_KEY; lỗi Gemini không bị giả thành mock.
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

async function main(): Promise<void> {
  const command = process.argv[2] ?? "help";
  if (command === "help" || command === "--help") {
    printHelp();
    return;
  }
  const mode = resolveAiRuntimeMode();
  console.log(`AI_MODE=${mode}; model=gemini-3.8-flash`);
  const login = requireArg("--login");
  const actor = await actorFromLogin(login);

  if (command === "submit") {
    const code = requireArg("--code");
    const filePath = requireArg("--file");
    const text = fs.readFileSync(filePath, "utf8");
    const sessionId = arg("--session");
    await withPrisma(async (prisma) => {
      const assignment = await prisma.assignment.findUnique({ where: { code } });
      if (!assignment) {
        throw new DomainError("SUBMISSION_ASSIGNMENT", `assignment ${code} not found`);
      }
      const services = createAssessmentServices(prisma);
      const result = await services.submitStudentText(actor, {
        assignmentId: assignment.id,
        socraticSessionId: sessionId ?? null,
        text,
      });
      console.log(
        JSON.stringify(
          {
            replayed: result.replayed,
            submissionId: result.submission.id,
            assignmentId: result.submission.assignmentId,
            submittedAt: result.submission.submittedAt,
            contentHash: result.submission.contentHash,
          },
          null,
          2,
        ),
      );
    });
    return;
  }

  if (command === "grade") {
    const submissionId = requireArg("--submission");
    const ai = createAssessmentAiFromEnv();
    await withPrisma(async (prisma) => {
      const services = createAssessmentServices(prisma, ai);
      const result = await services.assessSubmission(actor, { submissionId });
      console.log(
        JSON.stringify(
          {
            replayed: result.replayed,
            mock: mode === "mock",
            assessmentId: result.assessment.id,
            status: result.assessment.status,
            totalScore: result.assessment.totalScore,
            maxScore: result.assessment.maxScore,
            promptVersion: result.assessment.promptVersion,
            modelName: result.assessment.modelName,
            usage: result.usage ?? null,
            latencyMs: result.latencyMs ?? null,
          },
          null,
          2,
        ),
      );
    });
    return;
  }

  if (command === "show") {
    const submissionId = requireArg("--submission");
    await withPrisma(async (prisma) => {
      const services = createAssessmentServices(prisma);
      const result = await services.getSubmission(actor, { submissionId });
      console.log(JSON.stringify(result, null, 2));
    });
    return;
  }

  if (command === "publish") {
    const assessmentId = requireArg("--assessment");
    await withPrisma(async (prisma) => {
      const services = createAssessmentServices(prisma);
      const result = await services.publishReviewedAssessment(actor, { assessmentId });
      console.log(
        JSON.stringify(
          {
            replayed: result.replayed,
            assessmentId: result.assessment.id,
            status: result.assessment.status,
            publishedAt: result.assessment.publishedAt,
            totalScore: result.assessment.totalScore,
          },
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
