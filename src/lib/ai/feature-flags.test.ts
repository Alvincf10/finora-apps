import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAiFeatureFlags,
  isDecisionAdvisorEnabled,
  isScenarioExplainerEnabled,
} from "@/lib/ai/feature-flags";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AI feature flags (5.2-F)", () => {
  it("defaults scenario + decision advisor ON", () => {
    vi.stubEnv("AI_SCENARIO_EXPLAINER_ENABLED", "");
    vi.stubEnv("AI_DECISION_ADVISOR_ENABLED", "");
    expect(isScenarioExplainerEnabled()).toBe(true);
    expect(isDecisionAdvisorEnabled()).toBe(true);
  });

  it("can disable for rollback", () => {
    vi.stubEnv("AI_SCENARIO_EXPLAINER_ENABLED", "false");
    vi.stubEnv("AI_DECISION_ADVISOR_ENABLED", "0");
    expect(isScenarioExplainerEnabled()).toBe(false);
    expect(isDecisionAdvisorEnabled()).toBe(false);
  });

  it("getAiFeatureFlags mirrors router default off", () => {
    vi.stubEnv("AI_ROUTER_ENABLED", "");
    vi.stubEnv("OPENROUTER_MODEL", "nvidia/nemotron-3.5-lightning:free");
    const flags = getAiFeatureFlags();
    expect(flags.routerEnabled).toBe(false);
    expect(flags.baselineModelHint).toContain("lightning");
  });
});
