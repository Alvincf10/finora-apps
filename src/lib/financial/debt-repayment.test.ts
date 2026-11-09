import { describe, expect, it } from "vitest";
import {
  REASONABLE_DEBT_BURDEN_PCT,
  monthlyInstallment,
  remainingInstallments,
  simulateDebtRepayment,
} from "@/lib/financial/debt-repayment";

const debtA = {
  debtId: "a",
  name: "Small",
  remainingAmount: 1_000_000,
  currency: "IDR" as const,
  plannedPayment: 200_000,
};

const debtB = {
  debtId: "b",
  name: "Large",
  remainingAmount: 5_000_000,
  currency: "IDR" as const,
  minimumPayment: 500_000,
  interestRate: 24,
};

describe("monthlyInstallment", () => {
  it("prefers planned over minimum", () => {
    expect(
      monthlyInstallment({
        ...debtA,
        minimumPayment: 50_000,
      })
    ).toBe(200_000);
    expect(monthlyInstallment({ ...debtB, plannedPayment: null })).toBe(500_000);
  });

  it("returns 0 when both missing", () => {
    expect(
      monthlyInstallment({
        debtId: "x",
        name: "x",
        remainingAmount: 1,
        currency: "IDR",
      })
    ).toBe(0);
  });
});

describe("remainingInstallments", () => {
  it("ceil-divides remaining by installment", () => {
    expect(remainingInstallments(debtA)).toBe(5);
  });

  it("returns 0 when already paid off", () => {
    expect(
      remainingInstallments({ ...debtA, remainingAmount: 0 })
    ).toBe(0);
  });

  it("falls back to installmentMonths without payment amount", () => {
    expect(
      remainingInstallments({
        debtId: "c",
        name: "c",
        remainingAmount: 3_000_000,
        currency: "IDR",
        installmentMonths: 12,
      })
    ).toBe(12);
  });

  it("returns null when no payment schedule", () => {
    expect(
      remainingInstallments({
        debtId: "d",
        name: "d",
        remainingAmount: 1_000_000,
        currency: "IDR",
      })
    ).toBeNull();
  });
});

describe("simulateDebtRepayment", () => {
  it("covers minimums first with snowball extra to smallest balance", () => {
    const r = simulateDebtRepayment({
      debts: [debtB, debtA],
      monthlyBudget: 1_000_000,
      strategy: "SNOWBALL",
      currency: "IDR",
    });
    expect(r.minimumTotal).toBe(700_000);
    expect(r.allocatedTotal).toBe(1_000_000);
    expect(r.leftoverBudget).toBe(0);
    const small = r.allocations.find((a) => a.debtId === "a");
    const large = r.allocations.find((a) => a.debtId === "b");
    expect(small!.allocatedPayment).toBeGreaterThan(small!.minimumDue);
    expect(large!.allocatedPayment).toBe(large!.minimumDue);
  });

  it("pro-rates minimums when budget is below minimumTotal", () => {
    const r = simulateDebtRepayment({
      debts: [debtA, debtB],
      monthlyBudget: 300_000,
      currency: "IDR",
    });
    expect(r.allocatedTotal).toBeLessThanOrEqual(300_000);
    expect(r.tips.some((t) => t.includes("minimum"))).toBe(true);
  });

  it("computes burden percent against income", () => {
    const r = simulateDebtRepayment({
      debts: [debtA],
      monthlyBudget: 200_000,
      income: 10_000_000,
      currency: "IDR",
    });
    expect(r.reasonableCap).toBe(
      Math.round((10_000_000 * REASONABLE_DEBT_BURDEN_PCT) / 100)
    );
    expect(r.burdenPercent).toBe(2);
    expect(r.withinReasonableLimit).toBe(true);
  });

  it("ignores debts in other currencies", () => {
    const r = simulateDebtRepayment({
      debts: [{ ...debtA, currency: "EUR" }, debtB],
      monthlyBudget: 2_000_000,
      currency: "IDR",
    });
    expect(r.allocations).toHaveLength(1);
    expect(r.allocations[0].debtId).toBe("b");
  });

  it("uses proportional extra split when strategy is PROPORTIONAL", () => {
    const r = simulateDebtRepayment({
      debts: [debtA, debtB],
      monthlyBudget: 900_000,
      strategy: "PROPORTIONAL",
      currency: "IDR",
    });
    expect(r.strategy).toBe("PROPORTIONAL");
    expect(r.allocatedTotal).toBeGreaterThanOrEqual(899_999);
    expect(r.allocatedTotal).toBeLessThanOrEqual(900_000);
  });
});
