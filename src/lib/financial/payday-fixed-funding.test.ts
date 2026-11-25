import { describe, expect, it } from "vitest";
import {
  isFixedReserveAccountName,
  resolveFixedReserveFunding,
  sumCashAllocatedWithFixedFunding,
  sumUnpaidFixedAmount,
} from "@/lib/financial/payday-fixed-funding";

describe("resolveFixedReserveFunding", () => {
  it("fully funds when reserve covers fixed total", () => {
    expect(resolveFixedReserveFunding(942_001, 942_000)).toEqual({
      reserve: 942_001,
      fixedTotal: 942_000,
      fundedAmount: 942_000,
      shortfall: 0,
      fullyFunded: true,
    });
  });

  it("reports shortfall when reserve is partial", () => {
    expect(resolveFixedReserveFunding(400_000, 942_000)).toEqual({
      reserve: 400_000,
      fixedTotal: 942_000,
      fundedAmount: 400_000,
      shortfall: 542_000,
      fullyFunded: false,
    });
  });

  it("shortfall equals total when reserve is empty", () => {
    expect(resolveFixedReserveFunding(0, 100_000).shortfall).toBe(100_000);
    expect(resolveFixedReserveFunding(0, 100_000).fullyFunded).toBe(false);
  });

  it("fullyFunded is false when there are no fixed bills", () => {
    expect(resolveFixedReserveFunding(942_000, 0).fullyFunded).toBe(false);
  });
});

describe("sumUnpaidFixedAmount / sumCashAllocatedWithFixedFunding", () => {
  const envelopes = [
    { kind: "DEBT", amount: 500_000 },
    { kind: "FIXED", amount: 600_000, paid: false },
    { kind: "FIXED", amount: 342_000, paid: false },
    { kind: "FIXED", amount: 50_000, paid: true },
    { kind: "GOALS", amount: 100_000 },
    { kind: "CC_SPEND_CAP", amount: 999_999 },
  ];

  it("sums only unpaid FIXED", () => {
    expect(sumUnpaidFixedAmount(envelopes)).toBe(942_000);
  });

  it("counts FIXED shortfall only against cash total", () => {
    const funding = resolveFixedReserveFunding(942_001, 942_000);
    expect(
      sumCashAllocatedWithFixedFunding(
        envelopes,
        funding,
        (kind) => kind !== "CC_SPEND_CAP"
      )
    ).toBe(600_000); // debt 500k + goals 100k + shortfall 0
  });

  it("adds shortfall when reserve is short", () => {
    const funding = resolveFixedReserveFunding(200_000, 942_000);
    expect(
      sumCashAllocatedWithFixedFunding(
        envelopes,
        funding,
        (kind) => kind !== "CC_SPEND_CAP"
      )
    ).toBe(600_000 + 742_000);
  });
});

describe("isFixedReserveAccountName", () => {
  it("matches ATM Fixed style names", () => {
    expect(isFixedReserveAccountName("ATM Fixed cost")).toBe(true);
    expect(isFixedReserveAccountName("BCA")).toBe(false);
  });
});
