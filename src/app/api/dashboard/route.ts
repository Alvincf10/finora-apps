import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import {
  getBudgetOverview,
  getCashFlowSeries,
  getFinancialSummary,
} from "@/lib/financial/summary";
import { getDebtsDueThisMonth } from "@/lib/financial/debts-due";
import {
  getCycleExpenseBreakdown,
  getPayCycleBuffer,
  getUserPaydayDay,
  periodFromDate,
} from "@/lib/financial/pay-cycle";
import { getSurvivalPlan } from "@/lib/financial/survival";
import { generateRecommendations } from "@/lib/financial/recommendations";
import { parsePeriod } from "@/lib/financial/phase2-service";
import { Transaction } from "@/models/Transaction";
import { Debt } from "@/models/Debt";
import { SavingsGoal } from "@/models/SavingsGoal";
import { Account } from "@/models/Account";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const paydayDay = await getUserPaydayDay(userId);
    const period = searchParams.get("year") && searchParams.get("month")
      ? await parsePeriod(searchParams, userId)
      : periodFromDate(paydayDay, now);

    const payCycleBuffer = await getPayCycleBuffer(userId, now);
    const cycle = payCycleBuffer.cycle;

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
      debtsDueThisMonth,
      survival,
    ] = await Promise.all([
      getFinancialSummary(userId, period),
      getCycleExpenseBreakdown(userId, cycle.start, cycle.end),
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
      getDebtsDueThisMonth(userId, period, payCycleBuffer.currency),
      getSurvivalPlan(userId),
    ]);

    const goalsSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0);
    const goalsTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);

    const cycleIncome = payCycleBuffer.monthlySalary + payCycleBuffer.otherIncome;
    const cycleExpense = payCycleBuffer.expenses;
    const cycleNet = cycleIncome - cycleExpense;

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
      cycleStats: {
        label: cycle.label,
        start: cycle.start.toISOString(),
        end: cycle.end.toISOString(),
        income: cycleIncome,
        expense: cycleExpense,
        net: cycleNet,
        debtRemaining: payCycleBuffer.debtRemaining,
        currency: payCycleBuffer.currency,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
