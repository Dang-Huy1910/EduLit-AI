import { sanitizeErrorMessage } from "../src/core/sanitize.js";
import { DomainError } from "../src/core/errors.js";
import { GeminiSocraticAdapter } from "../src/infrastructure/ai/gemini-socratic.adapter.js";
import { resolveSocraticModel } from "../src/infrastructure/ai/ai-config.js";
import { loadSocraticPromptBundle } from "../src/modules/socratic/prompt-assets.js";
import { inspectSocraticOutput } from "../src/modules/socratic/application/guardrails/validate-socratic-output.js";
import type { AssignmentSnapshot } from "../src/modules/assignments/domain/rubric.js";

const LIVE_FLAG = process.argv.includes("--live") || process.env.SOCRATIC_LIVE === "1";

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
      { criterionId: "C1", name: "Bố cục", weight: "4.00" },
      { criterionId: "C2", name: "Luận điểm", weight: "6.00" },
    ],
  },
  maxScore: "10.00",
  scoreStep: "0.25",
  status: "PUBLISHED",
  publishedAt: "2026-10-01T00:00:00.000Z",
  dueAt: null,
  snapshottedAt: "2026-10-13T00:00:00.000Z",
};

async function main(): Promise<void> {
  if (!LIVE_FLAG) {
    console.log("live smoke chưa chạy: cần SOCRATIC_LIVE=1 hoặc --live");
    process.exit(2);
  }
  if (!process.env.GEMINI_API_KEY?.trim()) {
    console.log("live smoke không đạt: thiếu GEMINI_API_KEY; giữ model gemini-2.5-flash");
    process.exit(2);
  }
  const model = resolveSocraticModel();
  const bundle = loadSocraticPromptBundle();
  const adapter = new GeminiSocraticAdapter();
  const started = Date.now();
  const result = await adapter.generateTurn({
    systemInstruction: bundle.systemInstruction,
    userPayload: [
      "Dữ liệu tổng hợp, không phải bài học sinh thật.",
      `Đề: ${snapshot.title}`,
      `Ngữ liệu: ${snapshot.learningMaterialText}`,
      "Câu hỏi học sinh: Em chưa biết nên mở bài bằng nhận định nào.",
    ].join("\n"),
    responseJsonSchema: bundle.providerSchema,
    promptVersion: bundle.promptVersion,
  });
  const inspected = inspectSocraticOutput(result.output, snapshot);
  console.log(
    JSON.stringify(
      {
        ok: inspected.ok,
        model,
        promptVersion: result.promptVersion,
        finishReason: result.finishReason,
        latencyMs: result.latencyMs || Date.now() - started,
        usage: result.usage ?? null,
        guardrail: inspected.ok ? "pass" : inspected.failure,
        sentenceCount: inspected.ok ? inspected.output.replySentences.length : null,
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
