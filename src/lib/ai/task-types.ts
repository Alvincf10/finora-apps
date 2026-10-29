import type { AIContextType } from "@/lib/ai/context-builder";

/**
 * Explicit task categories for Free Model Router (PRD Phase 5.1 §4.1).
 * Classification comes from known feature context — not from an LLM.
 */
export const AI_TASK_TYPES = [
  "simple_summary",
  "financial_explainer",
  "financial_reasoning",
  "action_advisor",
  "general_explainer",
] as const;

export type AiTaskType = (typeof AI_TASK_TYPES)[number];

/**
 * Map Phase 5 contextType → Phase 5.1 task type (PRD §7.2).
 * `simpleSummary: true` only when a feature explicitly requests a short summary.
 */
export function taskTypeFromContext(
  contextType: AIContextType,
  opts?: { simpleSummary?: boolean }
): AiTaskType {
  if (opts?.simpleSummary) return "simple_summary";

  switch (contextType) {
    case "financial_health":
    case "cash_flow_forecast":
    case "roadmap":
      return "financial_explainer";
    case "scenario":
    case "decision_advisor":
      return "financial_reasoning";
    case "action_center":
      return "action_advisor";
    case "general_summary":
      return "general_explainer";
    default: {
      const _exhaustive: never = contextType;
      return _exhaustive;
    }
  }
}
