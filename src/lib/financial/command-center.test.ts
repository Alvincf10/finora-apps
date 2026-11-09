import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/financial/pay-cycle", () => ({
  getUserPaydayDay: vi.fn(),
  periodFromDate: vi.fn(),
}));
vi.mock("@/lib/financial/metrics/financial-health", () => ({
  getFinancialHealth: vi.fn(),
}));
vi.mock("@/lib/financial/forecast/cash-flow-forecast-service", () => ({
  getHorizonCashFlowForecast: vi.fn(),
}));
vi.mock("@/lib/financial/recommendations/action-center", () => ({
  getActionCenter: vi.fn(),
}));
vi.mock("@/lib/financial/wealth-ladder", () => ({
  evaluateWealthLadder: vi.fn(),
}));
vi.mock("@/lib/financial/summary", () => ({
  getCashFlowSeries: vi.fn(),
}));
vi.mock("@/models/PaydayAllocation", () => ({
  PaydayAllocation: {
    findOne: vi.fn(),
  },
}));

import { getUserPaydayDay, periodFromDate } from "@/lib/financial/pay-cycle";
import { getFinancialHealth } from "@/lib/financial/metrics/financial-health";
import { getHorizonCashFlowForecast } from "@/lib/financial/forecast/cash-flow-forecast-service";
import { getActionCenter } from "@/lib/financial/recommendations/action-center";
import { evaluateWealthLadder } from "@/lib/financial/wealth-ladder";
import { getCashFlowSeries } from "@/lib/financial/summary";
import { PaydayAllocation } from "@/models/PaydayAllocation";
import { getCommandCenter } from "@/lib/financial/command-center";

function action(id: string) {
  return {
    id,
    issueKey: `k:${id}`,
    source: "ALERT",
    type: "BUDGET_OVERFLOW",
    priority: "HIGH",
    title: `t${id}`,
    message: `m${id}`,
    href: "/budget",
  };
}

describe("getCommandCenter", () => {
  beforeEach(() => {
    vi.mocked(getUserPaydayDay).mockResolvedValue(25);
    vi.mocked(periodFromDate).mockReturnValue({ year: 2026, month: 11 });
    vi.mocked(getFinancialHealth).mockResolvedValue({
      currency: "IDR",
      income: { value: 10_000_000 },
      expense: { value: 6_000_000 },
      netCashFlow: { value: 4_000_000 },
      savingsRate: { value: 40, available: true },
      liquidAssets: { value: 5_000_000 },
      netWorth: { value: 3_000_000 },
      totalLiabilities: { value: 2_000_000 },
      emergencyCoverageMonths: { value: 2 },
      quality: [],
      rulesVersion: "phase1-fr01-1",
      period: { label: "cycle" },
    } as never);
    vi.mocked(getHorizonCashFlowForecast).mockResolvedValue({
      horizonDays: 30,
      startingBalance: 5,
      endingBalance: 1,
      lowestBalance: 0,
      shortfalls: [],
      incomeClass: "SCHEDULED_SALARY",
      assumptions: ["a", "b", "c", "d"],
      rulesVersion: "v1",
    } as never);
    vi.mocked(getActionCenter).mockResolvedValue({
      counts: { CRITICAL: 1 },
      actions: [1, 2, 3, 4, 5, 6].map((n) => action(String(n))),
    } as never);
    vi.mocked(evaluateWealthLadder).mockResolvedValue({
      currentStep: 2,
      progressPercent: 40,
      completedCount: 1,
      applicableSteps: 5,
      steps: [{ status: "FOCUS", title: "Emergency" }],
      starterGoalMissing: false,
      ruleVersion: "wl-1",
    } as never);
    vi.mocked(getCashFlowSeries).mockResolvedValue([
      { label: "prev", income: 9, expense: 5, net: 4, currency: "IDR" },
      { label: "curr", income: 10, expense: 6, net: 4, currency: "IDR" },
    ] as never);
    vi.mocked(PaydayAllocation.findOne).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          status: "ACTIVE",
          currency: "IDR",
          salary: 10_000_000,
          startingCash: 1_000_000,
          envelopes: [{ amount: 100 }, { amount: 200 }],
          cycleStart: new Date("2026-10-23"),
          cycleEnd: new Date("2026-11-24"),
        }),
      }),
    } as never);
  });

  it("composes period change, top 5 actions, and payday totals", async () => {
    const out = await getCommandCenter("u1");
    expect(out.period).toEqual({ year: 2026, month: 11 });
    expect(out.actions.top).toHaveLength(5);
    expect(out.periodChange).toEqual({
      previousLabel: "prev",
      currentLabel: "curr",
      incomeDelta: 1,
      expenseDelta: 1,
      netDelta: 0,
      currency: "IDR",
    });
    expect(out.payday?.allocated).toBe(300);
    expect(out.payday?.remaining).toBe(10_000_000 + 1_000_000 - 300);
    expect(out.health.income).toBe(10_000_000);
    expect(out.roadmap.focusTitle).toBe("Emergency");
  });
});
