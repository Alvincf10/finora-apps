import { Account } from "@/models/Account";
import { Transaction } from "@/models/Transaction";
import { Debt } from "@/models/Debt";
import { Budget } from "@/models/Budget";
import { Category } from "@/models/Category";
import { isLiabilityAccount } from "@/lib/financial/balances";
import { percent } from "@/lib/money";
import {
  getPayCycleForPeriod,
  getUserPaydayDay,
  periodFromDate,
  shiftPeriodRef,
  type PeriodRef,
} from "@/lib/financial/pay-cycle";
import type { AccountType, Currency } from "@/types";

export interface Period {
  year: number;
  month: number;
}

/**
 * Bounds for a period key = pay cycle of that month's payday
 * (not calendar 1st–end-of-month).
 */
export function getPeriodBounds(period: Period, paydayDay = 25) {
  const cycle = getPayCycleForPeriod(paydayDay, period);
  return { start: cycle.start, end: cycle.end, label: cycle.label, cycle };
}

export async function resolvePeriodBounds(userId: string, period: Period) {
  const paydayDay = await getUserPaydayDay(userId);
  return getPeriodBounds(period, paydayDay);
}

export async function getFinancialSummary(userId: string, period: Period) {
  const { start, end, label } = await resolvePeriodBounds(userId, period);

  const [accounts, transactions, debts] = await Promise.all([
    Account.find({ userId, isActive: true }).lean(),
    Transaction.find({
      userId,
      date: { $gte: start, $lte: end },
    }).lean(),
    Debt.find({ userId, status: "ACTIVE" }).lean(),
  ]);

  let income = 0;
  let expense = 0;
  let debtPayment = 0;

  for (const tx of transactions) {
    if (tx.type === "INCOME") {
      income += tx.amount;
    } else if (tx.type === "EXPENSE") {
      expense += tx.amount;
      if (tx.debtId) {
        debtPayment += tx.amount;
      }
    }
  }

  // Debt payments already counted in expense via linked transactions — do not subtract twice
  const netCashFlow = income - expense;
  const savings = netCashFlow;
  const savingsRate = percent(savings, income);
  const debtRatio = percent(debtPayment, income);

  let totalAssets = 0;
  let creditCardLiability = 0;

  for (const account of accounts) {
    if (isLiabilityAccount(account.type as AccountType)) {
      // CREDIT_CARD currentBalance = outstanding owed (positive).
      // Also accept legacy negative balances as liability magnitude.
      const bal = account.currentBalance ?? 0;
      creditCardLiability += Math.abs(bal);
    } else {
      totalAssets += account.currentBalance;
    }
  }

  // CREDIT_STATEMENT debts linked to a CC account mirror that card's
  // outstanding — count the card once, not debt + card.
  const debtPrincipal = debts.reduce((sum, d) => {
    const isLinkedCcStatement =
      d.obligationType === "CREDIT_STATEMENT" && d.linkedAccountId;
    if (isLinkedCcStatement) return sum;
    return sum + d.remainingAmount;
  }, 0);

  const totalDebt = debtPrincipal + creditCardLiability;
  const totalLiabilities = totalDebt;
  const netWorth = totalAssets - totalLiabilities;

  return {
    period,
    cycleLabel: label,
    income,
    expense,
    netCashFlow,
    savings,
    savingsRate,
    totalDebt,
    debtPayment,
    debtRatio,
    totalAssets,
    totalLiabilities,
    netWorth,
    currency: (accounts[0]?.currency as Currency) ?? "IDR",
  };
}

export async function getExpenseBreakdown(userId: string, period: Period) {
  const { start, end } = await resolvePeriodBounds(userId, period);

  const expenses = await Transaction.find({
    userId,
    type: "EXPENSE",
    date: { $gte: start, $lte: end },
  }).lean();

  const byCategory = new Map<string, number>();
  for (const tx of expenses) {
    const key = tx.categoryId?.toString() ?? "uncategorized";
    byCategory.set(key, (byCategory.get(key) ?? 0) + tx.amount);
  }

  const categoryIds = [...byCategory.keys()].filter((id) => id !== "uncategorized");
  const categories = await Category.find({ _id: { $in: categoryIds } }).lean();
  const nameMap = new Map(categories.map((c) => [c._id.toString(), c.name]));

  return [...byCategory.entries()]
    .map(([categoryId, amount]) => ({
      categoryId,
      name: nameMap.get(categoryId) ?? "Uncategorized",
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export async function getBudgetOverview(userId: string, period: Period) {
  const { start, end } = await resolvePeriodBounds(userId, period);
  const budgets = await Budget.find({
    userId,
    year: period.year,
    month: period.month,
  }).lean();

  const expenses = await Transaction.find({
    userId,
    type: "EXPENSE",
    date: { $gte: start, $lte: end },
  }).lean();

  const spentByCategory = new Map<string, number>();
  for (const tx of expenses) {
    if (!tx.categoryId) continue;
    const key = tx.categoryId.toString();
    spentByCategory.set(key, (spentByCategory.get(key) ?? 0) + tx.amount);
  }

  const categoryIds = budgets.map((b) => b.categoryId);
  const categories = await Category.find({ _id: { $in: categoryIds } }).lean();
  const nameMap = new Map(categories.map((c) => [c._id.toString(), c.name]));

  return budgets.map((budget) => {
    const categoryId = budget.categoryId.toString();
    const actualAmount = spentByCategory.get(categoryId) ?? 0;
    const remainingAmount = budget.amount - actualAmount;
    const utilizationPercentage = percent(actualAmount, budget.amount);

    return {
      id: budget._id.toString(),
      categoryId,
      categoryName: nameMap.get(categoryId) ?? "Unknown",
      budgetAmount: budget.amount,
      actualAmount,
      remainingAmount,
      utilizationPercentage,
      currency: budget.currency,
      overBudget: actualAmount > budget.amount,
    };
  });
}

/** Last N pay cycles (not calendar months). */
export async function getCashFlowSeries(userId: string, cycles = 6) {
  const paydayDay = await getUserPaydayDay(userId);
  const current = periodFromDate(paydayDay, new Date());
  const series = [];

  for (let i = cycles - 1; i >= 0; i--) {
    const period = shiftPeriodRef(current as PeriodRef, i);
    const { start, end, label } = getPeriodBounds(period, paydayDay);
    const txs = await Transaction.find({
      userId,
      date: { $gte: start, $lte: end },
      type: { $in: ["INCOME", "EXPENSE"] },
    }).lean();

    let income = 0;
    let expense = 0;
    for (const tx of txs) {
      if (tx.type === "INCOME") income += tx.amount;
      if (tx.type === "EXPENSE") expense += tx.amount;
    }

    series.push({
      label,
      year: period.year,
      month: period.month,
      income,
      expense,
      net: income - expense,
    });
  }

  return series;
}
