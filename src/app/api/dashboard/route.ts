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
import { getCommandCenter } from "@/lib/financial/command-center";
import { Transaction } from "@/models/Transaction";
import { Debt } from "@/models/Debt";
import { SavingsGoal } from "@/models/SavingsGoal";
import { Account } from "@/models/Account";
import { isLiabilityAccount } from "@/lib/financial/balances";
import { toCreditCardSummary } from "@/lib/financial/credit-cards";
import type { AccountType, Currency } from "@/types";

function isFixedReserveAccount(name: string) {
  return /fixed/i.test(name);
}

function buildCashPockets(
  accounts: Array<{
    _id: { toString(): string };
    name: string;
    type: string;
    currency: string;
    currentBalance?: number | null;
    creditLimit?: number | null;
    statementDueAmount?: number | null;
    statementDueDay?: number | null;
    debitMode?: boolean | null;
    isActive?: boolean;
  }>
) {
  let spendable = 0;
  let fixedReserve = 0;
  let ccAvailable = 0;
  let ccOutstanding = 0;
  let ccLimit = 0;
  let currency: Currency = "IDR";

  for (const account of accounts) {
    if (account.isActive === false) continue;
    currency = (account.currency as Currency) || currency;

    if (isLiabilityAccount(account.type as AccountType)) {
      const card = toCreditCardSummary(account);
      if (!card?.debitMode) continue;
      ccAvailable += card.available;
      ccOutstanding += card.outstanding;
      ccLimit += card.creditLimit;
      continue;
    }

    const bal = account.currentBalance ?? 0;
    if (isFixedReserveAccount(account.name)) fixedReserve += bal;
    else spendable += bal;
  }

  return {
    spendable,
    fixedReserve,
    totalCash: spendable + fixedReserve,
    ccAvailable,
    ccOutstanding,
    ccLimit,
    currency,
  };
}

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
      commandCenter,
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
        .sort({ date: -1, createdAt: -1, _id: -1 })
        .limit(8)
        .populate("accountId", "name")
        .populate("categoryId", "name"),
      Debt.find({ userId, status: "ACTIVE" }).limit(5),
      SavingsGoal.find({ userId, status: "ACTIVE" }),
      Account.find({ userId, isActive: true }),
      getDebtsDueThisMonth(userId, period, payCycleBuffer.currency),
      getSurvivalPlan(userId),
      getCommandCenter(userId, period).catch(() => null),
    ]);

    const goalsSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0);
    const goalsTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);
    const cashPockets = buildCashPockets(accounts);

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
      cashPockets,
      commandCenter,
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
