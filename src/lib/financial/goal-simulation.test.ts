import { describe, expect, it } from "vitest";
import {
  idealSavingsToTarget,
  simulateDailySavings,
} from "@/lib/financial/goal-simulation";

const from = new Date(2026, 9, 1, 12, 0, 0);

describe("simulateDailySavings", () => {
  it("computes days/weeks/months to reach target", () => {
    const r = simulateDailySavings(1_000_000, 400_000, 30_000, from);
    expect(r.remaining).toBe(600_000);
    expect(r.daysNeeded).toBe(20);
    expect(r.weeksNeeded).toBe(3);
    expect(r.monthsNeeded).toBe(1);
    expect(r.reachDate).toBe(new Date(2026, 9, 21, 12, 0, 0).toISOString());
  });

  it("returns zeros when already at target", () => {
    const r = simulateDailySavings(500_000, 500_000, 10_000, from);
    expect(r.daysNeeded).toBe(0);
    expect(r.reachDate).toBe(from.toISOString());
  });

  it("returns null reachDate when daily amount is zero but still short", () => {
    const r = simulateDailySavings(1_000_000, 0, 0, from);
    expect(r.remaining).toBe(1_000_000);
    expect(r.reachDate).toBeNull();
  });
});

describe("idealSavingsToTarget", () => {
  it("provides horizon paces without target date", () => {
    const r = idealSavingsToTarget(1_200_000, 200_000, null, from);
    expect(r.hasTargetDate).toBe(false);
    expect(r.horizons).toHaveLength(3);
    expect(r.horizons[0].months).toBe(3);
    expect(r.horizons[0].daily).toBe(Math.ceil(1_000_000 / 90));
  });

  it("marks overdue when target date is in the past", () => {
    const target = new Date(2026, 8, 1);
    const r = idealSavingsToTarget(1_000_000, 100_000, target, from);
    expect(r.isOverdue).toBe(true);
    expect(r.daysLeft).toBe(0);
    expect(r.idealDaily).toBeNull();
  });

  it("computes ideal daily/weekly/monthly before target", () => {
    const target = new Date(2026, 10, 1);
    const r = idealSavingsToTarget(1_000_000, 0, target, from);
    expect(r.hasTargetDate).toBe(true);
    expect(r.isOverdue).toBe(false);
    expect(r.daysLeft).toBeGreaterThan(0);
    expect(r.idealDaily).toBe(Math.ceil(1_000_000 / r.daysLeft!));
    expect(r.idealWeekly).toBe(r.idealDaily! * 7);
    expect(r.idealMonthly).toBeGreaterThan(0);
  });

  it("zeros horizons when target already met", () => {
    const r = idealSavingsToTarget(500_000, 500_000, "2026-12-01", from);
    expect(r.remaining).toBe(0);
    expect(r.horizons.every((h) => h.daily === 0)).toBe(true);
  });
});
