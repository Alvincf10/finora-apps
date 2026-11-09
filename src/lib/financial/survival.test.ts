import { beforeEach, describe, expect, it, vi } from "vitest";

const userLean = vi.fn();
const accountLean = vi.fn();
const txLean = vi.fn();
const getFixedCostsInRange = vi.fn();

vi.mock("@/models/User", () => ({
  User: { findById: vi.fn(() => ({ lean: userLean })) },
}));

vi.mock("@/models/Account", () => ({
  Account: { find: vi.fn(() => ({ lean: accountLean })) },
}));

vi.mock("@/models/Transaction", () => ({
  Transaction: { find: vi.fn(() => ({ lean: txLean })) },
}));

vi.mock("@/lib/financial/fixed-costs", () => ({
  getFixedCostsInRange: (...args: unknown[]) => getFixedCostsInRange(...args),
}));

import { getSurvivalPlan } from "@/lib/financial/survival";

const userId = "user-1";

describe("getSurvivalPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userLean.mockReset();
    accountLean.mockReset();
    txLean.mockReset();
    getFixedCostsInRange.mockReset();

    userLean.mockResolvedValue({ paydayDay: 25, baseCurrency: "IDR" });
    txLean.mockResolvedValue([]);
    getFixedCostsInRange.mockResolvedValue({
      items: [],
      total: 200_000,
      currency: "IDR",
    });
  });

  it("ACTIVE plan computes dailyBudget from spendable cash and days left", async () => {
    const now = new Date(2026, 10, 9, 12, 0, 0); // 16 days before payday 25
    accountLean.mockResolvedValue([
      { type: "BANK", currentBalance: 1_000_000 },
    ]);

    const plan = await getSurvivalPlan(userId, now);

    expect(plan.status).toBe("ACTIVE");
    expect(plan.daysLeft).toBeGreaterThan(0);
    expect(plan.cashOnHand).toBe(1_000_000);
    expect(plan.fixedCostsBeforePayday).toBe(200_000);
    expect(plan.spendableCash).toBe(800_000);
    expect(plan.dailyBudget).toBe(Math.floor(800_000 / plan.daysLeft));
  });

  it("NO_CASH when spendable cash is zero after fixed costs", async () => {
    const now = new Date(2026, 10, 9, 12, 0, 0);
    accountLean.mockResolvedValue([
      { type: "BANK", currentBalance: 150_000 },
    ]);
    getFixedCostsInRange.mockResolvedValue({
      items: [],
      total: 200_000,
      currency: "IDR",
    });

    const plan = await getSurvivalPlan(userId, now);

    expect(plan.spendableCash).toBe(0);
    expect(plan.status).toBe("NO_CASH");
    expect(plan.dailyBudget).toBe(0);
  });

  it("PAYDAY status when daysLeft is 0", async () => {
    const now = new Date(2026, 10, 25, 12, 0, 0); // on payday 25
    accountLean.mockResolvedValue([
      { type: "BANK", currentBalance: 2_000_000 },
    ]);
    getFixedCostsInRange.mockResolvedValue({
      items: [],
      total: 0,
      currency: "IDR",
    });

    const plan = await getSurvivalPlan(userId, now);

    expect(plan.daysLeft).toBe(0);
    expect(plan.status).toBe("PAYDAY");
  });
});
