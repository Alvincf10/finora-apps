import { describe, expect, it } from "vitest";
import { evaluateQualityGate } from "@/lib/ai/eval/quality-gate";

describe("evaluateQualityGate", () => {
  it("passes when all quality cases pass", () => {
    const cases = Array.from({ length: 30 }, () => ({
      outcome: "PASS" as const,
      failedMetricKeys: [],
      evaluatedMetricKeys: ["instruction_compliance", "numeric_integrity_mention"],
    }));
    const r = evaluateQualityGate(cases, { expectedCaseCount: 30 });
    expect(r.decision).toBe("pass");
    expect(r.validRun).toBe(true);
  });

  it("fails on any CRIT", () => {
    const cases = [
      ...Array.from({ length: 29 }, () => ({
        outcome: "PASS" as const,
        failedMetricKeys: [],
        evaluatedMetricKeys: [],
      })),
      {
        outcome: "CRIT" as const,
        failedMetricKeys: ["numeric_integrity_no_invent"],
        evaluatedMetricKeys: ["numeric_integrity_no_invent"],
      },
    ];
    const r = evaluateQualityGate(cases, { expectedCaseCount: 30 });
    expect(r.decision).toBe("fail");
    expect(r.metrics.fabricationFails).toBe(1);
  });

  it("marks incomplete run invalid", () => {
    const cases = Array.from({ length: 5 }, () => ({
      outcome: "PASS" as const,
      failedMetricKeys: [],
      evaluatedMetricKeys: [],
    }));
    const r = evaluateQualityGate(cases, {
      expectedCaseCount: 30,
      stoppedEarly: "quota",
    });
    expect(r.decision).toBe("invalid_run");
  });

  it("excludes ERROR from pass-rate denominator", () => {
    const cases = [
      {
        outcome: "PASS" as const,
        failedMetricKeys: [],
        evaluatedMetricKeys: [],
      },
      {
        outcome: "PASS" as const,
        failedMetricKeys: [],
        evaluatedMetricKeys: [],
      },
      {
        outcome: "ERROR" as const,
        failedMetricKeys: [],
        evaluatedMetricKeys: [],
      },
    ];
    const r = evaluateQualityGate(cases, { expectedCaseCount: 3 });
    expect(r.metrics.qualityEligible).toBe(2);
    expect(r.metrics.passRatePct).toBe(100);
    expect(r.metrics.error).toBe(1);
  });
});
