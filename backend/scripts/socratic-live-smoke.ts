import "dotenv/config";
import { sanitizeErrorMessage } from "../src/core/sanitize.js";
import { DomainError } from "../src/core/errors.js";
import { resolveAiConfig } from "../src/infrastructure/ai/ai-config.js";
import { createSocraticAiFromEnv } from "../src/infrastructure/ai/create-socratic-ai.js";
import { loadSocraticPromptBundle } from "../src/modules/socratic/prompt-assets.js";
import { inspectSocraticOutput } from "../src/modules/socratic/application/guardrails/validate-socratic-output.js";
import { buildSocraticUserPayload } from "../src/modules/socratic/application/conversations/build-socratic-context.js";
import type { AssignmentSnapshot } from "../src/modules/assignments/domain/rubric.js";

const snapshot: AssignmentSnapshot = {
  assignmentId: "00000000-0000-4000-8000-000000000001",
  code: "SMOKE-NLXH",
  title: "Bản lĩnh người trẻ",
  instructions: "Viết nghị luận ngắn về bản lĩnh trước áp lực thành tích.",
  genre: "NLXH",
  gradeLevel: 12,
  learningMaterialText: "Ngữ liệu tổng hợp: thành tích cần đi cùng sự trung thực.",
  rubric: {
    criteria: [
      {
        criterionId: "C1",
        name: "Bố cục",
        weight: "4.00",
        descriptor: "Mở–thân–kết mạch lạc, phân biệt kiên định với bảo thủ.",
        requiredElements: ["phân biệt kiên định với bảo thủ"],
      },
      {
        criterionId: "C2",
        name: "Luận điểm và dẫn chứng",
        weight: "6.00",
        descriptor: "Luận điểm rõ, có dẫn chứng từ tình huống lớp học.",
        requiredElements: ["dẫn chứng từ tình huống lớp học"],
      },
    ],
  },
  maxScore: "10.00",
  scoreStep: "0.25",
  status: "PUBLISHED",
  publishedAt: "2026-10-01T00:00:00.000Z",
  dueAt: null,
  snapshottedAt: "2026-10-13T00:00:00.000Z",
};

function isLiveEnabled(): boolean {
  return process.argv.includes("--live") || process.env.SOCRATIC_LIVE === "1";
}

function isDryRun(): boolean {
  return process.argv.includes("--dry-run");
}

async function main(): Promise<void> {
  if (!isLiveEnabled()) {
    console.log("live smoke chưa chạy: cần SOCRATIC_LIVE=1 hoặc --live");
    process.exit(2);
  }
  const config = resolveAiConfig("socratic");
  if (config.mode !== "live" || !config.apiKey) {
    throw new DomainError("AI_NOT_CONFIGURED", "live smoke requires a live provider configuration");
  }
  if (isDryRun()) {
    console.log(JSON.stringify({ ok: true, dryRun: true, provider: config.provider, model: config.model, key: "configured" }));
    return;
  }
  const bundle = loadSocraticPromptBundle();
  const built = buildSocraticUserPayload({
    snapshot,
    outline: { sections: [] },
    history: [],
    profile: { hasProfile: false, declaredGoals: [], observations: [] },
    studentMessage: "Em chưa biết nên mở bài bằng nhận định nào.",
  });
  const adapter = createSocraticAiFromEnv();
  const started = Date.now();
  const result = await adapter.generateTurn({
    systemInstruction: bundle.systemInstruction,
    userPayload: built.userPayload,
    responseJsonSchema: bundle.providerSchema,
    promptVersion: bundle.promptVersion,
  });
  const inspected = inspectSocraticOutput(result.output, snapshot, {
    studentMessage: "Em chưa biết nên mở bài bằng nhận định nào.",
  });
  console.log(
    JSON.stringify(
      {
        ok: inspected.ok,
        provider: result.provider,
        model: config.model,
        promptVersion: result.promptVersion,
        finishReason: result.finishReason,
        latencyMs: result.latencyMs || Date.now() - started,
        usage: result.usage ?? null,
        guardrail: inspected.ok ? "pass" : inspected.failure,
        sentenceCount: inspected.ok ? inspected.output.replySentences.length : null,
        contextHasRubricDetail: built.userPayload.includes("phân biệt kiên định với bảo thủ"),
      },
      null,
      2,
    ),
  );
  if (!inspected.ok) {
    process.exit(1);
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof DomainError) {
    console.error(`live smoke không đạt: ${error.code}`);
  } else {
    console.error(`live smoke không đạt: ${sanitizeErrorMessage(error)}`);
  }
  process.exit(1);
}
