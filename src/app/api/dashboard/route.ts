import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import {
  getBudgetOverview,
  getCashFlowSeries,
  getExpenseBreakdown,
  getFinancialSummary,
} from "@/lib/financial/summary";
import { getDebtsDueThisMonth } from "@/lib/financial/debts-due";
import { getPayCycleBuffer } from "@/lib/financial/pay-cycle";
import { getSurvivalPlan } from "@/lib/financial/survival";
import { generateRecommendations } from "@/lib/financial/recommendations";
import { Transaction } from "@/models/Transaction";
import { Debt } from "@/models/Debt";
import { SavingsGoal } from "@/models/SavingsGoal";
import { Account } from "@/models/Account";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const year = Number(searchParams.get("year") ?? now.getFullYear());
    const month = Number(searchParams.get("month") ?? now.getMonth() + 1);
    const period = { year, month };

    const [
      summary,
      breakdown,
      budgets,
      cashFlow,
      recommendations,
      recentTransactions,
      debts,
      goals,
      accounts,
    ] = await Promise.all([
      getFinancialSummary(userId, period),
      getExpenseBreakdown(userId, period),
      getBudgetOverview(userId, period),
      getCashFlowSeries(userId, 6),
      generateRecommendations(userId, period),
      Transaction.find({
        userId,
        $or: [
          { type: { $ne: "TRANSFER" } },
          { transferDirection: "OUT" },
        ],
      })
        .sort({ date: -1 })
        .limit(8)
        .populate("accountId", "name")
        .populate("categoryId", "name"),
      Debt.find({ userId, status: "ACTIVE" }).limit(5),
      SavingsGoal.find({ userId, status: "ACTIVE" }),
      Account.find({ userId, isActive: true }),
    ]);

    const [debtsDueThisMonth, payCycleBuffer, survival] = await Promise.all([
      getDebtsDueThisMonth(userId, period, summary.currency),
      getPayCycleBuffer(userId),
      getSurvivalPlan(userId),
    ]);

    const goalsSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0);
    const goalsTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);

    return ok({
      summary,
      breakdown,
      budgets,
      cashFlow,
      recommendations,
      recentTransactions,
      debts,
      debtsDueThisMonth,
      payCycleBuffer,
      survival,
      goals: goals.slice(0, 5),
      goalsSaved,
      goalsTarget,
      accounts,
    });
  } catch (error) {
    return handleError(error);
  }
}
