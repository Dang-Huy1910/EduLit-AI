import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../../src/core/errors.js";
import { resolveAiConfig } from "../../src/infrastructure/ai/ai-config.js";

test("resolves task override, then provider model, shared model, then Gemini default", () => {
  assert.equal(resolveAiConfig("socratic", { AI_MODE: "mock", SOCRATIC_MODEL: "task-model", AI_MODEL: "shared", GEMINI_MODEL: "legacy" }).model, "mock/socratic");
  assert.equal(resolveAiConfig("socratic", { AI_MODE: "live", GEMINI_API_KEY: "key", SOCRATIC_MODEL: "task-model", AI_MODEL: "shared", GEMINI_MODEL: "legacy" }).model, "task-model");
  assert.equal(resolveAiConfig("assessment", { AI_MODE: "live", GEMINI_API_KEY: "key", GEMINI_MODEL: "legacy", AI_MODEL: "shared" }).model, "legacy");
  assert.equal(resolveAiConfig("assessment", { AI_MODE: "live", GEMINI_API_KEY: "key", AI_MODEL: "shared" }).model, "shared");
  assert.equal(resolveAiConfig("assessment", { AI_MODE: "live", GEMINI_API_KEY: "key" }).model, "gemini-3.8-flash");
});

test("switching AI_PROVIDER picks OPENAI_MODEL or GEMINI_MODEL without changing the other lines", () => {
  const both = {
    AI_MODE: "live",
    GEMINI_API_KEY: "gkey",
    GEMINI_MODEL: "gemini-3.8-flash",
    OPENAI_API_KEY: "okey",
    OPENAI_MODEL: "gpt-4.1-mini",
    AI_MODEL: "shared-should-not-win",
  };
  assert.equal(resolveAiConfig("socratic", { ...both, AI_PROVIDER: "openai" }).model, "gpt-4.1-mini");
  assert.equal(resolveAiConfig("socratic", { ...both, AI_PROVIDER: "gemini" }).model, "gemini-3.8-flash");
  assert.equal(resolveAiConfig("socratic", { ...both, AI_PROVIDER: "openai" }).provider, "openai");
  assert.equal(resolveAiConfig("socratic", { ...both, AI_PROVIDER: "gemini" }).provider, "gemini");
});

test("rejects invalid mode/provider and an OpenAI configuration without an explicit model", () => {
  assert.throws(() => resolveAiConfig("socratic", { AI_MODE: "invalid" }), (error: unknown) => error instanceof DomainError && error.code === "AI_NOT_CONFIGURED");
  assert.throws(() => resolveAiConfig("socratic", { AI_PROVIDER: "other" }), (error: unknown) => error instanceof DomainError && error.code === "AI_NOT_CONFIGURED");
  assert.throws(() => resolveAiConfig("socratic", { AI_PROVIDER: "openai", OPENAI_API_KEY: "key" }), (error: unknown) => error instanceof DomainError && error.code === "AI_NOT_CONFIGURED");
});

test("mock mode remains usable without a provider key and does not claim a live model", () => {
  const config = resolveAiConfig("writingProfile", { AI_MODE: "mock", AI_PROVIDER: "openai", AI_MODEL: "chosen" });
  assert.deepEqual(config, { mode: "mock", provider: "openai", model: "mock/writingProfile" });
});
