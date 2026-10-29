import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertAllowedFreeModel,
  getRouteForTask,
  isAiRouterEnabled,
  isAllowedFreeModel,
  parseFallbackModelsCsv,
} from "@/lib/ai/model-registry";
import { AIError } from "@/lib/ai/errors";

describe("model-registry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows :free models and rejects unpaid-looking ids", () => {
    expect(isAllowedFreeModel("nvidia/nemotron-3.5-lightning:free")).toBe(
      true
    );
    expect(isAllowedFreeModel("openai/gpt-4o")).toBe(false);
    expect(
      isAllowedFreeModel("nvidia/nemotron-3.5-content-safety:free")
    ).toBe(false);
  });

  it("assertAllowedFreeModel throws for paid models", () => {
    expect(() => assertAllowedFreeModel("openai/gpt-4o")).toThrow(AIError);
  });

  it("parseFallbackModelsCsv drops paid and keeps free", () => {
    const list = parseFallbackModelsCsv(
      "openai/gpt-4o, nvidia/nemotron-3.5-lightning:free, google/gemma-4-31b-it:free"
    );
    expect(list).toEqual([
      "nvidia/nemotron-3.5-lightning:free",
      "google/gemma-4-31b-it:free",
    ]);
  });

  it("router flag defaults off", () => {
    vi.stubEnv("AI_ROUTER_ENABLED", "");
    expect(isAiRouterEnabled()).toBe(false);
    vi.stubEnv("AI_ROUTER_ENABLED", "true");
    expect(isAiRouterEnabled()).toBe(true);
  });

  it("getRouteForTask uses per-task env then baseline", () => {
    vi.stubEnv("OPENROUTER_MODEL", "nvidia/nemotron-3.5-lightning:free");
    vi.stubEnv(
      "OPENROUTER_MODEL_FINANCIAL_REASONING",
      "google/gemma-4-31b-it:free"
    );
    const route = getRouteForTask("financial_reasoning");
    expect(route.primaryModel).toBe("google/gemma-4-31b-it:free");
    expect(route.fallbackModels.every((m) => isAllowedFreeModel(m))).toBe(
      true
    );
    expect(route.fallbackModels).not.toContain(route.primaryModel);
  });

  it("empty task env falls back to Phase 5 baseline model", () => {
    vi.stubEnv("OPENROUTER_MODEL", "nvidia/nemotron-3.5-lightning:free");
    vi.stubEnv("OPENROUTER_MODEL_ACTION_ADVISOR", "");
    const route = getRouteForTask("action_advisor");
    expect(route.primaryModel).toBe("nvidia/nemotron-3.5-lightning:free");
  });
});
