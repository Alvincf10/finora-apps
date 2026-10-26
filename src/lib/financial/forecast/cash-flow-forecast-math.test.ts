import { describe, expect, it } from "vitest";
import { allOccurrencesInRange } from "@/lib/financial/fixed-costs";
import {
  projectHorizonCashFlow,
  toDateKey,
} from "@/lib/financial/forecast/cash-flow-forecast-math";
import {
  averageDailyVariableSpend,
  buildDebtEvents,
  buildFixedCostEvents,
  buildSalaryEvents,
  horizonEndDate,
} from "@/lib/financial/forecast/build-events";
import type { ForecastEvent } from "@/lib/financial/forecast/types";

describe("allOccurrencesInRange", () => {
  it("returns monthly due days across a 90-day window", () => {
    const start = new Date(2026, 9, 1); // 1 Oct
    const end = new Date(2026, 11, 29); // 29 Dec (~90d from Oct 1)
    const dates = allOccurrencesInRange(10, start, end);
    expect(dates.map((d) => toDateKey(d))).toEqual([
      "2026-10-10",
      "2026-11-10",
      "2026-12-10",
    ]);
  });

  it("clamps due day 31 in February", () => {
    const dates = allOccurrencesInRange(
      31,
      new Date(2026, 1, 1),
      new Date(2026, 1, 28)
    );
    expect(dates).toHaveLength(1);
    expect(dates[0].getDate()).toBe(28);
  });
});

describe("buildSalaryEvents", () => {
  it("places weekend-adjusted salary on payday within horizon", () => {
    // 25 Oct 2026 = Sunday → Friday 23 Oct
    const { events, incomeClass } = buildSalaryEvents({
      paydayDay: 25,
      monthlySalary: 10_000_000,
      currency: "IDR",
      asOf: new Date(2026, 9, 1),
      horizonEnd: new Date(2026, 9, 31),
    });
    expect(incomeClass).toBe("SCHEDULED_SALARY");
    expect(events).toHaveLength(1);
    expect(events[0].date).toBe("2026-10-23");
    expect(events[0].incomeClass).toBe("SCHEDULED_SALARY");
  });

  it("emits NONE when salary unset", () => {
    const { events, incomeClass } = buildSalaryEvents({
      paydayDay: 25,
      monthlySalary: 0,
      currency: "IDR",
      asOf: new Date(2026, 9, 1),
      horizonEnd: new Date(2026, 9, 31),
    });
    expect(incomeClass).toBe("NONE");
    expect(events).toHaveLength(0);
  });
});

