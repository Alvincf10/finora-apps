import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const debtLean = vi.fn();
const fixedLean = vi.fn();
const accountLean = vi.fn();
const getBudgetOverview = vi.fn();
const getUserPaydayDay = vi.fn();

vi.mock("@/models/Debt", () => ({
  Debt: { find: vi.fn(() => ({ lean: debtLean })) },
}));

vi.mock("@/models/FixedCost", () => ({
  FixedCost: { find: vi.fn(() => ({ lean: fixedLean })) },
}));

vi.mock("@/models/Account", () => ({
  Account: { find: vi.fn(() => ({ lean: accountLean })) },
}));

vi.mock("@/lib/financial/summary", () => ({
  getBudgetOverview: (...args: unknown[]) => getBudgetOverview(...args),
}));

vi.mock("@/lib/financial/pay-cycle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/financial/pay-cycle")>();
  return {
    ...actual,
    getUserPaydayDay: (...args: unknown[]) => getUserPaydayDay(...args),
  };
});

import { getAlertsForUser } from "@/lib/financial/alerts";

const userId = "user-1";
const debtId = "debt-1";
const cardId = "card-1";
const categoryId = "cat-1";

describe("getAlertsForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    debtLean.mockReset();
    fixedLean.mockReset();
    accountLean.mockReset();
    getBudgetOverview.mockReset();
    getUserPaydayDay.mockReset();

    getUserPaydayDay.mockResolvedValue(25);
    fixedLean.mockResolvedValue([]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 9, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("includes overdue debt as DEBT_OVERDUE CRITICAL", async () => {
    debtLean.mockResolvedValue([
      {
        _id: debtId,
        name: "KPR",
        dueDate: new Date(2026, 10, 1),
        remainingAmount: 5_000_000,
        currency: "IDR",
        plannedPayment: 1_000_000,
      },
    ]);
    accountLean.mockResolvedValue([]);
    getBudgetOverview.mockResolvedValue([]);

    const alerts = await getAlertsForUser(userId);
    const debt = alerts.find((a) => a.kind === "DEBT_OVERDUE");
    expect(debt).toBeDefined();
    expect(debt!.severity).toBe("CRITICAL");
  });

  it("includes CC at 90% as CC_LIMIT_WARNING", async () => {
    debtLean.mockResolvedValue([]);
    getBudgetOverview.mockResolvedValue([]);
    accountLean.mockResolvedValue([
      {
        _id: cardId,
        name: "Visa",
        type: "CREDIT_CARD",
        currency: "IDR",
        creditLimit: 10_000_000,
        currentBalance: 9_000_000,
      },
    ]);

    const alerts = await getAlertsForUser(userId);
    const cc = alerts.find((a) => a.kind === "CC_LIMIT_WARNING");
    expect(cc).toBeDefined();
    expect(cc!.severity).toBe("WARNING");
  });

  it("includes budget over as BUDGET_OVERFLOW", async () => {
    debtLean.mockResolvedValue([]);
    accountLean.mockResolvedValue([]);
    getBudgetOverview.mockResolvedValue([
      {
        categoryId,
        categoryName: "Food",
        budgetAmount: 1_000_000,
        actualAmount: 1_200_000,
        utilizationPercentage: 120,
        currency: "IDR",
        overBudget: true,
      },
    ]);

    const alerts = await getAlertsForUser(userId);
    const budget = alerts.find((a) => a.kind === "BUDGET_OVERFLOW");
    expect(budget).toBeDefined();
    expect(budget!.severity).toBe("CRITICAL");
  });

  it("sorts CRITICAL alerts before WARNING", async () => {
    debtLean.mockResolvedValue([
      {
        _id: debtId,
        name: "KPR",
        dueDate: new Date(2026, 10, 1),
        remainingAmount: 5_000_000,
        currency: "IDR",
        plannedPayment: 1_000_000,
      },
    ]);
    accountLean.mockResolvedValue([
      {
        _id: cardId,
        name: "Visa",
        type: "CREDIT_CARD",
        currency: "IDR",
        creditLimit: 10_000_000,
        currentBalance: 9_000_000,
      },
    ]);
    getBudgetOverview.mockResolvedValue([]);

    const alerts = await getAlertsForUser(userId);
    const criticalIdx = alerts.findIndex((a) => a.severity === "CRITICAL");
    const warningIdx = alerts.findIndex((a) => a.severity === "WARNING");
    expect(criticalIdx).toBeGreaterThanOrEqual(0);
    expect(warningIdx).toBeGreaterThanOrEqual(0);
    expect(criticalIdx).toBeLessThan(warningIdx);
  });
});
