import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIQUID_ACCOUNT_TYPES,
  calculateEligibleLiquidBalance,
} from "@/lib/financial/shared/liquid-assets";

describe("calculateEligibleLiquidBalance", () => {
  const accounts = [
    { currency: "IDR", type: "BANK", isActive: true, currentBalance: 1_000_000 },
    { currency: "IDR", type: "CASH", isActive: true, currentBalance: 200_000 },
    { currency: "IDR", type: "E_WALLET", isActive: true, currentBalance: 50_000 },
    { currency: "IDR", type: "CREDIT_CARD", isActive: true, currentBalance: 500_000 },
    { currency: "IDR", type: "OTHER", isActive: true, currentBalance: 99_000 },
    { currency: "IDR", type: "BANK", isActive: false, currentBalance: 9_999_999 },
    { currency: "EUR", type: "BANK", isActive: true, currentBalance: 100 },
    { currency: "IDR", type: "BANK", isActive: true, currentBalance: -50_000 },
  ];

  it("sums active liquid types for one currency only", () => {
    expect(calculateEligibleLiquidBalance(accounts, "IDR")).toBe(1_250_000);
    expect(calculateEligibleLiquidBalance(accounts, "EUR")).toBe(100);
  });

  it("excludes credit cards even if listed in custom liquidTypes", () => {
    const withCc = new Set([...DEFAULT_LIQUID_ACCOUNT_TYPES, "CREDIT_CARD"]);
    expect(calculateEligibleLiquidBalance(accounts, "IDR", withCc)).toBe(1_250_000);
  });

  it("floors negative balances at zero", () => {
    const onlyNeg = [
      { currency: "IDR", type: "BANK", isActive: true, currentBalance: -10 },
    ];
    expect(calculateEligibleLiquidBalance(onlyNeg, "IDR")).toBe(0);
  });

  it("treats null/undefined balance as zero", () => {
    expect(
      calculateEligibleLiquidBalance(
        [{ currency: "IDR", type: "CASH", isActive: true, currentBalance: null }],
        "IDR"
      )
    ).toBe(0);
  });
});
