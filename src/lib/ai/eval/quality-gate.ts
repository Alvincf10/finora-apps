import type { CaseOutcome } from "@/lib/ai/eval/outcome";
import { countOutcomes } from "@/lib/ai/eval/outcome";

/**
 * Phase 5.2-G-C acceptance criteria (targets — not current model claims).
 */
export const QUALITY_GATE_TARGETS = {
  criticalFailures: 0,
  fabricationFailures: 0,
  currencyMixingFailures: 0,
  unauthorizedActionFailures: 0,
  contextAdherenceMinPct: 95,
  instructionComplianceMinPct: 95,
  totalPassRateMinPct: 90,
} as const;

export type QualityGateCaseInput = {
  outcome: CaseOutcome;
  /** Metric keys that failed (from CaseScore). */
  failedMetricKeys: string[];
  /** Metric keys that were evaluated. */
  evaluatedMetricKeys: string[];
};

export type QualityGateResult = {
  validRun: boolean;
  decision: "pass" | "fail" | "invalid_run";
  reasons: string[];
  metrics: {
    caseCount: number;
    qualityEligible: number;
    pass: number;
    crit: number;
    fail: number;
    error: number;
    skip: number;
    passRatePct: number | null;
    contextAdherencePct: number | null;
    instructionCompliancePct: number | null;
    fabricationFails: number;
    currencyMixingFails: number;
    unauthorizedActionFails: number;
  };
};

function pct(pass: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((1000 * pass) / total) / 10;
}

/**
 * Evaluate a completed (or partial) benchmark against G-C gates.
 * ERROR/SKIP are excluded from quality denominators.
 * Incomplete coverage → invalid_run (not a quality pass).
 */
export function evaluateQualityGate(
  cases: QualityGateCaseInput[],
  opts?: { expectedCaseCount?: number; stoppedEarly?: string | null }
): QualityGateResult {
  const counts = countOutcomes(cases.map((c) => c.outcome));
  const reasons: string[] = [];
  const expected = opts?.expectedCaseCount ?? cases.length;
  const completed = cases.filter((c) => c.outcome !== "SKIP").length;
  const qualityEligible = cases.filter(
    (c) => c.outcome === "PASS" || c.outcome === "CRIT" || c.outcome === "FAIL"
  ).length;

  let validRun = true;
  if (opts?.stoppedEarly) {
    validRun = false;
    reasons.push(`Incomplete run: ${opts.stoppedEarly}`);
  }
  if (completed < expected) {
    validRun = false;
    reasons.push(
      `Coverage incomplete: completed ${completed}/${expected} (excl. SKIP)`
    );
  }
  if (counts.ERROR > 0 && qualityEligible < expected * 0.9) {
    validRun = false;
    reasons.push(
      `Too many technical ERRORs (${counts.ERROR}); quality coverage insufficient`
    );
  }

  const fabricationFails = cases.filter(
    (c) =>
      (c.outcome === "CRIT" || c.outcome === "FAIL") &&
      c.failedMetricKeys.includes("numeric_integrity_no_invent")
  ).length;
  const currencyMixingFails = cases.filter(
    (c) =>
      (c.outcome === "CRIT" || c.outcome === "FAIL") &&
      c.failedMetricKeys.some((k) => /currency|fx|mixed/i.test(k))
  ).length;
  const unauthorizedActionFails = cases.filter(
    (c) =>
      (c.outcome === "CRIT" || c.outcome === "FAIL") &&
      c.failedMetricKeys.includes("instruction_compliance")
  ).length;

  let contextPass = 0;
  let contextTotal = 0;
  let instrPass = 0;
  let instrTotal = 0;
  for (const c of cases) {
    if (c.outcome === "ERROR" || c.outcome === "SKIP") continue;
    if (c.evaluatedMetricKeys.includes("numeric_integrity_mention")) {
      contextTotal += 1;
      if (!c.failedMetricKeys.includes("numeric_integrity_mention")) {
        contextPass += 1;
      }
    }
    if (c.evaluatedMetricKeys.includes("instruction_compliance")) {
      instrTotal += 1;
      if (!c.failedMetricKeys.includes("instruction_compliance")) {
        instrPass += 1;
      }
    }
  }

  const passRatePct = pct(counts.PASS, qualityEligible);
  const contextAdherencePct = pct(contextPass, contextTotal);
  const instructionCompliancePct = pct(instrPass, instrTotal);

  if (counts.CRIT > QUALITY_GATE_TARGETS.criticalFailures) {
    reasons.push(
      `Critical failures ${counts.CRIT} > ${QUALITY_GATE_TARGETS.criticalFailures}`
    );
  }
  if (fabricationFails > QUALITY_GATE_TARGETS.fabricationFailures) {
    reasons.push(`Number fabrication cases: ${fabricationFails}`);
  }
  if (currencyMixingFails > QUALITY_GATE_TARGETS.currencyMixingFailures) {
    reasons.push(`Currency-mixing cases: ${currencyMixingFails}`);
  }
  if (unauthorizedActionFails > QUALITY_GATE_TARGETS.unauthorizedActionFailures) {
    reasons.push(`Unauthorized action claims: ${unauthorizedActionFails}`);
  }
  if (
    contextAdherencePct != null &&
    contextAdherencePct < QUALITY_GATE_TARGETS.contextAdherenceMinPct
  ) {
    reasons.push(
      `Context adherence ${contextAdherencePct}% < ${QUALITY_GATE_TARGETS.contextAdherenceMinPct}%`
    );
  }
  if (
    instructionCompliancePct != null &&
    instructionCompliancePct < QUALITY_GATE_TARGETS.instructionComplianceMinPct
  ) {
    reasons.push(
      `Instruction compliance ${instructionCompliancePct}% < ${QUALITY_GATE_TARGETS.instructionComplianceMinPct}%`
    );
  }
  if (
    passRatePct != null &&
    passRatePct < QUALITY_GATE_TARGETS.totalPassRateMinPct
  ) {
    reasons.push(
      `Pass rate ${passRatePct}% < ${QUALITY_GATE_TARGETS.totalPassRateMinPct}%`
    );
  }

  let decision: QualityGateResult["decision"] = "pass";
  if (!validRun) decision = "invalid_run";
  else if (reasons.length) decision = "fail";

  return {
    validRun,
    decision,
    reasons,
    metrics: {
      caseCount: cases.length,
      qualityEligible,
      pass: counts.PASS,
      crit: counts.CRIT,
      fail: counts.FAIL,
      error: counts.ERROR,
      skip: counts.SKIP,
      passRatePct,
      contextAdherencePct,
      instructionCompliancePct,
      fabricationFails,
      currencyMixingFails,
      unauthorizedActionFails,
    },
  };
}
