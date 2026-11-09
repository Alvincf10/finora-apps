import { describe, expect, it } from "vitest";
import {
  buildSalaryEvents,
  buildFixedCostEvents,
} from "@/lib/financial/forecast/build-events";

describe("buildSalaryEvents", () => {
  it("returns NONE when salary is 0", () => {
    const result = buildSalaryEvents({
      paydayDay: 25,
      monthlySalary: 0,
      currency: "IDR",
      asOf: new Date(2026, 10, 1),
      horizonEnd: new Date(2026, 11, 31),
    });
    expect(result.events).toEqual([]);
    expect(result.incomeClass).toBe("NONE");
  });

  it("emits weekend-adjusted payday incomes in range", () => {
    // Oct 2026 payday 25 = Sunday → Fri 23 Oct
    const result = buildSalaryEvents({
      paydayDay: 25,
      monthlySalary: 10_000_000,
      currency: "IDR",
      asOf: new Date(2026, 9, 1),
      horizonEnd: new Date(2026, 10, 30),
    });
    expect(result.incomeClass).toBe("SCHEDULED_SALARY");
    expect(result.events.length).toBeGreaterThanOrEqual(2);
    expect(result.events[0]?.kind).toBe("INCOME");
    expect(result.events[0]?.amount).toBe(10_000_000);
    expect(result.events.some((e) => e.date === "2026-10-23")).toBe(true);
  });
});

describe("buildFixedCostEvents", () => {
  it("skips other currencies and expands due days", () => {
    const events = buildFixedCostEvents(
      [
        {
          fixedCostId: "1",
          name: "Netflix",
          amount: 54_000,
          currency: "IDR",
          dueDay: 9,
        },
        {
          fixedCostId: "2",
          name: "Spotify EUR",
          amount: 10,
          currency: "EUR",
          dueDay: 9,
        },
      ],
      "IDR",
      new Date(2026, 10, 1),
      new Date(2026, 11, 31)
    );
    expect(events.every((e) => e.label === "Netflix")).toBe(true);
    expect(events.length).toBe(2);
    expect(events[0]?.kind).toBe("FIXED_COST");
    expect(events[0]?.direction).toBe("OUT");
  });
});
