import { afterEach, describe, expect, it, vi } from "vitest";
import { AIError } from "@/lib/ai/errors";
import { routeAiGenerate } from "@/lib/ai/model-router";
import type { ModelRouterProvider } from "@/lib/ai/model-router";

describe("routeAiGenerate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses primary model on success", async () => {
    vi.stubEnv("OPENROUTER_MODEL", "nvidia/nemotron-3.5-lightning:free");
    vi.stubEnv("AI_MAX_RETRIES", "1");

    const calls: string[] = [];
    const provider: ModelRouterProvider = {
      async generateTextOnModel(modelId) {
        calls.push(modelId);
        return {
          text: "Kesimpulan: kondisi stabil.",
          model: modelId,
          provider: "openrouter",
        };
      },
    };

    const result = await routeAiGenerate(
      {
        taskType: "financial_explainer",
        systemPrompt: "sys",
        contextBlock: "ctx",
        question: "Bagaimana kondisi saya?",
      },
      provider
    );

    expect(calls).toEqual(["nvidia/nemotron-3.5-lightning:free"]);
    expect(result.fallbackUsed).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.selectedModel).toBe("nvidia/nemotron-3.5-lightning:free");
    expect(result.explanation).toContain("stabil");
  });

  it("falls back once on retryable failure then succeeds", async () => {
    vi.stubEnv("OPENROUTER_MODEL", "nvidia/nemotron-3.5-lightning:free");
    vi.stubEnv(
      "OPENROUTER_FALLBACK_MODELS",
      "google/gemma-4-31b-it:free"
    );
    vi.stubEnv("AI_MAX_RETRIES", "1");

    const calls: string[] = [];
    const provider: ModelRouterProvider = {
      async generateTextOnModel(modelId) {
        calls.push(modelId);
        if (modelId.includes("lightning")) {
          throw new AIError(
            "AI_PROVIDER_UNAVAILABLE",
            "quota",
            503
          );
        }
        return {
          text: "Fallback ok",
          model: modelId,
          provider: "openrouter",
        };
      },
    };

    const result = await routeAiGenerate(
      {
        taskType: "general_explainer",
        systemPrompt: "sys",
        contextBlock: "ctx",
        question: "Ringkas",
      },
      provider
    );

    expect(calls).toHaveLength(2);
    expect(result.fallbackUsed).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.selectedModel).toBe("google/gemma-4-31b-it:free");
  });

  it("does not retry non-retryable errors", async () => {
    vi.stubEnv("OPENROUTER_MODEL", "nvidia/nemotron-3.5-lightning:free");
    vi.stubEnv("AI_MAX_RETRIES", "1");

    let calls = 0;
    const provider: ModelRouterProvider = {
      async generateTextOnModel() {
        calls += 1;
        throw new AIError("AI_NOT_CONFIGURED", "bad key", 503);
      },
    };

    await expect(
      routeAiGenerate(
        {
          taskType: "action_advisor",
          systemPrompt: "sys",
          contextBlock: "ctx",
          question: "Apa prioritas?",
        },
        provider
      )
    ).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });

    expect(calls).toBe(1);
  });

  it("respects AI_MAX_RETRIES=0 (primary only)", async () => {
    vi.stubEnv("OPENROUTER_MODEL", "nvidia/nemotron-3.5-lightning:free");
    vi.stubEnv(
      "OPENROUTER_FALLBACK_MODELS",
      "google/gemma-4-31b-it:free"
    );
    vi.stubEnv("AI_MAX_RETRIES", "0");

    const calls: string[] = [];
    const provider: ModelRouterProvider = {
      async generateTextOnModel(modelId) {
        calls.push(modelId);
        throw new AIError("AI_TIMEOUT", "slow", 504);
      },
    };

    await expect(
      routeAiGenerate(
        {
          taskType: "financial_reasoning",
          systemPrompt: "sys",
          contextBlock: "ctx",
          question: "Trade-off?",
        },
        provider
      )
    ).rejects.toMatchObject({ code: "AI_TIMEOUT" });

    expect(calls).toEqual(["nvidia/nemotron-3.5-lightning:free"]);
  });
});
