import { describe, expect, it } from "vitest";
import {
  getCycleProgress,
  getPayCycleBounds,
  getPayCycleForPeriod,
  periodFromDate,
  shiftPeriodRef,
  toDateInputValue,
} from "@/lib/financial/pay-cycle-bounds";

describe("getPayCycleForPeriod / weekend adjustment", () => {
  it("builds Oct 2026 cycle: 23 Oct – 24 Nov 2026", () => {
    const cycle = getPayCycleForPeriod(25, { year: 2026, month: 10 });
    expect(cycle.start.getFullYear()).toBe(2026);
    expect(cycle.start.getMonth()).toBe(9);
    expect(cycle.start.getDate()).toBe(23);
    expect(cycle.end.getMonth()).toBe(10);
    expect(cycle.end.getDate()).toBe(24);
    expect(cycle.paydayDay).toBe(25);
    expect(cycle.label).toContain("2026");
  });
});

describe("getPayCycleBounds / periodFromDate", () => {
  it("before payday uses previous cycle start month", () => {
    const now = new Date(2026, 9, 13, 12, 0, 0);
    const cycle = getPayCycleBounds(25, now);
    expect(cycle.start.getMonth()).toBe(8);
    expect(periodFromDate(25, now)).toEqual({ year: 2026, month: 9 });
  });

  it("on/after adjusted payday uses current cycle", () => {
    const now = new Date(2026, 9, 23, 12, 0, 0);
    const cycle = getPayCycleBounds(25, now);
    expect(cycle.start.getDate()).toBe(23);
    expect(periodFromDate(25, now)).toEqual({ year: 2026, month: 10 });
  });

  it("clamps invalid paydayDay", () => {
    expect(getPayCycleBounds(99, new Date(2026, 5, 15)).paydayDay).toBe(28);
  });
});

describe("shiftPeriodRef", () => {
  it("moves back across year boundary", () => {
    expect(shiftPeriodRef({ year: 2026, month: 1 }, 1)).toEqual({
      year: 2025,
      month: 12,
    });
  });

  it("moves back within same year", () => {
    expect(shiftPeriodRef({ year: 2026, month: 6 }, 2)).toEqual({
      year: 2026,
      month: 4,
    });
  });
});

describe("getCycleProgress", () => {
  const cycle = getPayCycleForPeriod(25, { year: 2026, month: 10 });

  it("reports in-cycle progress with at least 1 elapsed day", () => {
    const now = new Date(2026, 9, 24, 12, 0, 0);
    const p = getCycleProgress(cycle, now);
    expect(p.isCurrent).toBe(true);
    expect(p.elapsedDays).toBeGreaterThanOrEqual(1);
    expect(p.totalDays).toBeGreaterThanOrEqual(p.elapsedDays);
  });

  it("marks complete when now is outside cycle", () => {
    const before = new Date(2026, 8, 1, 12, 0, 0);
    const p = getCycleProgress(cycle, before);
    expect(p.isCurrent).toBe(false);
    expect(p.elapsedDays).toBe(p.totalDays);
  });
});

describe("toDateInputValue", () => {
  it("formats local YYYY-MM-DD with zero padding", () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toDateInputValue(new Date(2026, 11, 24))).toBe("2026-12-24");
  });
});