describe("buildDebtEvents / double-count guardrails", () => {
  it("caps cumulative debt payments at remaining principal", () => {
    const events = buildDebtEvents(
      [
        {
          debtId: "d1",
          name: "Cicilan",
          currency: "IDR",
          remainingAmount: 1_500_000,
          monthlyPayment: 1_000_000,
          dueDay: 5,
        },
      ],
      "IDR",
      new Date(2026, 9, 1),
      new Date(2026, 11, 31)
    );
    const total = events.reduce((s, e) => s + e.amount, 0);
    expect(total).toBe(1_500_000);
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it("skips first installment when remainingDue is 0", () => {
    const events = buildDebtEvents(
      [
        {
          debtId: "d1",
          name: "Cicilan",
          currency: "IDR",
          remainingAmount: 5_000_000,
          remainingDue: 0,
          monthlyPayment: 1_000_000,
          dueDay: 5,
        },
      ],
      "IDR",
      new Date(2026, 9, 1),
      new Date(2026, 10, 30)
    );
    // Oct 5 skipped; Nov 5 included
    expect(events.map((e) => e.date)).toEqual(["2026-11-05"]);
  });
});

describe("variable spend assumption", () => {
  it("excludes debt- and fixed-cost-linked expenses", () => {
    const daily = averageDailyVariableSpend(
      [
        { amount: 300_000 },
        { amount: 1_000_000, debtId: "x" },
        { amount: 200_000, fixedCostId: "y" },
        { amount: 0 },
      ],
      30
    );
    expect(daily).toBe(Math.round(300_000 / 30));
  });
});

describe("projectHorizonCashFlow", () => {
  const baseEvents: ForecastEvent[] = [
    {
      id: "sal",
      date: "2026-10-23",
      kind: "INCOME",
      amount: 10_000_000,
      direction: "IN",
      label: "Salary",
      source: "test",
      incomeClass: "SCHEDULED_SALARY",
    },
    {
      id: "rent",
      date: "2026-10-05",
      kind: "FIXED_COST",
      amount: 3_000_000,
      direction: "OUT",
      label: "Sewa",
      source: "test",
    },
    {
      id: "debt",
      date: "2026-10-10",
      kind: "DEBT",
      amount: 2_000_000,
      direction: "OUT",
      label: "Cicilan",
      source: "test",
    },
  ];

  it("is deterministic for identical inputs", () => {
    const input = {
      currency: "IDR" as const,
      horizonDays: 30 as const,
      asOf: new Date(2026, 9, 1),
      startingBalance: 1_000_000,
      events: baseEvents,
      dailyVariableSpend: 0,
      incomeClass: "SCHEDULED_SALARY" as const,
      assumptions: [],
      limitations: [],
    };
    const a = projectHorizonCashFlow(input);
    const b = projectHorizonCashFlow(input);
    expect(a.endingBalance).toBe(b.endingBalance);
    expect(a.series).toEqual(b.series);
    expect(a.shortfalls).toEqual(b.shortfalls);
  });

  it("detects shortfall lineage to causing event", () => {
    const result = projectHorizonCashFlow({
      currency: "IDR",
      horizonDays: 30,
      asOf: new Date(2026, 9, 1),
      startingBalance: 500_000,
      events: [
        {
          id: "rent",
          date: "2026-10-05",
          kind: "FIXED_COST",
          amount: 3_000_000,
          direction: "OUT",
          label: "Sewa",
          source: "test",
        },
      ],
      incomeClass: "NONE",
      assumptions: [],
      limitations: [],
    });
    expect(result.shortfalls.length).toBeGreaterThan(0);
    expect(result.shortfalls[0].causingEventId).toBe("rent");
    expect(result.shortfalls[0].causingLabel).toBe("Sewa");
    expect(result.endingBalance).toBe(500_000 - 3_000_000);
  });

  it("supports 30/60/90 series lengths", () => {
    for (const horizon of [30, 60, 90] as const) {
      const result = projectHorizonCashFlow({
        currency: "IDR",
        horizonDays: horizon,
        asOf: new Date(2026, 9, 1),
        startingBalance: 0,
        events: [],
        incomeClass: "NONE",
        assumptions: [],
        limitations: [],
      });
      expect(result.series).toHaveLength(horizon);
      expect(result.horizonEnd).toBe(
        toDateKey(horizonEndDate(new Date(2026, 9, 1), horizon))
      );
    }
  });

  it("applies daily variable without double-counting fixed/debt events", () => {
    const result = projectHorizonCashFlow({
      currency: "IDR",
      horizonDays: 30,
      asOf: new Date(2026, 9, 1),
      startingBalance: 1_000_000,
      events: [
        {
          id: "fixed",
          date: "2026-10-01",
          kind: "FIXED_COST",
          amount: 100_000,
          direction: "OUT",
          label: "Net",
          source: "test",
        },
      ],
      dailyVariableSpend: 50_000,
      incomeClass: "NONE",
      assumptions: [],
      limitations: [],
    });
    // Fixed 100k + 30 days * 50k variable
    expect(result.totalOutflows).toBe(100_000 + 30 * 50_000);
    expect(result.endingBalance).toBe(1_000_000 - (100_000 + 30 * 50_000));
    expect(result.events.some((e) => e.kind === "VARIABLE_SPEND")).toBe(true);
  });

  it("does not invent salary when incomeClass NONE and no events", () => {
    const result = projectHorizonCashFlow({
      currency: "IDR",
      horizonDays: 30,
      asOf: new Date(2026, 9, 1),
      startingBalance: 2_000_000,
      events: [],
      incomeClass: "NONE",
      assumptions: [],
      limitations: [],
    });
    expect(result.totalInflows).toBe(0);
    expect(result.endingBalance).toBe(2_000_000);
  });
});

describe("buildFixedCostEvents currency filter", () => {
  it("skips non-matching currency", () => {
    const events = buildFixedCostEvents(
      [
        {
          fixedCostId: "1",
          name: "Rent IDR",
          amount: 1,
          currency: "IDR",
          dueDay: 1,
        },
        {
          fixedCostId: "2",
          name: "Rent EUR",
          amount: 99,
          currency: "EUR",
          dueDay: 1,
        },
      ],
      "IDR",
      new Date(2026, 9, 1),
      new Date(2026, 9, 5)
    );
    expect(events).toHaveLength(1);
    expect(events[0].linkedId).toBe("1");
  });
});
