import { describe, expect, it } from "vitest";
import {
  LADDER_CASH_TARGET_IDR,
  applySequentialGate,
  calculateEligibleLiquidBalanceIdr,
  calculateEmergencyCoverage,
  calculateInvestmentRate,
  calculateLadderProgress,
  resolveEssentialMonthly,
  syncStarterGoalAmount,
} from "@/lib/financial/wealth-ladder-math";

describe("wealth ladder sequential gate", () => {
  it("does not credit later steps when earlier incomplete", () => {
    const gates = applySequentialGate([
      { step: 1, conditionMet: false },
      { step: 2, conditionMet: false },
      { step: 3, conditionMet: false },
      { step: 4, conditionMet: false },
      { step: 5, conditionMet: false },
      { step: 6, conditionMet: true },
      { step: 7, conditionMet: false },
    ]);
    const progress = calculateLadderProgress(gates);
    expect(progress.progressPercent).toBe(0);
    expect(progress.activeStep).toBe(1);
    expect(gates[5].status).toBe("LOCKED");
    expect(gates[5].conditionMet).toBe(true);
    expect(gates[5].creditedComplete).toBe(false);
  });

  it("credits only sequential prefix", () => {
    const gates = applySequentialGate([
      { step: 1, conditionMet: true },
      { step: 2, conditionMet: true },
      { step: 3, conditionMet: false },
      { step: 4, conditionMet: true },
      { step: 5, conditionMet: true },
      { step: 6, conditionMet: true },
      { step: 7, conditionMet: true },
    ]);
    expect(calculateLadderProgress(gates).completedRequiredSteps).toBe(2);
    expect(gates[2].status).toBe("FOCUS");
    expect(gates[3].status).toBe("LOCKED");
  });

  it("UNKNOWN blocks subsequent steps", () => {
    const gates = applySequentialGate([
      { step: 1, conditionMet: true },
      { step: 2, conditionMet: true },
      { step: 3, conditionMet: "UNKNOWN" },
      { step: 4, conditionMet: true },
    ]);
    expect(gates[2].status).toBe("UNKNOWN");
    expect(gates[3].status).toBe("LOCKED");
    expect(calculateLadderProgress(gates).activeStep).toBe(3);
  });

  it("NOT_APPLICABLE is skipped in denominator", () => {
    const gates = applySequentialGate([
      { step: 1, conditionMet: true },
      { step: 2, conditionMet: true },
      { step: 3, conditionMet: true },
      { step: 4, conditionMet: true },
      { step: 5, conditionMet: false, notApplicable: true },
      { step: 6, conditionMet: false },
      { step: 7, conditionMet: false },
    ]);
    expect(gates[4].status).toBe("NOT_APPLICABLE");
    expect(gates[5].status).toBe("FOCUS");
    const progress = calculateLadderProgress(gates);
    expect(progress.applicableRequiredSteps).toBe(6);
    expect(progress.completedRequiredSteps).toBe(4);
  });
});

describe("wealth ladder helpers", () => {
  it("starter sync is contribution-only", () => {
    expect(syncStarterGoalAmount(0, 3_420_000)).toBe(0);
    expect(syncStarterGoalAmount(1_000_000, 4_000_000)).toBe(1_000_000);
    expect(syncStarterGoalAmount(12_000_000, 20_000_000)).toBe(
      LADDER_CASH_TARGET_IDR
    );
  });

  it("eligible liquid IDR only", () => {
    expect(
      calculateEligibleLiquidBalanceIdr([
        {
          currency: "IDR",
          type: "BANK",
          currentBalance: 5_000_000,
          isActive: true,
        },
        { currency: "EUR", type: "BANK", currentBalance: 9999, isActive: true },
      ])
    ).toBe(5_000_000);
  });

  it("emergency / invest UNKNOWN when denominator missing", () => {
    expect(calculateEmergencyCoverage(10_000_000, 0).conditionMet).toBe(
      "UNKNOWN"
    );
    expect(calculateInvestmentRate(1_000_000, 0).conditionMet).toBe("UNKNOWN");
  });

  it("essentials fallback from emergency goal target", () => {
    const resolved = resolveEssentialMonthly({
      essentialFromCategories: 0,
      averageFixedExpense: 0,
      averageMonthlyExpense: 0,
      emergencyGoalTarget: 30_000_000,
    });
    expect(resolved.source).toBe("goal_target");
    expect(resolved.essentialMonthly).toBe(10_000_000);
  });
});
