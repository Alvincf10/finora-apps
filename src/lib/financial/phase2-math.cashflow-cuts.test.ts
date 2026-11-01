import { describe, expect, it } from "vitest";
import {
  buildCashflowCutMessage,
  isCuttableCategory,
  suggestCashflowCuts,
} from "./phase2-math";

describe("isCuttableCategory", () => {
  it("allows discretionary variable spend", () => {
    expect(isCuttableCategory("Coffee", "DISCRETIONARY", "VARIABLE")).toBe(
      true
    );
  });

  it("blocks fixed, essential, debt-like names", () => {
    expect(isCuttableCategory("Netflix", "DISCRETIONARY", "FIXED")).toBe(false);
    expect(isCuttableCategory("Groceries", "ESSENTIAL", "VARIABLE")).toBe(
      false
    );
    expect(isCuttableCategory("Cicilan motor", "UNKNOWN", "VARIABLE")).toBe(
      false
    );
  });
});

describe("suggestCashflowCuts", () => {
  const categories = [
    {
      categoryId: "1",
      categoryName: "Makan di luar",
      currentAmount: 800_000,
      classification: "DISCRETIONARY",
      nature: "VARIABLE",
    },
    {
      categoryId: "2",
      categoryName: "Ojek",
      currentAmount: 400_000,
      classification: "DISCRETIONARY",
      nature: "VARIABLE",
    },
    {
      categoryId: "3",
      categoryName: "Belanja",
      currentAmount: 300_000,
      classification: "UNKNOWN",
      nature: "VARIABLE",
    },
    {
      categoryId: "4",
      categoryName: "Sewa",
      currentAmount: 2_000_000,
      classification: "ESSENTIAL",
      nature: "FIXED",
    },
  ];

  it("covers a small deficit from top discretionary categories", () => {
    const result = suggestCashflowCuts({
      deficit: 317_217,
      currency: "IDR",
      categories,
    });

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.categoryName).toBe("Makan di luar");
    expect(result.suggestions[0]?.suggestedCut).toBe(317_217);
    expect(result.remainingDeficit).toBe(0);
    expect(result.coveredAmount).toBe(317_217);
  });

  it("splits a larger deficit across up to 3 cuttable categories", () => {
    const result = suggestCashflowCuts({
      deficit: 900_000,
      currency: "IDR",
      categories,
    });

    expect(result.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(result.suggestions.length).toBeLessThanOrEqual(3);
    expect(result.suggestions.every((s) => s.categoryName !== "Sewa")).toBe(
      true
    );
    expect(result.coveredAmount).toBeGreaterThan(0);
    expect(
      result.suggestions.reduce((sum, s) => sum + s.suggestedCut, 0)
    ).toBe(result.coveredAmount);
  });

  it("returns empty when only non-cuttable spend exists", () => {
    const result = suggestCashflowCuts({
      deficit: 100_000,
      currency: "IDR",
      categories: [
        {
          categoryId: "4",
          categoryName: "Sewa",
          currentAmount: 2_000_000,
          classification: "ESSENTIAL",
          nature: "FIXED",
        },
      ],
    });
    expect(result.suggestions).toHaveLength(0);
    expect(result.remainingDeficit).toBe(100_000);
  });
});

describe("buildCashflowCutMessage", () => {
  const formatMoney = (amount: number) => `Rp ${amount}`;

  it("lists concrete cut targets", () => {
    const message = buildCashflowCutMessage({
      deficit: 317_217,
      currency: "IDR",
      suggestions: [
        {
          categoryId: "1",
          categoryName: "Makan di luar",
          currentAmount: 800_000,
          suggestedCut: 200_000,
          classification: "DISCRETIONARY",
        },
        {
          categoryId: "2",
          categoryName: "Ojek",
          currentAmount: 400_000,
          suggestedCut: 117_217,
          classification: "DISCRETIONARY",
        },
      ],
      remainingDeficit: 0,
      formatMoney: formatMoney as never,
    });

    expect(message).toContain("317217");
    expect(message).toContain("Makan di luar");
    expect(message).toContain("Ojek");
    expect(message).toContain("Coba kurangi");
  });

  it("explains when nothing cuttable remains", () => {
    const message = buildCashflowCutMessage({
      deficit: 500_000,
      currency: "IDR",
      suggestions: [],
      remainingDeficit: 500_000,
      formatMoney: formatMoney as never,
    });
    expect(message).toContain("fixed/essential");
  });
});
