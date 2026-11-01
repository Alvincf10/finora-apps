import { WeeklyBudget } from "@/models/WeeklyBudget";
import { Category } from "@/models/Category";
import { Transaction } from "@/models/Transaction";
import { Account } from "@/models/Account";
import { User } from "@/models/User";
import { getWeekBounds } from "@/lib/financial/weekly-review";
import { percent } from "@/lib/money";
import { resolveReportingCurrency } from "@/lib/financial/metrics/compute-summary";
import type { Currency } from "@/types";

export function weekKeyFromBounds(week: {
  year: number;
  month: number;
  mondayDay: number;
}): string {
  return `${week.year}-${String(week.month).padStart(2, "0")}-${String(week.mondayDay).padStart(2, "0")}`;
}

export type WeeklyBudgetRow = {
  id: string;
  categoryId: string;
  categoryName: string;
  budgetAmount: number;
  actualAmount: number;
  remainingAmount: number;
  utilizationPercentage: number;
  currency: Currency;
  overBudget: boolean;
  warnBudget: boolean;
};

export async function getWeeklyBudgetOverview(
  userId: string,
  weekOffset = 0,
  now = new Date()
): Promise<{
  items: WeeklyBudgetRow[];
  weekKey: string;
  label: string;
  start: string;
  end: string;
  offset: number;
}> {
  const week = getWeekBounds(weekOffset, now);
  const weekKey = weekKeyFromBounds(week);

  const [user, accounts, budgets] = await Promise.all([
    User.findById(userId).select("baseCurrency").lean(),
    Account.find({ userId, isActive: true }).select("currency isActive").lean(),
    WeeklyBudget.find({ userId, weekKey }).lean(),
  ]);
  const { currency } = resolveReportingCurrency({
    baseCurrency: user?.baseCurrency as Currency | undefined,
    accounts,
  });

  const scoped = budgets.filter((b) => b.currency === currency);

  const expenses = await Transaction.find({
    userId,
    type: "EXPENSE",
    currency,
    date: { $gte: week.start, $lte: week.end },
  })
    .select("categoryId amount")
    .lean();

  const spentByCategory = new Map<string, number>();
  for (const tx of expenses) {
    if (!tx.categoryId) continue;
    const key = tx.categoryId.toString();
    spentByCategory.set(key, (spentByCategory.get(key) ?? 0) + tx.amount);
  }

  const categoryIds = scoped.map((b) => b.categoryId);
  const categories = await Category.find({ _id: { $in: categoryIds } }).lean();
  const nameMap = new Map(categories.map((c) => [c._id.toString(), c.name]));

  const items = scoped.map((budget) => {
    const categoryId = budget.categoryId.toString();
    const actualAmount = spentByCategory.get(categoryId) ?? 0;
    const remainingAmount = budget.amount - actualAmount;
    const utilizationPercentage = percent(actualAmount, budget.amount);
    return {
      id: budget._id.toString(),
      categoryId,
      categoryName: nameMap.get(categoryId) ?? "Unknown",
      budgetAmount: budget.amount as number,
      actualAmount,
      remainingAmount,
      utilizationPercentage,
      currency: budget.currency as Currency,
      overBudget: actualAmount > budget.amount,
      warnBudget: utilizationPercentage >= 80 && actualAmount <= budget.amount,
    };
  });

  items.sort((a, b) => a.categoryName.localeCompare(b.categoryName));

  return {
    items,
    weekKey,
    label: week.label,
    start: week.start.toISOString(),
    end: week.end.toISOString(),
    offset: weekOffset,
  };
}

export async function getWeeklyBudgetSpent(
  userId: string,
  categoryId: string,
  weekOffset = 0,
  now = new Date()
): Promise<{
  weekKey: string;
  label: string;
  budgetAmount: number;
  actualAmount: number;
  utilizationPercentage: number;
  currency: Currency;
  categoryName: string;
} | null> {
  const week = getWeekBounds(weekOffset, now);
  const weekKey = weekKeyFromBounds(week);
  const budget = await WeeklyBudget.findOne({
    userId,
    weekKey,
    categoryId,
  }).lean();
  if (!budget) return null;

  const cat = await Category.findById(categoryId).select("name").lean();
  const expenses = await Transaction.find({
    userId,
    type: "EXPENSE",
    currency: budget.currency,
    categoryId,
    date: { $gte: week.start, $lte: week.end },
  })
    .select("amount")
    .lean();

  const actualAmount = expenses.reduce((s, tx) => s + tx.amount, 0);
  return {
    weekKey,
    label: week.label,
    budgetAmount: budget.amount as number,
    actualAmount,
    utilizationPercentage: percent(actualAmount, budget.amount),
    currency: budget.currency as Currency,
    categoryName: cat?.name ?? "Unknown",
  };
}
