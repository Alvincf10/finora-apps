import { describe, expect, it } from "vitest";
import {
  getPayCycleBounds,
  getPayCycleForPeriod,
  periodFromDate,
  shiftPeriodRef,
} from "@/lib/financial/pay-cycle";
import { resolvePaydayInMonth } from "@/lib/financial/payday";

describe("pay-cycle weekend adjustment", () => {
  it("moves Sunday payday 25 Oct 2026 to Friday 23 Oct", () => {
    // 25 Oct 2026 is Sunday
    const payday = resolvePaydayInMonth(25, 2026, 9);
    expect(payday.getFullYear()).toBe(2026);
    expect(payday.getMonth()).toBe(9);
    expect(payday.getDate()).toBe(23);
  });

  it("keeps weekday payday unchanged", () => {
    // 25 Nov 2026 is Wednesday
    const payday = resolvePaydayInMonth(25, 2026, 10);
    expect(payday.getDate()).toBe(25);
  });
});

describe("getPayCycleForPeriod", () => {
  it("builds Oct 2026 cycle as weekend-adjusted start through day before next payday", () => {
    const cycle = getPayCycleForPeriod(25, { year: 2026, month: 10 });
    expect(cycle.start.getFullYear()).toBe(2026);
    expect(cycle.start.getMonth()).toBe(9);
    expect(cycle.start.getDate()).toBe(23);
    // Next payday Wed 25 Nov → end 24 Nov
    expect(cycle.end.getFullYear()).toBe(2026);
    expect(cycle.end.getMonth()).toBe(10);
    expect(cycle.end.getDate()).toBe(24);
  });
});

describe("getPayCycleBounds / periodFromDate", () => {
  it("before payday uses previous cycle", () => {
    // 13 Oct 2026 — before weekend-adjusted 23 Oct
    const now = new Date(2026, 9, 13, 12, 0, 0);
    const cycle = getPayCycleBounds(25, now);
    expect(cycle.start.getMonth()).toBe(8); // September
    expect(periodFromDate(25, now)).toEqual({ year: 2026, month: 9 });
  });

  it("on/after payday uses current cycle", () => {
    const now = new Date(2026, 9, 23, 12, 0, 0);
    const cycle = getPayCycleBounds(25, now);
    expect(cycle.start.getDate()).toBe(23);
    expect(periodFromDate(25, now)).toEqual({ year: 2026, month: 10 });
  });

  it("shiftPeriodRef crosses year boundary", () => {
    expect(shiftPeriodRef({ year: 2026, month: 1 }, 1)).toEqual({
      year: 2025,
      month: 12,
    });
  });
});
