import { describe, expect, it } from "vitest";
import {
  SURVIVAL_SAFE_RESERVE_DAYS,
  applyGoalAllocation,
  computeSurvivalFromCash,
} from "@/lib/financial/survival-math";

describe("computeSurvivalFromCash", () => {
  it("floors daily budget from cash and days left", () => {
    expect(computeSurvivalFromCash(1_000_000, 10)).toEqual({
      dailyBudget: 100_000,
      maxSafeGoalContribution: 700_000,
    });
  });

  it("returns zeros when cash or days are non-positive", () => {
    expect(computeSurvivalFromCash(0, 10)).toEqual({
      dailyBudget: 0,
      maxSafeGoalContribution: 0,
    });
    expect(computeSurvivalFromCash(500_000, 0)).toEqual({
      dailyBudget: 0,
      maxSafeGoalContribution: 0,
    });
  });

  it("blocks goal contribution when within safe reserve window", () => {
    expect(computeSurvivalFromCash(300_000, 3)).toEqual({
      dailyBudget: 100_000,
      maxSafeGoalContribution: 0,
    });
    expect(computeSurvivalFromCash(300_000, 2, SURVIVAL_SAFE_RESERVE_DAYS)).toEqual({
      dailyBudget: 150_000,
      maxSafeGoalContribution: 0,
    });
  });

  it("respects custom safeReserveDays", () => {
    const r = computeSurvivalFromCash(1_000_000, 20, 5);
    expect(r.dailyBudget).toBe(50_000);
    expect(r.maxSafeGoalContribution).toBe(750_000);
  });
});

describe("applyGoalAllocation", () => {
  const base = { cashOnHand: 1_000_000, daysLeft: 10, maxSafeGoalContribution: 700_000 };

  it("caps allocation at cash on hand", () => {
    const r = applyGoalAllocation(base.cashOnHand, base.daysLeft, 2_000_000, base.maxSafeGoalContribution);
    expect(r.goalAllocation).toBe(1_000_000);
    expect(r.livingCash).toBe(0);
    expect(r.dailyBudget).toBe(0);
  });

  it("marks withinSafeLimit against max safe contribution", () => {
    const ok = applyGoalAllocation(1_000_000, 10, 500_000, 700_000);
    const over = applyGoalAllocation(1_000_000, 10, 800_000, 700_000);
    expect(ok.withinSafeLimit).toBe(true);
    expect(over.withinSafeLimit).toBe(false);
  });

  it("flags tight when daily budget drops below 70% of base", () => {
    const tight = applyGoalAllocation(1_000_000, 10, 400_000, 700_000);
    expect(tight.dailyBudget).toBe(60_000);
    expect(tight.tight).toBe(true);
    const comfortable = applyGoalAllocation(1_000_000, 10, 100_000, 700_000);
    expect(comfortable.tight).toBe(false);
  });

  it("treats non-positive daysLeft without tight flag from ratio", () => {
    const r = applyGoalAllocation(500_000, 0, 100_000, 0);
    expect(r.dailyBudget).toBe(400_000);
    expect(r.tight).toBe(false);
  });
});
