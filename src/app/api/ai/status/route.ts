import { ok, handleError } from "@/lib/api";
import { isAIConfigured } from "@/lib/ai/provider";
import { getAiFeatureFlags } from "@/lib/ai/feature-flags";
import { requireUser } from "@/lib/session";

/**
 * GET /api/ai/status — rollout flags for UI (no secrets).
 * Read-only; does not call the model provider.
 */
export async function GET() {
  try {
    await requireUser();
    const flags = getAiFeatureFlags();
    // Never include API keys, tokens, prompts, or financial payloads.
    return ok({
      configured: isAIConfigured(),
      features: {
        scenarioExplainer: flags.scenarioExplainer,
        decisionAdvisor: flags.decisionAdvisor,
        routerEnabled: flags.routerEnabled,
      },
      /** Hint only — actual resolve happens server-side via free-model guard. */
      baselineModel: flags.baselineModelHint,
      /** Explicit defaults when env unset: scenario/advisor ON, router OFF. */
      defaults: {
        scenarioExplainer: true,
        decisionAdvisor: true,
        routerEnabled: false,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
