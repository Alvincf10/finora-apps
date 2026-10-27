import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAIDailyRequestLimit,
  getAIMaxOutputTokens,
  getAIRequestTimeoutMs,
  getOpenRouterModel,
  isAIConfigured,
} from "@/lib/ai/config";

describe("AI config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults model to openrouter/free", () => {
    vi.stubEnv("OPENROUTER_MODEL", "");
    expect(getOpenRouterModel()).toBe("openrouter/free");
  });

  it("isAIConfigured is false without key", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(isAIConfigured()).toBe(false);
  });

  it("reads token/timeout/daily limits with clamps", () => {
    vi.stubEnv("OPENROUTER_MAX_OUTPUT_TOKENS", "800");
    vi.stubEnv("AI_REQUEST_TIMEOUT_MS", "20000");
    vi.stubEnv("AI_DAILY_REQUEST_LIMIT", "20");
    expect(getAIMaxOutputTokens()).toBe(800);
    expect(getAIRequestTimeoutMs()).toBe(20_000);
    expect(getAIDailyRequestLimit()).toBe(20);
  });
});
