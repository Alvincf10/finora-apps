/**
 * Phase 5.2-F controlled rollout flags.
 * Defaults ON so shipped MVP stays live; set env=false for instant rollback.
 */

function envFlag(name: string, defaultOn: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultOn;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  return defaultOn;
}

/** Scenario Explainer (`contextType: scenario`) — Decision Lab. */
export function isScenarioExplainerEnabled(): boolean {
  return envFlag("AI_SCENARIO_EXPLAINER_ENABLED", true);
}

/** Decision Advisor (`contextType: decision_advisor`) — Insights. */
export function isDecisionAdvisorEnabled(): boolean {
  return envFlag("AI_DECISION_ADVISOR_ENABLED", true);
}

export type AiFeatureFlags = {
  scenarioExplainer: boolean;
  decisionAdvisor: boolean;
  /** Mirror of AI_ROUTER_ENABLED — production keeps false until Ultra/Xing scorecard. */
  routerEnabled: boolean;
  baselineModelHint: string;
};

export function getAiFeatureFlags(): AiFeatureFlags {
  const routerRaw = (process.env.AI_ROUTER_ENABLED ?? "false")
    .trim()
    .toLowerCase();
  const routerEnabled = ["1", "true", "yes", "on"].includes(routerRaw);
  return {
    scenarioExplainer: isScenarioExplainerEnabled(),
    decisionAdvisor: isDecisionAdvisorEnabled(),
    routerEnabled,
    baselineModelHint:
      (process.env.OPENROUTER_MODEL ?? "").trim() ||
      "nvidia/nemotron-3.5-lightning:free",
  };
}
