import { randomUUID } from "node:crypto";
import { DomainError } from "../src/core/errors.js";
import { sanitizeErrorMessage } from "../src/core/sanitize.js";
import { createPrismaHandle, disconnectPrismaHandle } from "../src/infrastructure/database/prisma.client.js";
import { createSocraticAiFromEnv } from "../src/infrastructure/ai/create-socratic-ai.js";
import { resolveAiRuntimeMode } from "../src/infrastructure/ai/ai-config.js";
import { openOrResumeSocraticSession } from "../src/modules/socratic/application/open-or-resume-session.js";
import { getSocraticSession } from "../src/modules/socratic/application/get-socratic-session.js";
import { saveStudentOutline } from "../src/modules/socratic/application/save-student-outline.js";
import { sendSocraticTurn } from "../src/modules/socratic/application/send-socratic-turn.js";
import type { StudentActor } from "../src/modules/socratic/domain/actor.js";

function printHelp(): void {
  console.log(`CLI demo Socratic (chưa có HTTP server)

  npm run socratic:demo -- help
  npm run socratic:demo -- open --login bui.hamy --code VAN12-NLXH-SOC
  npm run socratic:demo -- show --login bui.hamy --session <id>
  npm run socratic:demo -- turn --login bui.hamy --session <id> --message "Em chưa biết mở bài." --request-id <uuid>
  npm run socratic:demo -- outline --login bui.hamy --session <id> --expected-revision 1 --json '{"sections":[{"id":"open","title":"Mở bài","points":["Đặt vấn đề bản lĩnh"]}]}'

Tài khoản/đề tổng hợp: bui.hamy + VAN12-NLXH-SOC (không dùng phiên seed đã COMPLETED).
Mặc định AI_MODE=mock. Gọi Gemini thật: AI_MODE=live và GEMINI_API_KEY; lỗi Gemini không bị giả thành mock.
Resume: chạy lại open với cùng login/code trên process khác, snapshot không đổi.
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

async function actorFromLogin(loginId: string): Promise<StudentActor> {
  const handle = createPrismaHandle();
  try {
    const user = await handle.prisma.user.findUnique({ where: { loginId } });
    if (!user || user.role !== "STUDENT") {
      throw new DomainError("ACTOR_INVALID", `student login ${loginId} not found`);
    }
    return { userId: user.id, role: "STUDENT" };
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
  console.log(`AI_MODE=${mode}; model=gemini-2.5-flash`);
  const login = requireArg("--login");
  const actor = await actorFromLogin(login);

  if (command === "open") {
    const code = requireArg("--code");
    await withPrisma(async (prisma) => {
      const assignment = await prisma.assignment.findUnique({ where: { code } });
      if (!assignment) {
        throw new DomainError("SESSION_ASSIGNMENT", `assignment ${code} not found`);
      }
      const opened = await openOrResumeSocraticSession(prisma, { actor, assignmentId: assignment.id });
      console.log(
        JSON.stringify(
          {
            resumed: opened.resumed,
            sessionId: opened.sessionId,
            lastSequence: opened.lastSequence,
            outlineRevision: opened.outlineRevision,
            status: opened.status,
            title: opened.snapshot.title,
          },
          null,
          2,
        ),
      );
    });
    return;
  }

  const sessionId = requireArg("--session");
  if (command === "show") {
    await withPrisma(async (prisma) => {
      const view = await getSocraticSession(prisma, { actor, sessionId });
      console.log(
        JSON.stringify(
          {
            sessionId: view.sessionId,
            lastSequence: view.lastSequence,
            outlineRevision: view.outlineRevision,
            outline: view.outline,
            messages: view.messages.map((item) => ({
              sequence: item.sequence,
              role: item.role,
              content: item.content,
            })),
          },
          null,
          2,
        ),
      );
    });
    return;
  }

  if (command === "outline") {
    const expected = Number(requireArg("--expected-revision"));
    const json = requireArg("--json");
    await withPrisma(async (prisma) => {
      const saved = await saveStudentOutline(prisma, {
        actor,
        sessionId,
        expectedOutlineRevision: expected,
        outline: JSON.parse(json) as unknown,
      });
      console.log(JSON.stringify(saved, null, 2));
    });
    return;
  }

  if (command === "turn") {
    const message = requireArg("--message");
    const requestId = arg("--request-id") ?? randomUUID();
    const expectedLast = Number(arg("--expected-last") ?? "0");
    const ai = createSocraticAiFromEnv();
    await withPrisma(async (prisma) => {
      const current = await getSocraticSession(prisma, { actor, sessionId });
      const result = await sendSocraticTurn(prisma, ai, {
        actor,
        sessionId,
        requestId,
        expectedLastSequence: Number.isFinite(expectedLast) && arg("--expected-last") ? expectedLast : current.lastSequence,
        message,
      });
      console.log(
        JSON.stringify(
          {
            requestId: result.requestId,
            responseMode: result.responseMode,
            lastSequence: result.lastSequence,
            assistant: result.assistantMessage.content,
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
