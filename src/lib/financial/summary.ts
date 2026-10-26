import { Account } from "@/models/Account";
import { Transaction } from "@/models/Transaction";
import { Debt } from "@/models/Debt";
import { Budget } from "@/models/Budget";
import { Category } from "@/models/Category";
import { User } from "@/models/User";
import { percent } from "@/lib/money";
import {
  getPayCycleForPeriod,
  getUserPaydayDay,
  periodFromDate,
  shiftPeriodRef,
  type PeriodRef,
} from "@/lib/financial/pay-cycle";
import {
  computeFinancialSummaryMetrics,
  hasOtherCurrencies,
  resolveReportingCurrency,
} from "@/lib/financial/metrics/compute-summary";
import type { Currency } from "@/types";
import type { MetricQualityFlag } from "@/lib/financial/metrics/types";

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

export type FinancialSummary = {
  period: Period;
  cycleLabel: string;
  income: number;
  expense: number;
  netCashFlow: number;
  savings: number;
  /** null when income is 0 (FR-01.4) — was previously 0%. */
  savingsRate: number | null;
  totalDebt: number;
  debtPayment: number;
  debtRatio: number | null;
  totalAssets: number;
  liquidAssets: number;
  totalLiabilities: number;
  netWorth: number;
  currency: Currency;
  quality: MetricQualityFlag[];
};

export async function getFinancialSummary(
  userId: string,
  period: Period
): Promise<FinancialSummary> {
  const { start, end, label } = await resolvePeriodBounds(userId, period);

  const [user, accounts, transactions, debts] = await Promise.all([
    User.findById(userId).select("baseCurrency").lean(),
    Account.find({ userId, isActive: true }).lean(),
    Transaction.find({
      userId,
      date: { $gte: start, $lte: end },
    }).lean(),
    Debt.find({ userId, status: "ACTIVE" }).lean(),
  ]);

  const { currency, fallback } = resolveReportingCurrency({
    baseCurrency: user?.baseCurrency as Currency | undefined,
    accounts,
  });

  const mixed =
    hasOtherCurrencies(currency, accounts) ||
    hasOtherCurrencies(currency, transactions) ||
    hasOtherCurrencies(currency, debts);

  const computed = computeFinancialSummaryMetrics({
    currency,
    transactions,
    accounts,
    debts,
    mixedCurrencyExcluded: mixed,
  });

  const quality = [...computed.quality];
  if (fallback) quality.push("CURRENCY_FALLBACK");

  return {
    period,
    cycleLabel: label,
    income: computed.income,
    expense: computed.expense,
    netCashFlow: computed.netCashFlow,
    savings: computed.savings,
    savingsRate: computed.savingsRate,
    totalDebt: computed.totalLiabilities,
    debtPayment: computed.debtPayment,
    debtRatio: computed.debtRatio,
    totalAssets: computed.totalAssets,
    liquidAssets: computed.liquidAssets,
    totalLiabilities: computed.totalLiabilities,
    netWorth: computed.netWorth,
    currency: computed.currency,
    quality,
  };
}

export async function getExpenseBreakdown(userId: string, period: Period) {
  const { start, end } = await resolvePeriodBounds(userId, period);
  const [user, accounts] = await Promise.all([
    User.findById(userId).select("baseCurrency").lean(),
    Account.find({ userId, isActive: true }).select("currency isActive").lean(),
  ]);
  const { currency } = resolveReportingCurrency({
    baseCurrency: user?.baseCurrency as Currency | undefined,
    accounts,
  });

  const expenses = await Transaction.find({
    userId,
    type: "EXPENSE",
    currency,
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
  const [user, accounts] = await Promise.all([
    User.findById(userId).select("baseCurrency").lean(),
    Account.find({ userId, isActive: true }).select("currency isActive").lean(),
  ]);
  const { currency } = resolveReportingCurrency({
    baseCurrency: user?.baseCurrency as Currency | undefined,
    accounts,
  });

  const budgets = await Budget.find({
    userId,
    year: period.year,
    month: period.month,
    currency,
  }).lean();

  const expenses = await Transaction.find({
    userId,
    type: "EXPENSE",
    currency,
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

/** Last N pay cycles (not calendar months). Currency-scoped to user base. */
export async function getCashFlowSeries(userId: string, cycles = 6) {
  const [paydayDay, user, accounts] = await Promise.all([
    getUserPaydayDay(userId),
    User.findById(userId).select("baseCurrency").lean(),
    Account.find({ userId, isActive: true }).select("currency isActive").lean(),
  ]);
  const { currency } = resolveReportingCurrency({
    baseCurrency: user?.baseCurrency as Currency | undefined,
    accounts,
  });

  const current = periodFromDate(paydayDay, new Date());
  const series = [];

  for (let i = cycles - 1; i >= 0; i--) {
    const period = shiftPeriodRef(current as PeriodRef, i);
    const { start, end, label } = getPeriodBounds(period, paydayDay);
    const txs = await Transaction.find({
      userId,
      currency,
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
      currency,
    });
  }

  return series;
}
