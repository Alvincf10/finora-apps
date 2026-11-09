import { describe, expect, it } from "vitest";
import {
  deriveMonthlyInstallment,
  monthlyDebtObligation,
  resolveDebtDueWindowEnd,
} from "@/lib/financial/debts-due";

describe("resolveDebtDueWindowEnd", () => {
  it("extends cycle end to calendar month-end when earlier", () => {
    const cycleEnd = new Date(2026, 10, 24, 23, 59, 59, 999);
    const end = resolveDebtDueWindowEnd(cycleEnd);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(10);
    expect(end.getDate()).toBe(30);
  });

  it("keeps cycle end when it is already month-end", () => {
    const cycleEnd = new Date(2026, 0, 31, 12, 0, 0);
    const end = resolveDebtDueWindowEnd(cycleEnd);
    expect(end.getDate()).toBe(31);
  });
});

describe("deriveMonthlyInstallment", () => {
  it("returns nulls when nothing left", () => {
    expect(deriveMonthlyInstallment({ remainingAmount: 0 })).toEqual({
      monthlyPayment: null,
      installmentMonths: null,
    });
  });

  it("prefers explicit planned or minimum payment", () => {
    expect(
      deriveMonthlyInstallment({
        remainingAmount: 12_000_000,
        plannedPayment: 1_000_000,
      })
    ).toEqual({ monthlyPayment: 1_000_000, installmentMonths: 12 });
    expect(
      deriveMonthlyInstallment({
        remainingAmount: 6_000_000,
        minimumPayment: 500_000,
      }).monthlyPayment
    ).toBe(500_000);
  });

  it("divides by installmentMonths when no explicit payment", () => {
    expect(
      deriveMonthlyInstallment({
        remainingAmount: 12_000_000,
        installmentMonths: 10,
      })
    ).toEqual({ monthlyPayment: 1_200_000, installmentMonths: 10 });
  });

  it("returns null payment when no schedule hints", () => {
    expect(
      deriveMonthlyInstallment({ remainingAmount: 5_000_000 })
    ).toEqual({ monthlyPayment: null, installmentMonths: null });
  });
});

describe("monthlyDebtObligation", () => {
  const start = new Date(2026, 9, 1);
  const end = new Date(2026, 9, 31, 23, 59, 59, 999);

  it("caps installment due at remaining principal", () => {
    const r = monthlyDebtObligation(
      { remainingAmount: 800_000, plannedPayment: 1_000_000 },
      start,
      end
    );
    expect(r.dueAmount).toBe(800_000);
    expect(r.isInstallment).toBe(true);
  });

  it("requires full remaining when due in period without installment", () => {
    const r = monthlyDebtObligation(
      {
        remainingAmount: 3_000_000,
        dueDate: new Date(2026, 9, 15),
      },
      start,
      end
    );
    expect(r.dueAmount).toBe(3_000_000);
    expect(r.isInstallment).toBe(false);
  });

  it("treats overdue before period end as due", () => {
    const r = monthlyDebtObligation(
      {
        remainingAmount: 2_000_000,
        dueDate: new Date(2026, 8, 1),
      },
      start,
      end
    );
    expect(r.dueAmount).toBe(2_000_000);
  });

  it("returns zero when not due and no installment", () => {
    const r = monthlyDebtObligation(
      {
        remainingAmount: 2_000_000,
        dueDate: new Date(2026, 11, 1),
      },
      start,
      end
    );
    expect(r.dueAmount).toBe(0);
  });
});
