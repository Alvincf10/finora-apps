import { describe, expect, it } from "vitest";
import {
  buildGoldRecommendation,
  inferMonthlyRatePercent,
  monthlyInterestDue,
  projectGoldMonths,
} from "./gold-installment";

describe("inferMonthlyRatePercent", () => {
  it("infers 3% from first month bracelet data", () => {
    expect(inferMonthlyRatePercent(44_400_000, 1_332_000)).toBe(3);
  });
});

describe("monthlyInterestDue", () => {
  it("matches month-2 observed bunga", () => {
    // After pokok 1_268_000 paid
    expect(monthlyInterestDue(43_132_000, 3)).toBe(1_293_960);
  });

  it("estimates next month after 10jt pokok", () => {
    expect(monthlyInterestDue(33_132_000, 3)).toBe(993_960);
  });
});

describe("projectGoldMonths", () => {
  it("projects this month + 2 ahead", () => {
    const rows = projectGoldMonths({
      remainingPrincipal: 33_132_000,
      monthlyRatePercent: 3,
      principalPayPerMonth: 8_283_000,
      monthsAhead: 2,
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]!.interestDue).toBe(993_960);
    expect(rows[0]!.remainingPrincipal).toBe(33_132_000);
    // after paying 8.283jt pokok
    expect(rows[1]!.remainingPrincipal).toBe(33_132_000 - 8_283_000);
    expect(rows[1]!.interestDue).toBe(
      monthlyInterestDue(33_132_000 - 8_283_000, 3)
    );
  });
});

describe("buildGoldRecommendation", () => {
  it("builds three scenarios with same interest due", () => {
    const rec = buildGoldRecommendation({
      originalPrincipal: 44_400_000,
      remainingPrincipal: 33_132_000,
      monthlyRatePercent: 3,
      principalPaid: 11_268_000,
      interestPaid: 2_627_000,
      paidRecorded: 13_895_000,
      avgPrincipalPerPayment: 5_634_000,
    });
    expect(rec.interestDueNow).toBe(993_960);
    expect(rec.scenarios).toHaveLength(3);
    expect(rec.scenarios.every((s) => s.interestDue === 993_960)).toBe(true);
    expect(rec.scenarios[0]!.nextInterestAfter).toBeLessThan(
      rec.scenarios[2]!.nextInterestAfter
    );
  });
});
