import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAiFeatureFlags,
  isDecisionAdvisorEnabled,
  isScenarioExplainerEnabled,
} from "@/lib/ai/feature-flags";

/**
 * PRD 5.2-G-D flag matrix (server-side). UI is not the only gate.
 */
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("feature flag matrix 5.2-G-D", () => {
  const combos: Array<{
    scenario: string;
    advisor: string;
    wantS: boolean;
    wantD: boolean;
  }> = [
    { scenario: "false", advisor: "false", wantS: false, wantD: false },
    { scenario: "true", advisor: "false", wantS: true, wantD: false },
    { scenario: "false", advisor: "true", wantS: false, wantD: true },
    { scenario: "true", advisor: "true", wantS: true, wantD: true },
  ];

  for (const c of combos) {
    it(`scenario=${c.scenario} advisor=${c.advisor}`, () => {
      vi.stubEnv("AI_SCENARIO_EXPLAINER_ENABLED", c.scenario);
      vi.stubEnv("AI_DECISION_ADVISOR_ENABLED", c.advisor);
      expect(isScenarioExplainerEnabled()).toBe(c.wantS);
      expect(isDecisionAdvisorEnabled()).toBe(c.wantD);
      const flags = getAiFeatureFlags();
      expect(flags.scenarioExplainer).toBe(c.wantS);
      expect(flags.decisionAdvisor).toBe(c.wantD);
    });
  }

  it("unset env defaults ON (explicit safe default)", () => {
    vi.stubEnv("AI_SCENARIO_EXPLAINER_ENABLED", "");
    vi.stubEnv("AI_DECISION_ADVISOR_ENABLED", "");
    expect(isScenarioExplainerEnabled()).toBe(true);
    expect(isDecisionAdvisorEnabled()).toBe(true);
  });
});
