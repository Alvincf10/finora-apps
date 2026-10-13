import { startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Account } from "@/models/Account";
import { Transaction } from "@/models/Transaction";
import { Debt } from "@/models/Debt";
import { Budget } from "@/models/Budget";
import { Category } from "@/models/Category";
import { isLiabilityAccount } from "@/lib/financial/balances";
import { percent } from "@/lib/money";
import type { AccountType, Currency } from "@/types";

export interface Period {
  year: number;
  month: number;
}

export function getPeriodBounds(period: Period) {
  const start = startOfMonth(new Date(period.year, period.month - 1, 1));
  const end = endOfMonth(start);
  return { start, end };
}

export async function getFinancialSummary(userId: string, period: Period) {
  const { start, end } = getPeriodBounds(period);

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
      // credit card: positive currentBalance means amount owed
      creditCardLiability += Math.max(0, -account.currentBalance);
      if (account.currentBalance < 0) {
        // treat negative balance as liability magnitude already handled
      } else if (account.currentBalance > 0) {
        // some users track CC as positive owed
        creditCardLiability += account.currentBalance;
      }
    } else {
      totalAssets += account.currentBalance;
    }
  }

  const totalDebt =
    debts.reduce((sum, d) => sum + d.remainingAmount, 0) + creditCardLiability;
  const totalLiabilities = totalDebt;
  const netWorth = totalAssets - totalLiabilities;

  return {
    period,
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
  const { start, end } = getPeriodBounds(period);

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
  const { start, end } = getPeriodBounds(period);
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

export async function getCashFlowSeries(userId: string, months = 6) {
  const now = new Date();
  const series = [];

  for (let i = months - 1; i >= 0; i--) {
    const date = subMonths(now, i);
    const period = { year: date.getFullYear(), month: date.getMonth() + 1 };
    const { start, end } = getPeriodBounds(period);
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
      label: `${period.year}-${String(period.month).padStart(2, "0")}`,
      year: period.year,
      month: period.month,
      income,
      expense,
      net: income - expense,
    });
  }

  return series;
}
