import { describe, expect, it } from "vitest";
import { toCreditCardSummary } from "@/lib/financial/credit-cards";

function mockCard(
  overrides: Partial<Parameters<typeof toCreditCardSummary>[0]> = {}
) {
  return {
    _id: { toString: () => "acc-1" },
    name: "Visa",
    type: "CREDIT_CARD",
    currency: "IDR",
    creditLimit: 10_000_000,
    currentBalance: 3_000_000,
    statementDueAmount: 2_500_000,
    statementDueDay: 15,
    debitMode: false,
    ...overrides,
  };
}

describe("toCreditCardSummary", () => {
  it("returns null for non-liability account types", () => {
    expect(toCreditCardSummary(mockCard({ type: "BANK" }))).toBeNull();
  });

  it("maps utilization, available, and statement due", () => {
    const s = toCreditCardSummary(mockCard());
    expect(s).not.toBeNull();
    expect(s!.accountId).toBe("acc-1");
    expect(s!.outstanding).toBe(3_000_000);
    expect(s!.available).toBe(7_000_000);
    expect(s!.utilizationPct).toBe(30);
    expect(s!.statementDueAmount).toBe(2_500_000);
    expect(s!.statementDueDay).toBe(15);
    expect(s!.debitMode).toBe(false);
  });

  it("clamps statement due to outstanding and floors negatives", () => {
    const s = toCreditCardSummary(
      mockCard({
        creditLimit: -1,
        currentBalance: 1_000_000,
        statementDueAmount: 5_000_000,
      })
    );
    expect(s!.creditLimit).toBe(0);
    expect(s!.statementDueAmount).toBe(1_000_000);
  });

  it("defaults statement due to outstanding when unset", () => {
    const s = toCreditCardSummary(
      mockCard({ statementDueAmount: null, currentBalance: 500_000 })
    );
    expect(s!.statementDueAmount).toBe(500_000);
  });

  it("returns null utilization when limit is zero", () => {
    const s = toCreditCardSummary(mockCard({ creditLimit: 0 }));
    expect(s!.utilizationPct).toBeNull();
  });
});
