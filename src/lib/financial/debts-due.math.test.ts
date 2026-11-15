import { describe, expect, it } from "vitest";
import {
  deriveMonthlyInstallment,
  monthlyDebtObligation,
  paidTowardDue,
} from "@/lib/financial/debts-due";
import {
  nextInstallmentAmount,
  nextInstallmentDueDate,
  resolveDebtDueWindowEnd,
  splitInstallmentDebtLists,
} from "@/lib/financial/debts-due-split";

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

  it("does not charge installment before its due date", () => {
    const r = monthlyDebtObligation(
      {
        remainingAmount: 473_801,
        plannedPayment: 473_801,
        installmentMonths: 1,
        dueDate: new Date(2026, 11, 1),
      },
      start,
      end
    );
    expect(r.dueAmount).toBe(0);
    expect(r.isInstallment).toBe(true);
    expect(r.monthlyPayment).toBe(473_801);
  });

  it("charges installment when due date is inside the window", () => {
    const r = monthlyDebtObligation(
      {
        remainingAmount: 473_801,
        plannedPayment: 473_801,
        installmentMonths: 1,
        dueDate: new Date(2026, 9, 15),
      },
      start,
      end
    );
    expect(r.dueAmount).toBe(473_801);
    expect(r.isInstallment).toBe(true);
  });
});

describe("splitInstallmentDebtLists", () => {
  const windowEnd = resolveDebtDueWindowEnd(
    new Date(2026, 10, 24, 23, 59, 59, 999)
  );

  const base = {
    dueAmount: 0,
    monthlyPayment: null as number | null,
    isInstallment: true,
  };

  it("keeps paid Nov due in this period and upcoming when principal remains", () => {
    const kredivo = {
      ...base,
      name: "kredivo",
      remainingDue: 0,
      paidAmount: 723_460,
      remainingAmount: 1_446_920,
      dueAmount: 723_460,
      monthlyPayment: 723_460,
      dueDate: new Date(2026, 10, 27).toISOString(),
    };
    const unpaid = {
      ...base,
      name: "xxx",
      remainingDue: 581_000,
      paidAmount: 0,
      remainingAmount: 581_000,
      dueAmount: 581_000,
      monthlyPayment: 581_000,
      dueDate: new Date(2026, 10, 25).toISOString(),
    };

    const { thisPeriod, upcoming } = splitInstallmentDebtLists(
      [kredivo, unpaid],
      windowEnd
    );

    expect(thisPeriod.map((d) => d.name).sort()).toEqual(["kredivo", "xxx"]);
    expect(upcoming.map((d) => d.name)).toEqual(["kredivo"]);
  });

  it("keeps far-future dues out of this-period card (only upcoming)", () => {
    const later = {
      ...base,
      name: "rupiah cepat",
      remainingDue: 0,
      paidAmount: 500_000,
      remainingAmount: 1_000_000,
      dueAmount: 500_000,
      monthlyPayment: 500_000,
      dueDate: new Date(2027, 0, 7).toISOString(),
    };

    const { thisPeriod, upcoming } = splitInstallmentDebtLists(
      [later],
      windowEnd
    );

    expect(thisPeriod).toHaveLength(0);
    expect(upcoming.map((d) => d.name)).toEqual(["rupiah cepat"]);
  });

  it("puts unpaid Dec dues in this period when window reaches 24 Des", () => {
    const windowToDes24 = new Date(2026, 11, 24, 23, 59, 59, 999);
    const des1 = {
      ...base,
      name: "rupiah cepat",
      remainingDue: 473_801,
      paidAmount: 0,
      remainingAmount: 473_801,
      dueAmount: 473_801,
      monthlyPayment: 473_801,
      dueDate: new Date(2026, 11, 1).toISOString(),
    };
    const jan = {
      ...base,
      name: "rupiah cepat jan",
      remainingDue: 0,
      paidAmount: 0,
      remainingAmount: 473_949,
      dueAmount: 0,
      monthlyPayment: 473_949,
      dueDate: new Date(2027, 0, 1).toISOString(),
    };

    const { thisPeriod, upcoming } = splitInstallmentDebtLists(
      [des1, jan],
      windowToDes24
    );

    expect(thisPeriod.map((d) => d.name)).toEqual(["rupiah cepat"]);
    expect(upcoming.map((d) => d.name)).toEqual(["rupiah cepat jan"]);
  });

  it("excludes paid installments with no principal left", () => {
    const done = {
      ...base,
      remainingDue: 0,
      paidAmount: 200_000,
      remainingAmount: 0,
      dueAmount: 200_000,
      monthlyPayment: 200_000,
      dueDate: new Date(2026, 10, 25).toISOString(),
    };

    const { thisPeriod, upcoming } = splitInstallmentDebtLists(
      [done],
      windowEnd
    );

    expect(thisPeriod).toHaveLength(1);
    expect(upcoming).toHaveLength(0);
  });
});

describe("nextInstallmentDueDate / amount", () => {
  const windowEnd = resolveDebtDueWindowEnd(
    new Date(2026, 10, 24, 23, 59, 59, 999)
  );

  it("bumps due date by one month when still in this window", () => {
    const next = nextInstallmentDueDate(
      new Date(2026, 10, 27).toISOString(),
      windowEnd
    );
    expect(next?.getFullYear()).toBe(2026);
    expect(next?.getMonth()).toBe(11);
    expect(next?.getDate()).toBe(27);
  });

  it("keeps due date when already after the window", () => {
    const next = nextInstallmentDueDate(
      new Date(2027, 0, 7).toISOString(),
      windowEnd
    );
    expect(next?.getMonth()).toBe(0);
    expect(next?.getDate()).toBe(7);
  });

  it("caps next amount at remaining principal", () => {
    expect(
      nextInstallmentAmount({
        dueAmount: 723_460,
        monthlyPayment: 723_460,
        remainingAmount: 500_000,
      })
    ).toBe(500_000);
  });
});

describe("paidTowardDue", () => {
  const rangeStart = new Date(2026, 9, 23);

  it("ignores older installment payments for a later due date", () => {
    expect(
      paidTowardDue({
        payments: [{ date: new Date(2026, 9, 23), amount: 723_460 }],
        dueAmount: 723_460,
        dueDate: new Date(2026, 11, 27),
        rangeStart,
      })
    ).toBe(0);
  });

  it("counts payments near the due date", () => {
    expect(
      paidTowardDue({
        payments: [{ date: new Date(2026, 11, 20), amount: 400_000 }],
        dueAmount: 723_460,
        dueDate: new Date(2026, 11, 27),
        rangeStart,
      })
    ).toBe(400_000);
  });

  it("still counts early payday settle for a due ~1 month out", () => {
    expect(
      paidTowardDue({
        payments: [{ date: new Date(2026, 9, 23), amount: 200_000 }],
        dueAmount: 200_000,
        dueDate: new Date(2026, 10, 25),
        rangeStart,
      })
    ).toBe(200_000);
  });
});
