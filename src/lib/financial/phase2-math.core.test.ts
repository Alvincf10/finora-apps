import { describe, expect, it } from "vitest";
import {
  weightedAverage3,
  mean,
  stdDev,
  detectSpendingTrend,
  detectAnomaly,
  projectCategorySpend,
  daysInMonth,
  calculateEmergencyCoverage,
  calculateDebtScenario,
  forecastMonthlyCashflow,
  runWhatIf,
  defaultClassification,
  defaultNature,
} from "@/lib/financial/phase2-math";

describe("weightedAverage3", () => {
  it("returns 0 for empty", () => {
    expect(weightedAverage3([])).toBe(0);
  });

  it("weights newest months higher", () => {
    expect(weightedAverage3([100])).toBe(100);
    expect(weightedAverage3([100, 0])).toBe(60);
    expect(weightedAverage3([100, 100, 100])).toBe(100);
    expect(weightedAverage3([200, 100, 0])).toBe(130);
  });
});

describe("mean / stdDev", () => {
  it("mean of empty is 0", () => {
    expect(mean([])).toBe(0);
    expect(mean([10, 20, 30])).toBe(20);
  });

  it("stdDev needs at least 2 samples (sample / n-1)", () => {
    expect(stdDev([])).toBe(0);
    expect(stdDev([5])).toBe(0);
    // sample stdev of [2,4,4,4,5,5,7,9] ≈ 2.138
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2);
  });
});

describe("detectSpendingTrend", () => {
  it("flags insufficient history", () => {
    expect(detectSpendingTrend(100, [50]).trend).toBe("INSUFFICIENT_DATA");
  });

  it("detects increase / decrease / stable", () => {
    expect(detectSpendingTrend(200, [100, 100, 100]).trend).toBe("INCREASING");
    expect(detectSpendingTrend(50, [100, 100, 100]).trend).toBe("DECREASING");
    expect(detectSpendingTrend(105, [100, 100, 100]).trend).toBe("STABLE");
  });
});

describe("detectAnomaly", () => {
  it("does not flag first spend with thin history", () => {
    expect(detectAnomaly(1_000_000, [0, 0]).isAnomaly).toBe(false);
    expect(detectAnomaly(1_000_000, [100_000]).isAnomaly).toBe(false);
  });

  it("flags clear spikes above baseline", () => {
    const hist = [100, 110, 90, 105, 95];
    expect(detectAnomaly(500, hist).isAnomaly).toBe(true);
    expect(detectAnomaly(100, hist).isAnomaly).toBe(false);
  });
});

describe("projectCategorySpend / daysInMonth", () => {
  it("projects pace to month end", () => {
    expect(projectCategorySpend(300_000, 10, 30)).toBe(900_000);
    expect(projectCategorySpend(100, 0, 30)).toBe(100);
  });

  it("daysInMonth handles leap February", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2026, 11)).toBe(30);
  });
});

describe("calculateEmergencyCoverage / debt scenario", () => {
  it("returns null when essentials missing", () => {
    expect(calculateEmergencyCoverage(1_000_000, 0)).toBeNull();
  });

  it("computes months of coverage", () => {
    expect(calculateEmergencyCoverage(6_000_000, 2_000_000)).toBe(3);
  });

  it("debt without rate uses simple months", () => {
    const s = calculateDebtScenario(1_000_000, 100_000, null);
    expect(s.estimatedMonths).toBe(10);
    expect(s.estimatedInterest).toBeNull();
  });

  it("debt payment below interest is unreachable", () => {
    const s = calculateDebtScenario(1_000_000, 1_000, 24);
    expect(s.estimatedMonths).toBeNull();
    expect(s.note).toMatch(/interest/i);
  });
});

describe("forecastMonthlyCashflow / runWhatIf", () => {
  it("forecast nets savings and runway fields", () => {
    const f = forecastMonthlyCashflow({
      projectedIncome: 10_000_000,
      projectedExpenses: 6_000_000,
      projectedDebtPayment: 1_000_000,
      startingBalance: 5_000_000,
      currency: "IDR",
      historicalMonthsAvailable: 3,
      incomeStable: true,
    });
    expect(f.projectedSavings).toBe(3_000_000);
    expect(f.currency).toBe("IDR");
  });

  it("runWhatIf applies income/expense/debt overrides", () => {
    const result = runWhatIf(
      {
        income: 10_000_000,
        expenses: 8_000_000,
        debtPayment: 1_000_000,
        savings: 1_000_000,
        debtBalance: 5_000_000,
      },
      {
        incomeOverride: 10_500_000,
        expenseOverrides: [{ categoryId: "x", amount: 7_000_000 }],
        debtPaymentOverride: 1_200_000,
      }
    );
    expect(result.cashFlow).toBe(10_500_000 - 7_000_000 - 1_200_000);
    expect(result.savings).toBe(2_300_000);
    expect(result.debtPayoffMonths).toBeGreaterThan(0);
  });
});

describe("defaultClassification / defaultNature", () => {
  it("classifies common category names", () => {
    expect(defaultClassification("Food")).toBe("ESSENTIAL");
    expect(defaultClassification("Entertainment")).toBe("DISCRETIONARY");
    expect(defaultClassification("Debt Payment")).toBe("IMPORTANT");
    expect(defaultClassification("Mystery")).toBe("UNKNOWN");
  });

  it("marks rent/subscription as FIXED", () => {
    expect(defaultNature("Rent", "ESSENTIAL")).toBe("FIXED");
    expect(defaultNature("Coffee", "DISCRETIONARY")).toBe("VARIABLE");
  });
});
