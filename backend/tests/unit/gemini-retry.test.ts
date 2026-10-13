import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, type GenerateContentResponse } from "@google/genai";
import {
  SOCRATIC_RETRY_BASE_DELAY_MS,
  SOCRATIC_RETRY_MAX_DELAY_MS,
} from "../../src/infrastructure/ai/ai-config.js";
import { retryDelayFor } from "../../src/infrastructure/ai/gemini-socratic.adapter.js";
import { GeminiSocraticAdapter } from "../../src/infrastructure/ai/gemini-socratic.adapter.js";

test("Gemini retry delay grows exponentially and remains bounded with jitter", () => {
  assert.equal(retryDelayFor(0, () => 0), Math.floor(SOCRATIC_RETRY_BASE_DELAY_MS / 2));
  assert.equal(retryDelayFor(0, () => 1), SOCRATIC_RETRY_BASE_DELAY_MS);
  assert.equal(retryDelayFor(1, () => 0), SOCRATIC_RETRY_BASE_DELAY_MS);
  assert.equal(retryDelayFor(99, () => 1), SOCRATIC_RETRY_MAX_DELAY_MS);
});

test("Gemini retries a transient 429 and preserves the structured-output request", async () => {
  let calls = 0;
  const adapter = new GeminiSocraticAdapter({
    apiKey: "test-key",
    model: "test-model",
    maxAttempts: 2,
    generateContent: async (request) => {
      calls += 1;
      assert.equal(request.config?.responseMimeType, "application/json");
      if (calls === 1) {
        throw new ApiError({ status: 429, message: "rate limited" });
      }
      return {
        candidates: [{ finishReason: "STOP" }],
        get text() {
          return JSON.stringify({
            welcomeSentences: ["Em hãy chọn một luận điểm trước.", "Em muốn bắt đầu từ đâu?"],
            outline: {
              sections: [
                { id: "open", title: "Mở bài", points: ["Nêu vấn đề."] },
                { id: "body", title: "Thân bài", points: ["Triển khai luận điểm."] },
                { id: "close", title: "Kết bài", points: ["Khẳng định thông điệp."] },
              ],
            },
          });
        },
      } as unknown as GenerateContentResponse;
    },
  });

  const result = await adapter.generateOutline({
    systemInstruction: "Hãy trả JSON.",
    userPayload: "Đề bài.",
    responseJsonSchema: { type: "object" },
    promptVersion: "test.v1",
  });

  assert.equal(calls, 2);
  assert.equal(result.provider, "gemini");
  assert.equal(result.output.outline.sections.length, 3);
});
