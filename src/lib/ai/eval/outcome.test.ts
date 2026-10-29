import { describe, expect, it } from "vitest";
import {
  countOutcomes,
  resolveCaseOutcome,
} from "@/lib/ai/eval/outcome";
import type { CaseScore } from "@/lib/ai/eval/types";

function score(partial: Partial<CaseScore>): CaseScore {
  return {
    caseId: "t",
    category: "incomplete_data",
    passed: false,
    criticalFail: false,
    metrics: [],
    notes: [],
    ...partial,
  };
}

describe("resolveCaseOutcome", () => {
  it("maps provider failure to ERROR", () => {
    const r = resolveCaseOutcome({
      providerFailure: true,
      failureCategory: "provider_rate_limit_timeout",
      score: score({}),
      qualityCriticalFail: false,
    });
    expect(r.outcome).toBe("ERROR");
  });

  it("maps critical quality fail to CRIT", () => {
    const r = resolveCaseOutcome({
      providerFailure: false,
      failureCategory: "numeric_or_factual",
      score: score({ criticalFail: true, passed: false }),
      qualityCriticalFail: true,
    });
    expect(r.outcome).toBe("CRIT");
  });

  it("maps soft fail to FAIL", () => {
    const r = resolveCaseOutcome({
      providerFailure: false,
      failureCategory: "soft_quality",
      score: score({ passed: false, criticalFail: false }),
      qualityCriticalFail: false,
    });
    expect(r.outcome).toBe("FAIL");
  });

  it("maps pass to PASS", () => {
    const r = resolveCaseOutcome({
      providerFailure: false,
      failureCategory: "none",
      score: score({ passed: true }),
      qualityCriticalFail: false,
    });
    expect(r.outcome).toBe("PASS");
  });

  it("maps skip", () => {
    const r = resolveCaseOutcome({
      skipped: true,
      skipReason: "quota",
      providerFailure: false,
      failureCategory: "none",
      score: score({}),
      qualityCriticalFail: false,
    });
    expect(r.outcome).toBe("SKIP");
    expect(r.reason).toContain("quota");
  });

  it("countOutcomes tallies", () => {
    expect(countOutcomes(["PASS", "PASS", "ERROR", "CRIT"]).PASS).toBe(2);
  });
});
