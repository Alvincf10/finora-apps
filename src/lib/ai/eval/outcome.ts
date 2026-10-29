import type { FailureCategory } from "@/lib/ai/eval/failure-classify";
import type { CaseScore } from "@/lib/ai/eval/types";

/**
 * PRD 5.2-G-A result categories.
 * ERROR = technical/provider — must NOT count as quality pass or fail.
 */
export const CASE_OUTCOMES = [
  "PASS",
  "CRIT",
  "FAIL",
  "ERROR",
  "SKIP",
] as const;

export type CaseOutcome = (typeof CASE_OUTCOMES)[number];

/**
 * Map score + provider failure → PRD outcome label.
 */
export function resolveCaseOutcome(input: {
  skipped?: boolean;
  skipReason?: string;
  providerFailure: boolean;
  failureCategory: FailureCategory;
  score: CaseScore;
  qualityCriticalFail: boolean;
}): { outcome: CaseOutcome; reason: string } {
  if (input.skipped) {
    return {
      outcome: "SKIP",
      reason: input.skipReason ?? "Case skipped",
    };
  }
  if (input.providerFailure) {
    return {
      outcome: "ERROR",
      reason: `Provider/technical: ${input.failureCategory}`,
    };
  }
  if (input.failureCategory === "invalid_or_empty_output") {
    return {
      outcome: "CRIT",
      reason: "Empty or invalid model output",
    };
  }
  if (input.score.passed) {
    return { outcome: "PASS", reason: "All required assertions passed" };
  }
  if (input.qualityCriticalFail || input.score.criticalFail) {
    return {
      outcome: "CRIT",
      reason: "Critical financial safety / integrity assertion failed",
    };
  }
  return {
    outcome: "FAIL",
    reason: "Non-critical assertion(s) failed",
  };
}

export function countOutcomes(
  outcomes: CaseOutcome[]
): Record<CaseOutcome, number> {
  const counts: Record<CaseOutcome, number> = {
    PASS: 0,
    CRIT: 0,
    FAIL: 0,
    ERROR: 0,
    SKIP: 0,
  };
  for (const o of outcomes) counts[o] += 1;
  return counts;
}
