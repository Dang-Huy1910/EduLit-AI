import "dotenv/config";
import { sanitizeErrorMessage } from "../src/core/sanitize.js";
import { DomainError } from "../src/core/errors.js";
import { GeminiAssessmentAdapter } from "../src/infrastructure/ai/gemini-assessment.adapter.js";
import { resolveAssessmentModel } from "../src/infrastructure/ai/ai-config.js";
import { loadAssessmentPromptBundle } from "../src/modules/assessment/prompt-assets.js";
import { parseAssessmentModelOutput } from "../src/modules/assessment/application/validate-assessment-output.js";
import { buildScoringPayload } from "../src/modules/assessment/application/build-scoring-payload.js";
import type { AssignmentSnapshot } from "../src/modules/assignments/domain/rubric.js";

const snapshot: AssignmentSnapshot = {
  assignmentId: "00000000-0000-4000-8000-000000000002",
  code: "SMOKE-ASSESS",
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

const essay =
  "Người trẻ kiên định khi dám nói sự thật về bài mình chưa làm được, không sao chép văn mẫu. Em lấy gương một bạn hỏi lại bài khó giữa áp lực thi. Thành tích chỉ có ý nghĩa khi đi cùng sự trung thực.";

function isLiveEnabled(): boolean {
  return process.argv.includes("--live") || process.env.ASSESSMENT_LIVE === "1";
}

async function main(): Promise<void> {
  if (!isLiveEnabled()) {
    console.log("live smoke chưa chạy: cần ASSESSMENT_LIVE=1 hoặc --live");
    process.exit(2);
  }
  if (!process.env.GEMINI_API_KEY?.trim()) {
    console.log("live smoke không đạt: thiếu GEMINI_API_KEY; giữ model gemini-2.5-flash");
    process.exit(2);
  }
  const model = resolveAssessmentModel();
  const bundle = loadAssessmentPromptBundle();
  const built = buildScoringPayload(snapshot, essay);
  const adapter = new GeminiAssessmentAdapter();
  const result = await adapter.grade({
    systemInstruction: bundle.systemInstruction,
    userPayload: built.userPayload,
    responseJsonSchema: bundle.providerSchema,
    promptVersion: bundle.promptVersion,
    scoringInput: built.scoringInput,
  });
  const parsed = parseAssessmentModelOutput(result.output, snapshot, essay);
  console.log(
    JSON.stringify(
      {
        ok: true,
        model,
        promptVersion: result.promptVersion,
        finishReason: result.finishReason,
        latencyMs: result.latencyMs,
        usage: result.usage ?? null,
        totalScore: parsed.totalScore,
        criterionCount: parsed.evaluations.length,
        note: "Smoke chứng minh gọi model và schema; không phải nghiệm thu chất lượng chấm. Không publish.",
      },
      null,
      2,
    ),
  );
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
