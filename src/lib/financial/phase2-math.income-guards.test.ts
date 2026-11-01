import { describe, expect, it } from "vitest";
import {
  countPositive,
  meanPositive,
  shouldFlagIncomeChange,
} from "./phase2-math";

describe("meanPositive", () => {
  it("ignores empty months so averages are not diluted", () => {
    expect(Math.round(meanPositive([0, 0, 710_000]))).toBe(710_000);
    expect(Math.round(meanPositive([0, 50_000, 0]))).toBe(50_000);
    expect(meanPositive([0, 0, 0])).toBe(0);
  });
});

describe("countPositive", () => {
  it("counts only months with activity", () => {
    expect(countPositive([0, 10_400_000, 0])).toBe(1);
    expect(countPositive([9_000_000, 10_000_000, 10_400_000])).toBe(3);
  });
});

describe("shouldFlagIncomeChange", () => {
  it("suppresses spike when history has fewer than 2 positive months", () => {
    expect(
      shouldFlagIncomeChange({
        currentIncome: 10_400_000,
        averageIncome: 236_667,
        positiveHistoryMonths: 1,
        monthlySalary: 10_400_000,
      })
    ).toBe(false);
  });

  it("suppresses when history average is far below configured salary", () => {
    expect(
      shouldFlagIncomeChange({
        currentIncome: 10_400_000,
        averageIncome: 710_000,
        positiveHistoryMonths: 2,
        monthlySalary: 10_400_000,
      })
    ).toBe(false);
  });

  it("flags a real drop vs solid history", () => {
    expect(
      shouldFlagIncomeChange({
        currentIncome: 5_000_000,
        averageIncome: 10_000_000,
        positiveHistoryMonths: 3,
        monthlySalary: 10_000_000,
      })
    ).toBe(true);
  });
});
