import { describe, expect, it } from "vitest";
import {
  assessPaydayCompleteness,
  buildUpcomingCycles,
  computeCrushPlan,
  incomeRequiredToClear,
  projectDebtSchedule,
} from "@/lib/financial/debt-crush-plan";

const cycles = [
  {
    label: "C1",
    start: new Date("2026-11-25T00:00:00+07:00"),
    end: new Date("2026-12-24T23:59:59+07:00"),
  },
  {
    label: "C2",
    start: new Date("2026-12-25T00:00:00+07:00"),
    end: new Date("2027-01-24T23:59:59+07:00"),
  },
  {
    label: "C3",
    start: new Date("2027-01-25T00:00:00+07:00"),
    end: new Date("2027-02-24T23:59:59+07:00"),
  },
];

describe("projectDebtSchedule", () => {
  it("charges installment when due falls in window and again while overdue", () => {
    const schedule = projectDebtSchedule(
      [
        {
          debtId: "ccc",
          name: "ccc",
          remainingAmount: 2_809_264,
          plannedPayment: 969_755,
          installmentMonths: 3,
          dueDate: new Date("2026-11-25T00:00:00.000Z"),
        },
        {
          debtId: "later",
          name: "later",
          remainingAmount: 500_000,
          plannedPayment: 500_000,
          dueDate: new Date("2027-01-10T00:00:00.000Z"),
        },
      ],
      cycles
    );

    expect(schedule[0].debtDueTotal).toBe(969_755);
    // later (due Jan 10) lands in C2 (Dec25–Jan24), not C3
    expect(schedule[1].items.some((i) => i.debtId === "later")).toBe(true);
    expect(schedule[1].debtDueTotal).toBe(969_755 + 500_000);
    // C3: final ccc slice only
    expect(schedule[2].debtDueTotal).toBe(869_754);
    expect(schedule[2].remainingAfterCycle).toBe(0);
  });

  it("skips mortgage when excludeFromCrush is set", () => {
    const schedule = projectDebtSchedule(
      [
        {
          debtId: "kpr",
          name: "KPR",
          remainingAmount: 100_000_000,
          plannedPayment: 5_000_000,
          dueDate: new Date("2026-11-25T00:00:00.000Z"),
          excludeFromCrush: true,
        },
      ],
      cycles
    );
    expect(schedule.every((c) => c.debtDueTotal === 0)).toBe(true);
  });
});

describe("computeCrushPlan", () => {
  it("flags infeasible when living burn exceeds income", () => {
    const plan = computeCrushPlan({
      debts: [
        {
          debtId: "a",
          name: "a",
          remainingAmount: 2_000_000,
          plannedPayment: 1_000_000,
          dueDate: new Date("2026-11-25T00:00:00.000Z"),
        },
      ],
      cycles: cycles.slice(0, 2),
      income: 8_150_000,
      fixedCostsPerCycle: 942_000,
      livingCap: 7_250_000,
      separateLiability: 0,
      paySeparateLiabilityFromSurplus: true,
    });
    expect(plan.feasible).toBe(false);
    expect(plan.livingMaxGivenIncome).toBeLessThan(7_250_000);
  });

  it("supports B′ style plan: 8.15jt + living 2.2jt clears CC from surplus", () => {
    const plan = computeCrushPlan({
      debts: [
        {
          debtId: "d1",
          name: "bundle",
          remainingAmount: 2_910_216,
          plannedPayment: 2_910_216,
          dueDate: new Date("2026-11-25T00:00:00.000Z"),
        },
        {
          debtId: "d2",
          name: "bundle2",
          remainingAmount: 3_492_397,
          plannedPayment: 3_492_397,
          dueDate: new Date("2026-12-25T00:00:00.000Z"),
        },
        {
          debtId: "d3",
          name: "bundle3",
          remainingAmount: 1_593_214,
          plannedPayment: 1_593_214,
          dueDate: new Date("2027-01-25T00:00:00.000Z"),
        },
      ],
      cycles,
      income: 8_150_000,
      fixedCostsPerCycle: 942_000,
      livingCap: 2_200_000,
      startingCash: 0,
      separateLiability: 2_992_012,
      paySeparateLiabilityFromSurplus: true,
    });

    expect(plan.feasible).toBe(true);
    expect(plan.separateLiabilityEnd).toBe(0);
    expect(plan.cycles[0].separateLiabilityPay).toBeGreaterThan(1_000_000);
    expect(plan.livingMaxGivenIncome).toBeGreaterThanOrEqual(2_200_000);
  });
});

describe("incomeRequiredToClear", () => {
  it("returns at least debt+fixed+living floor", () => {
    const needed = incomeRequiredToClear({
      debts: [
        {
          debtId: "a",
          name: "a",
          remainingAmount: 3_000_000,
          plannedPayment: 3_000_000,
          dueDate: new Date("2026-11-25T00:00:00.000Z"),
        },
      ],
      cycles: cycles.slice(0, 1),
      fixedCostsPerCycle: 1_000_000,
      livingCap: 2_000_000,
      separateLiability: 0,
    });
    expect(needed).toBeGreaterThanOrEqual(6_000_000);
  });
});

describe("assessPaydayCompleteness", () => {
  it("fails when saved envelopes ignore most obligations", () => {
    const result = assessPaydayCompleteness({
      salary: 8_150_000,
      expected: [
        { key: "debt:1", label: "ccc", amount: 969_755, kind: "DEBT" },
        { key: "debt:2", label: "xxx", amount: 581_000, kind: "DEBT" },
        { key: "fixed:1", label: "cursor", amount: 360_000, kind: "FIXED" },
        { key: "living", label: "Living", amount: 2_200_000, kind: "LIVING" },
      ],
      saved: [
        { key: "fixed:chatgpt", label: "chatgpt", amount: 75_000, kind: "FIXED" },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.missingKeys.length).toBeGreaterThan(0);
    expect(result.utilizationPct).toBeLessThan(5);
  });

  it("passes when obligations are covered", () => {
    const expected = [
      { key: "debt:1", label: "ccc", amount: 969_755, kind: "DEBT" },
      { key: "fixed:1", label: "cursor", amount: 360_000, kind: "FIXED" },
    ];
    const result = assessPaydayCompleteness({
      salary: 8_150_000,
      expected,
      saved: [
        ...expected,
        { key: "living", label: "Living", amount: 2_200_000, kind: "LIVING" },
        { key: "cc", label: "CC", amount: 2_000_000, kind: "OTHER" },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });
});

describe("buildUpcomingCycles", () => {
  it("returns requested count of cycles from next payday", () => {
    const built = buildUpcomingCycles(
      25,
      3,
      new Date("2026-11-21T12:00:00+07:00"),
      "next"
    );
    expect(built).toHaveLength(3);
    expect(built[0].start.getTime()).toBeLessThan(built[1].start.getTime());
  });
});
