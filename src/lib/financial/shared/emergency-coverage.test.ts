import { describe, expect, it } from "vitest";
import {
  calculateEmergencyCoverageMonths,
  resolveEmergencyReserve,
} from "@/lib/financial/shared/emergency-coverage";

describe("calculateEmergencyCoverageMonths", () => {
  it("divides fund by essentials and rounds to 2 decimals", () => {
    expect(calculateEmergencyCoverageMonths(6_000_000, 2_000_000)).toBe(3);
    expect(calculateEmergencyCoverageMonths(5_000_000, 3_000_000)).toBe(1.67);
  });

  it("returns null when essentials are missing or zero", () => {
    expect(calculateEmergencyCoverageMonths(1_000_000, 0)).toBeNull();
    expect(calculateEmergencyCoverageMonths(1_000_000, -100)).toBeNull();
  });

  it("returns null for non-finite emergency fund", () => {
    expect(calculateEmergencyCoverageMonths(Number.NaN, 1_000_000)).toBeNull();
    expect(calculateEmergencyCoverageMonths(Number.POSITIVE_INFINITY, 1_000_000)).toBeNull();
  });
});

describe("resolveEmergencyReserve", () => {
  it("prefers positive emergency goal amount", () => {
    expect(
      resolveEmergencyReserve({ emergencyGoalAmount: 5_000_000, liquidAssets: 3_000_000 })
    ).toEqual({ amount: 5_000_000, source: "goal" });
  });

  it("falls back to liquid assets when goal is null or zero", () => {
    expect(
      resolveEmergencyReserve({ emergencyGoalAmount: null, liquidAssets: 3_000_000 })
    ).toEqual({ amount: 3_000_000, source: "liquid_assets" });
    expect(
      resolveEmergencyReserve({ emergencyGoalAmount: 0, liquidAssets: 2_500_000 })
    ).toEqual({ amount: 2_500_000, source: "liquid_assets" });
  });
});
