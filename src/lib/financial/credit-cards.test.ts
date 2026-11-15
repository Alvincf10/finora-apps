import { describe, expect, it } from "vitest";
import {
  creditCardStatementDueDate,
  resolveCreditCardStatementDue,
  toCreditCardSummary,
} from "@/lib/financial/credit-cards";

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

describe("resolveCreditCardStatementDue", () => {
  it("uses outstanding when statement unset (normal CC)", () => {
    expect(
      resolveCreditCardStatementDue({
        currentBalance: 500_000,
        statementDueAmount: null,
        debitMode: false,
      })
    ).toBe(500_000);
  });

  it("keeps explicit 0 for normal CC", () => {
    expect(
      resolveCreditCardStatementDue({
        currentBalance: 500_000,
        statementDueAmount: 0,
        debitMode: false,
      })
    ).toBe(0);
  });

  it("debit-mode falls back to outstanding when statement is 0/unset", () => {
    expect(
      resolveCreditCardStatementDue({
        currentBalance: 2_992_012,
        statementDueAmount: 0,
        debitMode: true,
      })
    ).toBe(2_992_012);
    expect(
      resolveCreditCardStatementDue({
        currentBalance: 2_992_012,
        statementDueAmount: null,
        debitMode: true,
      })
    ).toBe(2_992_012);
  });

  it("debit-mode respects positive bank statement amount", () => {
    expect(
      resolveCreditCardStatementDue({
        currentBalance: 3_000_000,
        statementDueAmount: 2_500_000,
        debitMode: true,
      })
    ).toBe(2_500_000);
  });
});

describe("creditCardStatementDueDate", () => {
  it("finds due day inside the debt window", () => {
    const start = new Date(2026, 9, 23);
    const end = new Date(2026, 10, 30, 23, 59, 59, 999);
    const due = creditCardStatementDueDate(25, start, end);
    expect(due?.getFullYear()).toBe(2026);
    expect(due?.getMonth()).toBe(10);
    expect(due?.getDate()).toBe(25);
  });

  it("returns undefined when day is outside the window", () => {
    const start = new Date(2026, 9, 26);
    const end = new Date(2026, 10, 24, 23, 59, 59, 999);
    expect(creditCardStatementDueDate(25, start, end)).toBeUndefined();
  });
});

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

  it("debit-mode maps zero statement to outstanding", () => {
    const s = toCreditCardSummary(
      mockCard({
        debitMode: true,
        statementDueAmount: 0,
        currentBalance: 2_992_012,
      })
    );
    expect(s!.statementDueAmount).toBe(2_992_012);
    expect(s!.debitMode).toBe(true);
  });

  it("returns null utilization when limit is zero", () => {
    const s = toCreditCardSummary(mockCard({ creditLimit: 0 }));
    expect(s!.utilizationPct).toBeNull();
  });
});
