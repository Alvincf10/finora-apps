import { describe, expect, it } from "vitest";
import {
  ccSpendHeadroom,
  isCcExpenseBlocked,
} from "@/lib/financial/cc-spend-limit";

describe("isCcExpenseBlocked / ccSpendHeadroom", () => {
  const card = {
    type: "CREDIT_CARD",
    creditLimit: 1_000_000,
    currentBalance: 700_000,
  };

  it("ignores non-CC accounts", () => {
    expect(
      isCcExpenseBlocked(
        { type: "BANK", creditLimit: 0, currentBalance: 0 },
        999
      )
    ).toBe(false);
    expect(
      ccSpendHeadroom({ type: "BANK", creditLimit: 0, currentBalance: 0 })
    ).toBeNull();
  });

  it("blocks when available is already 0", () => {
    expect(
      isCcExpenseBlocked(
        {
          type: "CREDIT_CARD",
          creditLimit: 500_000,
          currentBalance: 500_000,
        },
        1
      )
    ).toBe(true);
    expect(
      isCcExpenseBlocked(
        {
          type: "CREDIT_CARD",
          creditLimit: 500_000,
          currentBalance: 500_000,
        },
        0
      )
    ).toBe(true);
  });

  it("blocks when amount exceeds available", () => {
    // available = 300_000
    expect(isCcExpenseBlocked(card, 300_001)).toBe(true);
    expect(isCcExpenseBlocked(card, 300_000)).toBe(false);
    expect(isCcExpenseBlocked(card, 1)).toBe(false);
  });

  it("releases prior expense amount when editing same card", () => {
    expect(ccSpendHeadroom(card, 200_000)).toBe(500_000);
    expect(isCcExpenseBlocked(card, 500_000, 200_000)).toBe(false);
    expect(isCcExpenseBlocked(card, 500_001, 200_000)).toBe(true);
  });
});
