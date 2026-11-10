import { describe, expect, it } from "vitest";
import {
  buildPaydayLeftoverEnvelopes,
  countsAgainstCashTotal,
  suggestPhysicalWallet,
  sumCashAllocated,
} from "@/lib/financial/payday-leftover";

describe("countsAgainstCashTotal", () => {
  it("treats CC spend cap as non-cash", () => {
    expect(countsAgainstCashTotal("CC_SPEND_CAP")).toBe(false);
    expect(countsAgainstCashTotal("LIVING")).toBe(true);
    expect(countsAgainstCashTotal("CASH_BUFFER")).toBe(true);
  });
});

describe("sumCashAllocated", () => {
  it("excludes CC spend cap from cash total", () => {
    expect(
      sumCashAllocated([
        { kind: "DEBT", amount: 1_000_000 },
        { kind: "LIVING", amount: 500_000 },
        { kind: "CC_SPEND_CAP", amount: 8_000_000 },
      ])
    ).toBe(1_500_000);
  });
});

describe("suggestPhysicalWallet", () => {
  it("keeps IDR wallet small with floor and cap", () => {
    expect(suggestPhysicalWallet(10_000_000, "IDR")).toBe(500_000);
    expect(suggestPhysicalWallet(2_000_000, "IDR")).toBe(100_000);
    expect(suggestPhysicalWallet(50_000, "IDR")).toBe(2_500);
  });
});

describe("buildPaydayLeftoverEnvelopes", () => {
  it("splits goals → physical wallet → debit, and adds CC cap without consuming cash", () => {
    const envelopes = buildPaydayLeftoverEnvelopes({
      leftoverCash: 4_000_000,
      currency: "IDR",
      priorityGoal: {
        id: "g1",
        name: "Basic tabungan",
        targetAmount: 10_000_000,
        currentAmount: 0,
      },
      ccSpendCap: 7_500_000,
    });

    const byKind = Object.fromEntries(envelopes.map((e) => [e.kind, e]));
    expect(byKind.GOALS?.amount).toBe(1_000_000); // 25%
    expect(byKind.CASH_BUFFER?.amount).toBe(150_000); // 5% of 3jt, floor 100k
    expect(byKind.LIVING?.amount).toBe(2_850_000);
    expect(byKind.CC_SPEND_CAP?.amount).toBe(7_500_000);
    expect(byKind.CASH_BUFFER?.label).toMatch(/dompet/i);
    expect(byKind.LIVING?.label).toMatch(/debit/i);

    expect(sumCashAllocated(envelopes)).toBe(4_000_000);
  });

  it("does not auto-add CC cap when a manual one already exists", () => {
    const envelopes = buildPaydayLeftoverEnvelopes({
      leftoverCash: 1_000_000,
      currency: "IDR",
      priorityGoal: null,
      ccSpendCap: 5_000_000,
      manualLeftovers: [
        {
          key: "cc_spend_cap",
          label: "Custom CC",
          amount: 2_000_000,
          source: "MANUAL",
          kind: "CC_SPEND_CAP",
        },
      ],
    });

    const ccCaps = envelopes.filter((e) => e.kind === "CC_SPEND_CAP");
    expect(ccCaps).toHaveLength(1);
    expect(ccCaps[0]?.amount).toBe(2_000_000);
  });
});
