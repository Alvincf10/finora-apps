import { describe, expect, it } from "vitest";
import {
  compareScenarioEvaluations,
  evaluateDecisionScenario,
  previewDebtTenor,
} from "@/lib/financial/decision/scenario-engine";
import {
  DECISION_LAB_RULES_VERSION,
  type ScenarioBaselineSnapshot,
} from "@/lib/financial/decision/types";

const baseline: ScenarioBaselineSnapshot = {
  capturedAt: "2026-10-26T00:00:00.000Z",
  period: { year: 2026, month: 10 },
  currency: "IDR",
  income: 10_000_000,
  expenses: 6_000_000,
  debtPayment: 1_000_000,
  savings: 3_000_000,
  debtBalance: 12_000_000,
  debtInterestRate: null,
  startingBalance: 5_000_000,
  liquidAssets: 5_000_000,
  netWorth: 8_000_000,
  essentialMonthly: 4_000_000,
  emergencyFund: 8_000_000,
  rulesVersion: DECISION_LAB_RULES_VERSION,
};

describe("evaluateDecisionScenario", () => {
  it("is deterministic and does not invent mutations", () => {
    const a = evaluateDecisionScenario(baseline, {
      debtPaymentOverride: 2_000_000,
    });
    const b = evaluateDecisionScenario(baseline, {
      debtPaymentOverride: 2_000_000,
    });
    expect(a).toEqual(b);
    expect(a.assumptions.some((s) => s.includes("does not mutate"))).toBe(true);
  });

  it("uses startingBalance + cashFlow for ending balance", () => {
    const result = evaluateDecisionScenario(baseline, {});
    // 10M - 6M - 1M = 3M cash flow; ending = 5M + 3M
    expect(result.cashFlow).toBe(3_000_000);
    expect(result.endingBalance).toBe(8_000_000);
  });

  it("applies cash buffer and flags shortfall", () => {
    const result = evaluateDecisionScenario(baseline, {
      expensesOverride: 20_000_000,
      cashBufferOverride: 1_000_000,
    });
    expect(result.cashShortfall).toBe(true);
    expect(result.endingBalance).toBe(
      baseline.startingBalance + (10_000_000 - 20_000_000 - 1_000_000) - 1_000_000
    );
  });

  it("reports deltas vs baseline", () => {
    const result = evaluateDecisionScenario(baseline, {
      incomeOverride: 12_000_000,
    });
    expect(result.deltas.cashFlow).toBe(2_000_000);
    expect(result.changedInputs).toContain("income");
  });

  it("computes emergency coverage when essentials known", () => {
    const result = evaluateDecisionScenario(baseline, {});
    expect(result.emergencyCoverageMonths).not.toBeNull();
    expect(result.emergencyCoverageMonths!).toBeGreaterThan(0);
  });
});

describe("compareScenarioEvaluations", () => {
  it("picks best cash flow and ending balance", () => {
    const baseEval = evaluateDecisionScenario(baseline, {});
    const alt = evaluateDecisionScenario(baseline, {
      expensesOverride: 4_000_000,
    });
    const cmp = compareScenarioEvaluations([
      {
        id: "base",
        name: "Baseline",
        isBaseline: true,
        evaluation: baseEval,
      },
      { id: "alt", name: "Lean spend", isBaseline: false, evaluation: alt },
    ]);
    expect(cmp.bestCashFlowId).toBe("alt");
    expect(cmp.bestEndingBalanceId).toBe("alt");
  });
});

describe("previewDebtTenor", () => {
  it("previews without claiming ledger mutation", () => {
    const preview = previewDebtTenor({
      remainingAmount: 6_000_000,
      months: 6,
    });
    expect(preview.monthlyPayment).toBe(1_000_000);
    expect(preview.months).toBe(6);
    expect(preview.mutatesLedger).toBe(false);
  });
});
