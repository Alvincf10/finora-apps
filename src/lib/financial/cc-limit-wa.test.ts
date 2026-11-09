import { beforeEach, describe, expect, it, vi } from "vitest";

const findOneLean = vi.fn();
const enqueueCcLimitAlert = vi.fn();

vi.mock("@/models/Account", () => ({
  Account: {
    findOne: vi.fn(() => ({ lean: findOneLean })),
  },
}));

vi.mock("@/lib/whatsapp/outbound", () => ({
  enqueueCcLimitAlert: (...args: unknown[]) => enqueueCcLimitAlert(...args),
}));

import { maybeNotifyCcLimit } from "@/lib/financial/cc-limit-wa";

const userId = "user-1";
const accountId = "acc-cc-1";

function ccAccount(balance: number, limit = 1_000_000) {
  return {
    _id: accountId,
    userId,
    isActive: true,
    type: "CREDIT_CARD",
    name: "BRI Card",
    currency: "IDR",
    creditLimit: limit,
    currentBalance: balance,
  };
}

describe("maybeNotifyCcLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findOneLean.mockReset();
    enqueueCcLimitAlert.mockReset();
    enqueueCcLimitAlert.mockResolvedValue({ id: "out-1", status: "pending" });
  });

  it("does nothing when accountId is missing", async () => {
    await maybeNotifyCcLimit(userId, null);
    await maybeNotifyCcLimit(userId, undefined);
    expect(findOneLean).not.toHaveBeenCalled();
    expect(enqueueCcLimitAlert).not.toHaveBeenCalled();
  });

  it("does not enqueue for non-liability (bank) account", async () => {
    findOneLean.mockResolvedValue({
      ...ccAccount(0),
      type: "BANK",
    });
    await maybeNotifyCcLimit(userId, accountId);
    expect(enqueueCcLimitAlert).not.toHaveBeenCalled();
  });

  it("enqueues CC_LIMIT_WARNING at ~93% utilization with monthly dedupe key", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 9, 12, 0, 0)); // Nov 2026
    findOneLean.mockResolvedValue(ccAccount(930_000));

    await maybeNotifyCcLimit(userId, accountId);

    expect(enqueueCcLimitAlert).toHaveBeenCalledTimes(1);
    const [, payload] = enqueueCcLimitAlert.mock.calls[0] as [
      string,
      { dedupeKey: string; kind: string; body: string },
    ];
    expect(payload.kind).toBe("CC_LIMIT_WARNING");
    expect(payload.dedupeKey).toBe(`cc-warn:2026-11:${accountId}`);
    expect(payload.body.startsWith("Vira ·")).toBe(true);
    vi.useRealTimers();
  });

  it("enqueues CC_LIMIT_OVERFLOW when utilization is 100% or available is 0", async () => {
    findOneLean.mockResolvedValue(ccAccount(1_000_000));
    await maybeNotifyCcLimit(userId, accountId);

    expect(enqueueCcLimitAlert).toHaveBeenCalledTimes(1);
    const [, payload] = enqueueCcLimitAlert.mock.calls[0] as [
      string,
      { kind: string; body: string },
    ];
    expect(payload.kind).toBe("CC_LIMIT_OVERFLOW");
    expect(payload.body).toContain("Limit CC habis");
  });

  it("does not throw when enqueue fails", async () => {
    findOneLean.mockResolvedValue(ccAccount(900_000));
    enqueueCcLimitAlert.mockRejectedValue(new Error("WHATSAPP_DOWN"));
    await expect(maybeNotifyCcLimit(userId, accountId)).resolves.toBeUndefined();
  });
});
