import "dotenv/config";
import { sanitizeErrorMessage } from "../src/core/sanitize.js";
import { DomainError } from "../src/core/errors.js";
import { GeminiWritingObservationAdapter } from "../src/infrastructure/ai/gemini-writing-observation.adapter.js";
import { resolveWritingProfileModel } from "../src/infrastructure/ai/ai-config.js";
import { loadWritingProfilePromptBundle } from "../src/modules/writing-profile/prompt-assets.js";
import { parseWritingObservationOutput } from "../src/modules/writing-profile/application/validate-extraction-output.js";
import { buildExtractionPayload } from "../src/modules/writing-profile/application/build-extraction-payload.js";
import type { AssignmentSnapshot } from "../src/modules/assignments/domain/rubric.js";

const snapshot: AssignmentSnapshot = {
  assignmentId: "00000000-0000-4000-8000-000000000003",
  code: "SMOKE-PROFILE",
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
        descriptor: "Mở–thân–kết mạch lạc.",
        requiredElements: ["phân biệt kiên định với bảo thủ"],
      },
      {
        criterionId: "C2",
        name: "Luận điểm và dẫn chứng",
        weight: "6.00",
        descriptor: "Luận điểm rõ, có dẫn chứng.",
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
  return process.argv.includes("--live") || process.env.WRITING_PROFILE_LIVE === "1";
}

async function main(): Promise<void> {
  if (!isLiveEnabled()) {
    console.log("live smoke chưa chạy: cần WRITING_PROFILE_LIVE=1 hoặc --live");
    process.exit(2);
  }
  if (!process.env.GEMINI_API_KEY?.trim()) {
    console.log("live smoke không đạt: thiếu GEMINI_API_KEY; giữ model gemini-3.8-flash");
    process.exit(2);
  }
  const model = resolveWritingProfileModel();
  const bundle = loadWritingProfilePromptBundle();
  const built = buildExtractionPayload({
    submissionText: essay,
    contentHash: "smoke-content-hash",
    snapshot,
    totalScore: "7.50",
    maxScore: "10.00",
    detailedEvaluations: [
      {
        criterionId: "C1",
        awardedScore: "3.00",
        comment: "Bố cục đủ mở–thân–kết.",
        strengths: [],
        weaknesses: [],
        evidence: [{ quote: essay.slice(0, 12), start: 0, end: 12 }],
        missingElements: [],
      },
    ],
  });
  const adapter = new GeminiWritingObservationAdapter();
  const result = await adapter.extract({
    systemInstruction: bundle.systemInstruction,
    userPayload: built.userPayload,
    responseJsonSchema: bundle.providerSchema,
    promptVersion: bundle.promptVersion,
    extractionInput: built.extractionInput,
  });
  const parsed = parseWritingObservationOutput(result.output, essay, snapshot.genre);
  console.log(
    JSON.stringify(
      {
        ok: true,
        model,
        promptVersion: result.promptVersion,
        finishReason: result.finishReason,
        latencyMs: result.latencyMs,
        usage: result.usage ?? null,
        observationCount: parsed.length,
        note: "Smoke chứng minh gọi model và schema; không phải nghiệm thu chất lượng nhận xét. Không ghi DB, không publish.",
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
