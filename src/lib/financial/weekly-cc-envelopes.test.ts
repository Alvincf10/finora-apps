import { describe, expect, it } from "vitest";
import {
  allocateWeeklyEnvelopesFromCc,
  remainingCalendarWeeks,
  sharesFromWeekAmounts,
  sumDebitModeCcHeadroom,
} from "./weekly-cc-envelopes";

describe("remainingCalendarWeeks", () => {
  it("counts weeks from target Monday through cycle end", () => {
    // Mon 1 Dec → cycle end Sun 21 Dec ≈ 21 days → 3 weeks
    expect(
      remainingCalendarWeeks(
        new Date(2026, 11, 1, 0, 0, 0),
        new Date(2026, 11, 21, 23, 59, 59)
      )
    ).toBe(3);
  });

  it("returns at least 1 when past cycle end", () => {
    expect(
      remainingCalendarWeeks(
        new Date(2026, 11, 25),
        new Date(2026, 11, 21)
      )
    ).toBe(1);
  });
});

describe("sharesFromWeekAmounts", () => {
  it("uses defaults when all zero", () => {
    expect(sharesFromWeekAmounts({})).toEqual({
      Food: 0.55,
      Entertainment: 0.25,
      Relationship: 0.2,
    });
  });

  it("derives mix from recent spend", () => {
    const shares = sharesFromWeekAmounts({
      Food: 600_000,
      Entertainment: 300_000,
      Relationship: 100_000,
    });
    expect(shares.Food).toBeCloseTo(0.6);
    expect(shares.Entertainment).toBeCloseTo(0.3);
    expect(shares.Relationship).toBeCloseTo(0.1);
  });
});

describe("allocateWeeklyEnvelopesFromCc", () => {
  it("splits headroom across remaining weeks then categories", () => {
    const result = allocateWeeklyEnvelopesFromCc({
      ccHeadroom: 1_200_000,
      remainingWeeks: 4,
      recentWeekAmounts: {
        Food: 550_000,
        Entertainment: 250_000,
        Relationship: 200_000,
      },
    });
    expect(result.weeklyPool).toBe(300_000);
    const sum =
      result.amounts.Food +
      result.amounts.Entertainment +
      result.amounts.Relationship;
    expect(sum).toBe(result.weeklyPool);
    expect(result.amounts.Food).toBeGreaterThan(result.amounts.Entertainment);
  });

  it("returns zero envelopes when CC headroom is empty", () => {
    const result = allocateWeeklyEnvelopesFromCc({
      ccHeadroom: 8_000,
      remainingWeeks: 4,
    });
    // 8000/4 = 2000 pool — tiny but non-zero
    expect(result.weeklyPool).toBe(2_000);
    expect(
      result.amounts.Food +
        result.amounts.Entertainment +
        result.amounts.Relationship
    ).toBe(2_000);
  });

  it("zeros everything when headroom is 0", () => {
    const result = allocateWeeklyEnvelopesFromCc({
      ccHeadroom: 0,
      remainingWeeks: 3,
    });
    expect(result.weeklyPool).toBe(0);
    expect(result.amounts).toEqual({
      Food: 0,
      Entertainment: 0,
      Relationship: 0,
    });
  });
});

describe("sumDebitModeCcHeadroom", () => {
  it("only sums debitMode cards", () => {
    expect(
      sumDebitModeCcHeadroom([
        { debitMode: true, available: 100_000 },
        { debitMode: false, available: 5_000_000 },
        { debitMode: true, available: 50_000 },
      ])
    ).toEqual({ hasDebitMode: true, ccHeadroom: 150_000 });
  });

  it("reports no debitMode when none configured", () => {
    expect(
      sumDebitModeCcHeadroom([{ debitMode: false, available: 1_000_000 }])
    ).toEqual({ hasDebitMode: false, ccHeadroom: 0 });
  });
});
