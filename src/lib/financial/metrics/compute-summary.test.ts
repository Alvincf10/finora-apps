import { describe, expect, it } from "vitest";
import {
  computeFinancialSummaryMetrics,
  hasOtherCurrencies,
  resolveReportingCurrency,
} from "@/lib/financial/metrics/compute-summary";
import { calculateEligibleLiquidBalance } from "@/lib/financial/shared/liquid-assets";
import {
  calculateEmergencyCoverageMonths,
  resolveEmergencyReserve,
} from "@/lib/financial/shared/emergency-coverage";

describe("currency isolation", () => {
  it("never sums IDR and EUR together", () => {
    const result = computeFinancialSummaryMetrics({
      currency: "IDR",
      mixedCurrencyExcluded: true,
      transactions: [
        { type: "INCOME", amount: 10_000_000, currency: "IDR" },
        { type: "INCOME", amount: 500_00, currency: "EUR" },
        { type: "EXPENSE", amount: 1_000_000, currency: "IDR" },
        { type: "TRANSFER", amount: 999_999, currency: "IDR" },
      ],
      accounts: [
        {
          type: "BANK",
          currency: "IDR",
          currentBalance: 5_000_000,
          isActive: true,
        },
        {
          type: "BANK",
          currency: "EUR",
          currentBalance: 1_000_00,
          isActive: true,
        },
      ],
      debts: [
        { currency: "IDR", remainingAmount: 2_000_000, status: "ACTIVE" },
        { currency: "EUR", remainingAmount: 50_00, status: "ACTIVE" },
      ],
    });

    expect(result.income).toBe(10_000_000);
    expect(result.expense).toBe(1_000_000);
    expect(result.netCashFlow).toBe(9_000_000);
    expect(result.totalAssets).toBe(5_000_000);
    expect(result.totalLiabilities).toBe(2_000_000);
    expect(result.netWorth).toBe(3_000_000);
    expect(result.quality).toContain("MIXED_CURRENCY_EXCLUDED");
  });

  it("excludes transfers from income and expense", () => {
    const result = computeFinancialSummaryMetrics({
      currency: "IDR",
      transactions: [
        { type: "TRANSFER", amount: 500_000, currency: "IDR" },
        { type: "EXPENSE", amount: 100_000, currency: "IDR" },
      ],
      accounts: [],
      debts: [],
    });
    expect(result.income).toBe(0);
    expect(result.expense).toBe(100_000);
  });
});

describe("savings rate FR-01.4", () => {
  it("returns null (unavailable) when income is zero", () => {
    const result = computeFinancialSummaryMetrics({
      currency: "IDR",
      transactions: [{ type: "EXPENSE", amount: 50_000, currency: "IDR" }],
      accounts: [],
      debts: [],
    });
    expect(result.savingsRate).toBeNull();
    expect(result.debtRatio).toBeNull();
    expect(result.quality).toContain("ZERO_INCOME");
  });

  it("computes savings rate when income is positive", () => {
    const result = computeFinancialSummaryMetrics({
      currency: "IDR",
      transactions: [
        { type: "INCOME", amount: 10_000_000, currency: "IDR" },
        { type: "EXPENSE", amount: 2_000_000, currency: "IDR" },
      ],
      accounts: [],
      debts: [],
    });
    expect(result.savingsRate).toBe(80);
  });
});

describe("liabilities and credit cards", () => {
  it("does not double-count CREDIT_STATEMENT linked to a card", () => {
    const result = computeFinancialSummaryMetrics({
      currency: "IDR",
      transactions: [],
      accounts: [
        {
          type: "CREDIT_CARD",
          currency: "IDR",
          currentBalance: 1_500_000,
          isActive: true,
        },
        {
          type: "BANK",
          currency: "IDR",
          currentBalance: 3_000_000,
          isActive: true,
        },
      ],
      debts: [
        {
          currency: "IDR",
          remainingAmount: 1_500_000,
          status: "ACTIVE",
          obligationType: "CREDIT_STATEMENT",
          linkedAccountId: "cc1",
        },
        {
          currency: "IDR",
          remainingAmount: 4_000_000,
          status: "ACTIVE",
          obligationType: "INSTALLMENT",
        },
      ],
    });
    expect(result.totalLiabilities).toBe(1_500_000 + 4_000_000);
    expect(result.netWorth).toBe(3_000_000 - 5_500_000);
  });
});

describe("liquid assets + emergency", () => {
  it("liquid assets exclude OTHER, EUR, credit cards, and inactive", () => {
    const liquid = calculateEligibleLiquidBalance(
      [
        { currency: "IDR", type: "BANK", currentBalance: 5_000_000 },
        { currency: "IDR", type: "CASH", currentBalance: -100 },
        { currency: "EUR", type: "BANK", currentBalance: 9999 },
        { currency: "IDR", type: "OTHER", currentBalance: 9_000_000 },
        { currency: "IDR", type: "CREDIT_CARD", currentBalance: 500 },
        {
          currency: "IDR",
          type: "BANK",
          currentBalance: 1_000_000,
          isActive: false,
        },
      ],
      "IDR"
    );
    expect(liquid).toBe(5_000_000);
  });

  it("emergency coverage null when essentials missing", () => {
    expect(calculateEmergencyCoverageMonths(10_000_000, 0)).toBeNull();
    expect(calculateEmergencyCoverageMonths(9_000_000, 3_000_000)).toBe(3);
  });

  it("prefer emergency goal over liquid fallback", () => {
    expect(
      resolveEmergencyReserve({
        emergencyGoalAmount: 12_000_000,
        liquidAssets: 50_000_000,
      })
    ).toEqual({ amount: 12_000_000, source: "goal" });
    expect(
      resolveEmergencyReserve({
        emergencyGoalAmount: null,
        liquidAssets: 8_000_000,
      })
    ).toEqual({ amount: 8_000_000, source: "liquid_assets" });
  });
});

describe("resolveReportingCurrency", () => {
  it("prefers base currency", () => {
    expect(
      resolveReportingCurrency({
        baseCurrency: "EUR",
        accounts: [{ currency: "IDR", isActive: true }],
      })
    ).toEqual({ currency: "EUR", fallback: false });
  });

  it("falls back to first account then IDR", () => {
    expect(
      resolveReportingCurrency({
        baseCurrency: null,
        accounts: [{ currency: "EUR", isActive: true }],
      })
    ).toEqual({ currency: "EUR", fallback: true });
    expect(
      resolveReportingCurrency({ baseCurrency: null, accounts: [] })
    ).toEqual({ currency: "IDR", fallback: true });
  });

  it("detects other currencies", () => {
    expect(
      hasOtherCurrencies("IDR", [
        { currency: "IDR" },
        { currency: "EUR" },
      ])
    ).toBe(true);
  });
});
