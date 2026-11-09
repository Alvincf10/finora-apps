import { describe, expect, it } from "vitest";
import {
  resolveExpectedIncome,
  type PlanningBaselines,
} from "@/lib/financial/planning-baselines";

function baselines(monthlySalary: number): PlanningBaselines {
  return {
    currency: "IDR",
    monthlySalary,
    incomeSource: monthlySalary > 0 ? "SALARY" : "HISTORY",
    fixedCostsTotal: 0,
    debtDueTotal: 0,
    periodStart: "2026-11-01T00:00:00.000Z",
    periodEnd: "2026-11-30T00:00:00.000Z",
    cycleLabel: "Nov 2026",
  };
}

describe("resolveExpectedIncome", () => {
  it("prefers Settings salary and takes max with history and MTD when salary is set", () => {
    expect(resolveExpectedIncome(baselines(10_000_000), 8_000_000, 3_000_000)).toBe(
      10_000_000
    );
    expect(resolveExpectedIncome(baselines(10_000_000), 12_000_000, 3_000_000)).toBe(
      12_000_000
    );
    expect(resolveExpectedIncome(baselines(10_000_000), 5_000_000, 11_000_000)).toBe(
      11_000_000
    );
  });

  it("uses max of history and month-to-date when salary is unset", () => {
    expect(resolveExpectedIncome(baselines(0), 7_500_000, 4_000_000)).toBe(7_500_000);
    expect(resolveExpectedIncome(baselines(0), 4_000_000, 6_200_000)).toBe(6_200_000);
  });
});
