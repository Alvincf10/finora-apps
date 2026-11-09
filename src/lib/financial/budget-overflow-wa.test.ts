import { beforeEach, describe, expect, it, vi } from "vitest";

const getWeeklyBudgetSpent = vi.fn();
const enqueueBudgetAlert = vi.fn();

vi.mock("@/lib/financial/weekly-budget", () => ({
  getWeeklyBudgetSpent: (...args: unknown[]) => getWeeklyBudgetSpent(...args),
}));

vi.mock("@/lib/whatsapp/outbound", () => ({
  enqueueBudgetAlert: (...args: unknown[]) => enqueueBudgetAlert(...args),
}));

import { maybeNotifyBudgetOverflow } from "@/lib/financial/budget-overflow-wa";

const userId = "user-1";
const categoryId = "cat-food";

function budgetRow(
  overrides: Partial<{
    budgetAmount: number;
    actualAmount: number;
    utilizationPercentage: number;
    weekKey: string;
    label: string;
    categoryName: string;
    currency: string;
  }> = {}
) {
  return {
    weekKey: "2026-11-03",
    label: "03/11–09/11/2026",
    budgetAmount: 1_000_000,
    actualAmount: 500_000,
    utilizationPercentage: 50,
    currency: "IDR",
    categoryName: "Food",
    ...overrides,
  };
}

describe("maybeNotifyBudgetOverflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWeeklyBudgetSpent.mockReset();
    enqueueBudgetAlert.mockReset();
    enqueueBudgetAlert.mockResolvedValue({ id: "out-1", status: "pending" });
  });

  it("does nothing when categoryId is null", async () => {
    await maybeNotifyBudgetOverflow(userId, null);
    expect(getWeeklyBudgetSpent).not.toHaveBeenCalled();
    expect(enqueueBudgetAlert).not.toHaveBeenCalled();
  });

  it("enqueues BUDGET_OVERFLOW when over budget", async () => {
    getWeeklyBudgetSpent.mockResolvedValue(
      budgetRow({
        budgetAmount: 400_000,
        actualAmount: 500_000,
        utilizationPercentage: 125,
      })
    );
    await maybeNotifyBudgetOverflow(userId, categoryId);

    expect(enqueueBudgetAlert).toHaveBeenCalledTimes(1);
    const [, payload] = enqueueBudgetAlert.mock.calls[0] as [
      string,
      { kind: string; dedupeKey: string },
    ];
    expect(payload.kind).toBe("BUDGET_OVERFLOW");
    expect(payload.dedupeKey).toBe(`budget-over:2026-11-03:${categoryId}`);
  });

  it("enqueues BUDGET_WARNING between 80% and 99%", async () => {
    getWeeklyBudgetSpent.mockResolvedValue(
      budgetRow({
        budgetAmount: 1_000_000,
        actualAmount: 870_000,
        utilizationPercentage: 87,
      })
    );
    await maybeNotifyBudgetOverflow(userId, categoryId);

    expect(enqueueBudgetAlert).toHaveBeenCalledTimes(1);
    const [, payload] = enqueueBudgetAlert.mock.calls[0] as [
      string,
      { kind: string; dedupeKey: string },
    ];
    expect(payload.kind).toBe("BUDGET_WARNING");
    expect(payload.dedupeKey).toBe(`budget-warn:2026-11-03:${categoryId}`);
  });

  it("does not enqueue under 80% utilization", async () => {
    getWeeklyBudgetSpent.mockResolvedValue(
      budgetRow({
        budgetAmount: 1_000_000,
        actualAmount: 700_000,
        utilizationPercentage: 70,
      })
    );
    await maybeNotifyBudgetOverflow(userId, categoryId);
    expect(enqueueBudgetAlert).not.toHaveBeenCalled();
  });
});
