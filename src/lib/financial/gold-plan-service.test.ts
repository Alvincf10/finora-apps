import { describe, expect, it } from "vitest";
import { replayPayments } from "./gold-plan-service";

describe("replayPayments reducing-balance", () => {
  it("only reduces principal; records interest", () => {
    const result = replayPayments({
      principal: 44_400_000,
      payments: [
        {
          amount: 2_600_000,
          principalPortion: 1_268_000,
          interestPortion: 1_332_000,
        },
        {
          amount: 11_295_000,
          principalPortion: 10_000_000,
          interestPortion: 1_295_000,
        },
      ],
    });
    expect(result.remainingPrincipal).toBe(33_132_000);
    expect(result.principalPaid).toBe(11_268_000);
    expect(result.interestPaid).toBe(2_627_000);
  });
});
