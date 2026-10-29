import { describe, expect, it } from "vitest";
import {
  freeChatFallbackModels,
  isSafetyClassifierModel,
  looksLikeSafetyOnlyOutput,
  resolveFreeChatModel,
} from "@/lib/ai/model-guard";

describe("model-guard", () => {
  it("detects content-safety models", () => {
    expect(
      isSafetyClassifierModel("nvidia/nemotron-3.5-content-safety:free")
    ).toBe(true);
    expect(isSafetyClassifierModel("google/gemma-4-31b-it:free")).toBe(false);
  });

  it("detects safety-only outputs", () => {
    expect(looksLikeSafetyOnlyOutput("User Safety: safe")).toBe(true);
    expect(looksLikeSafetyOnlyOutput("User Safety: unsafe")).toBe(true);
    expect(
      looksLikeSafetyOnlyOutput(
        "Kesimpulan: cash flow ketat karena fixed cost tinggi bulan ini."
      )
    ).toBe(false);
  });

  it("rewrites openrouter/free and safety models to pinned chat model", () => {
    expect(resolveFreeChatModel("openrouter/free")).toBe(
      "nvidia/nemotron-3.5-lightning:free"
    );
    expect(
      resolveFreeChatModel("nvidia/nemotron-3.5-content-safety:free")
    ).toBe("nvidia/nemotron-3.5-lightning:free");
    expect(resolveFreeChatModel("google/gemma-4-31b-it:free")).toBe(
      "google/gemma-4-31b-it:free"
    );
  });

  it("builds free-only fallback chain without duplicates/safety", () => {
    const chain = freeChatFallbackModels(
      "nvidia/nemotron-3.5-content-safety:free"
    );
    expect(chain.every((m) => !isSafetyClassifierModel(m))).toBe(true);
    expect(new Set(chain).size).toBe(chain.length);
    expect(chain[0]).toBe("nvidia/nemotron-3.5-lightning:free");
  });
});

