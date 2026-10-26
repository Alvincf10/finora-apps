import { describe, expect, it } from "vitest";
import {
  applyTransactionEffect,
  isLiabilityAccount,
} from "@/lib/financial/balances";

describe("ledger transfer neutrality (same-currency accounts)", () => {
  it("transfer out decreases asset; transfer in increases asset", () => {
    const from = applyTransactionEffect(
      1_000_000,
      { type: "TRANSFER", amount: 200_000, transferDirection: "OUT" },
      "BANK"
    );
    const to = applyTransactionEffect(
      500_000,
      { type: "TRANSFER", amount: 200_000, transferDirection: "IN" },
      "CASH"
    );
    expect(from).toBe(800_000);
    expect(to).toBe(700_000);
    // Combined asset change nets to zero
    expect(from + to).toBe(1_000_000 + 500_000);
  });

  it("expense on asset decreases balance; income increases", () => {
    expect(
      applyTransactionEffect(1000, { type: "EXPENSE", amount: 300 }, "BANK")
    ).toBe(700);
    expect(
      applyTransactionEffect(1000, { type: "INCOME", amount: 300 }, "BANK")
    ).toBe(1300);
  });

  it("credit card charge increases outstanding; payment decreases", () => {
    expect(isLiabilityAccount("CREDIT_CARD")).toBe(true);
    expect(
      applyTransactionEffect(0, { type: "EXPENSE", amount: 500 }, "CREDIT_CARD")
    ).toBe(500);
    expect(
      applyTransactionEffect(
        500,
        { type: "TRANSFER", amount: 200, transferDirection: "IN" },
        "CREDIT_CARD"
      )
    ).toBe(300);
  });
});
